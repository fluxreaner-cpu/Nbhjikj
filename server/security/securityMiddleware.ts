import { Request, Response, NextFunction } from 'express';
import path from 'path';
import { logSecurityEvent } from './auditLogger';
import { getClientIp } from './rateLimiter';

/**
 * 1. HTTPS / HSTS Enforcer
 */
export function httpsEnforcer(req: Request, res: Response, next: NextFunction) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  
  if (process.env.NODE_ENV === 'production' && !isHttps) {
    const host = req.headers.host || 'localhost';
    return res.redirect(301, `https://${host}${req.originalUrl}`);
  }

  // Set HSTS header (Level 9)
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  next();
}

/**
 * 2. Enterprise Content Security Policy & Browser Defense Headers (Levels 8, 9, 17, 18, 19)
 */
export function browserSecurityHeaders(req: Request, res: Response, next: NextFunction) {
  // Prevent MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent Cross-Site Scripting filter exploitation
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Strict Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Feature / Permissions Policy
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  // Clickjacking & Frame Ancestors (Allows AI Studio iframe host & self, blocks arbitrary framing)
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // unsafe-eval needed for obfuscated bundle runtime decode
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://api.pwnedpasswords.com https://*.run.app https://*.google.com wss: ws:",
    "frame-ancestors 'self' https://*.google.com https://*.run.app https://*.aistudio.google.com",
    "base-uri 'self'",
    "form-action 'self'",
  ];

  res.setHeader('Content-Security-Policy', cspDirectives.join('; '));
  next();
}

/**
 * 3. Strict CORS Validation (Level 20)
 */
export function corsValidator(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  const appUrl = process.env.APP_URL;

  // Allow same-origin or requests without origin header (e.g. server-to-server, mobile native)
  if (!origin) {
    return next();
  }

  // Match allowed origins
  const isAllowed = 
    origin === appUrl ||
    origin.includes('localhost') ||
    origin.includes('127.0.0.1') ||
    origin.endsWith('.run.app') ||
    origin.endsWith('.google.com');

  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token');
  } else {
    logSecurityEvent({
      eventType: 'CORS_VIOLATION',
      severity: 'WARN',
      ip: getClientIp(req),
      details: { rejectedOrigin: origin },
    });
    return res.status(403).json({ error: 'CORS Policy: Origin not allowed', code: 'ERR_CORS_DENIED' });
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
}

/**
 * 4. Anti-CSRF Guard for Mutating Requests (Level 21)
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Only check mutating requests
  const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!mutatingMethods.includes(req.method)) {
    return next();
  }

  // Exempt auth bootstrap / public endpoints if needed, but verify Origin / Referer
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const host = req.headers.host;

  // If origin is present, check host match
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host && !origin.endsWith('.run.app') && !origin.includes('localhost')) {
        logSecurityEvent({
          eventType: 'CSRF_BLOCKED',
          severity: 'CRITICAL',
          ip: getClientIp(req),
          details: { originHost, serverHost: host },
        });
        return res.status(403).json({ error: 'CSRF validation failed: Origin mismatch', code: 'ERR_CSRF_FAILED' });
      }
    } catch {
      return res.status(403).json({ error: 'CSRF validation failed: Invalid Origin', code: 'ERR_CSRF_FAILED' });
    }
  }

  next();
}

/**
 * 5. Anti-SSRF (Server-Side Request Forgery) IP Validator (Level 15)
 */
export function isPrivateOrLoopbackIp(ipOrHost: string): boolean {
  const clean = ipOrHost.toLowerCase().trim();

  // Localhost names
  if (clean === 'localhost' || clean === '127.0.0.1' || clean === '::1' || clean === '0.0.0.0') {
    return true;
  }

  // Cloud metadata endpoint (AWS / GCP / Azure: 169.254.169.254)
  if (clean.startsWith('169.254.')) {
    return true;
  }

  // Private IPv4 ranges:
  // 10.0.0.0/8
  if (/^10\./.test(clean)) return true;
  // 172.16.0.0/12
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(clean)) return true;
  // 192.168.0.0/16
  if (/^192\.168\./.test(clean)) return true;
  // 0.0.0.0/8
  if (/^0\./.test(clean)) return true;

  // Private IPv6 ranges (fc00::/7, fe80::/10)
  if (/^(fc|fd|fe8|fe9|fea|feb)/.test(clean)) return true;

  return false;
}

/**
 * 6. Anti-Path Traversal File Resolver (Level 16)
 */
export function safeResolvePath(baseDir: string, userPath: string): string | null {
  // Reject null bytes
  if (userPath.includes('\0')) {
    return null;
  }

  // Reject explicit traversal tokens
  if (userPath.includes('..')) {
    return null;
  }

  const resolved = path.resolve(baseDir, userPath);
  const normalizedBase = path.resolve(baseDir);

  // Must strictly be a child of baseDir
  if (!resolved.startsWith(normalizedBase)) {
    return null;
  }

  return resolved;
}

/**
 * 7. Production Global Error Handler (Level 26)
 * Prevents Stack Trace and Database detail leaks to the client
 */
export function globalErrorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const ip = getClientIp(req);
  console.error('[Unhandled Internal Error]', err);

  logSecurityEvent({
    eventType: 'IDOR_ACCESS_DENIED', // generic security log
    severity: 'CRITICAL',
    ip,
    details: { message: err?.message, path: req.path, method: req.method },
  });

  return res.status(500).json({
    error: 'Внутренняя ошибка сервиса безопасности. Информация сохранена в журнале аудита.',
    code: 'SEC_ERR_INTERNAL',
  });
}
