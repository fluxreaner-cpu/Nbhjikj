import React, { useState } from 'react';
import { 
  X, 
  Trash2, 
  ExternalLink, 
  Copy, 
  Check, 
  Layers, 
  Sparkles,
  TrendingDown
} from 'lucide-react';
import { Product, Language, Currency } from '../types';
import { translations } from '../i18n';
import { formatPrice } from '../utils/currency';

interface BuildPlannerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  wishlist: Product[];
  onRemoveItem: (productId: string) => void;
  onClearAll: () => void;
  language: Language;
  currency: Currency;
  onSelectProduct: (product: Product) => void;
}

export const BuildPlannerDrawer: React.FC<BuildPlannerDrawerProps> = ({
  isOpen,
  onClose,
  wishlist,
  onRemoveItem,
  onClearAll,
  language,
  currency,
  onSelectProduct,
}) => {
  const t = translations[language];
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const totalCostUsd = wishlist.reduce((acc, item) => acc + item.priceUsd, 0);
  const totalMsrpUsd = wishlist.reduce((acc, item) => acc + item.originalPriceUsd, 0);
  const totalSavingsUsd = Math.max(0, totalMsrpUsd - totalCostUsd);

  const handleCopySpec = () => {
    if (wishlist.length === 0) return;
    const specLines = wishlist.map(
      (item) => `• ${item.title} — ${formatPrice(item.priceUsd, currency)} (Best: ${item.offers.find(o => o.isLowest)?.marketplace || 'AliExpress'})`
    );
    const summary = [
      `BudgetTech Rig Build [${currency}]:`,
      ...specLines,
      `---`,
      `Total Cost: ${formatPrice(totalCostUsd, currency)}`,
      `Total Saved: ${formatPrice(totalSavingsUsd, currency)} vs Retail`,
    ].join('\n');

    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/70 backdrop-blur-md flex justify-end">
      {/* Background dismissal overlay */}
      <div 
        className="absolute inset-0"
        onClick={onClose}
      />

      {/* Drawer Container */}
      <div className="relative w-full max-w-md bg-[#0a0d17] border-l border-purple-500/20 shadow-2xl h-full flex flex-col z-10">
        
        {/* Drawer Header */}
        <div className="p-5 border-b border-purple-500/15 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">
                {t.plannerTitle}
              </h3>
              <p className="text-[11px] text-slate-400">
                {wishlist.length} {language === 'ru' ? 'комплектующих' : language === 'de' ? 'Komponenten' : language === 'uk' ? 'комплектуючих' : 'components'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {wishlist.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
              <Layers className="w-12 h-12 mb-3 stroke-[1.5] text-slate-600" />
              <p className="text-xs max-w-[240px] leading-relaxed">
                {t.plannerEmpty}
              </p>
            </div>
          ) : (
            wishlist.map((item) => {
              const lowestOffer = item.offers.find((o) => o.isLowest) || item.offers[0];
              return (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-slate-900/70 border border-slate-800/80 hover:border-purple-500/40 transition-all flex gap-3 group"
                >
                  <img
                    src={item.image}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-lg object-cover bg-slate-950 shrink-0 cursor-pointer"
                    onClick={() => onSelectProduct(item)}
                  />

                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <h4 
                        onClick={() => onSelectProduct(item)}
                        className="text-xs font-bold text-white hover:text-purple-300 transition-colors truncate cursor-pointer"
                      >
                        {item.title}
                      </h4>
                      <p className="text-[11px] text-emerald-400 font-mono mt-0.5">
                        {t.lowestOn} {lowestOffer.marketplace}
                      </p>
                    </div>

                    <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-800/60">
                      <span className="text-xs font-bold font-mono text-white tabular-nums">
                        {formatPrice(item.priceUsd, currency)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemoveItem(item.id)}
                        className="text-slate-500 hover:text-rose-400 p-1 transition-colors cursor-pointer"
                        title="Remove component"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Drawer Summary Footer */}
        {wishlist.length > 0 && (
          <div className="p-4 sm:p-5 border-t border-purple-500/15 bg-slate-950/90 space-y-3">
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span>{t.plannerTotal}</span>
                <span className="font-mono text-base font-extrabold text-white tabular-nums">
                  {formatPrice(totalCostUsd, currency)}
                </span>
              </div>
              <div className="flex items-center justify-between text-emerald-400">
                <span>{t.plannerSavings}</span>
                <span className="font-mono font-bold tabular-nums">
                  -{formatPrice(totalSavingsUsd, currency)}
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleCopySpec}
                className="flex-1 py-2.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition-all flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(168,85,247,0.3)] cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied!' : t.plannerExport}</span>
              </button>

              <button
                type="button"
                onClick={onClearAll}
                className="py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/30 text-slate-400 hover:text-rose-300 text-xs transition-all cursor-pointer"
                title={t.plannerClear}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
