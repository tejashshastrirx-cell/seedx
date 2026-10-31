import { useTranslation } from 'react-i18next'
import { motion } from 'motion/react'
import { computeNetBack, type CostLine } from '@shared/clustercart'
import { rupees } from '@/lib/format'

/**
 * NetBack waterfall: two tracks on one scale so the difference is visible at a glance.
 * Farmer: sale value -> minus seller-paid costs -> estimated net. Buyer: sale value -> plus buyer-paid costs -> landed cost.
 */
export function NetBackChart({ quantity, pricePaisePerUnit, lines, unitLabel, dark = false }: { quantity: number; pricePaisePerUnit: number; lines: CostLine[]; unitLabel: string; dark?: boolean }) {
  const { t } = useTranslation()
  const nb = computeNetBack(quantity, pricePaisePerUnit, lines)
  const scale = Math.max(nb.buyerLandedTotalPaise, nb.grossPaise)
  const pct = (v: number) => `${(v / scale) * 100}%`
  const ease = [0.22, 1, 0.36, 1] as const
  const text = dark ? 'text-cream-100' : 'text-charcoal-900'
  const sub = dark ? 'text-cream-200/80' : 'text-charcoal-500'
  const track = dark ? 'bg-white/8' : 'bg-forest-50'
  return (
    <div className={`grid gap-5 ${text}`} role="img" aria-label={`${t('netback.farmerNet')} ${rupees(nb.farmerNetPaise)}; ${t('netback.landed')} ${rupees(nb.buyerLandedTotalPaise)}`}>
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="text-sm font-bold">{t('netback.farmer')}</p>
          <p className="tabular text-right"><span className="text-2xl font-extrabold text-forest-500">{rupees(nb.farmerNetPaise, { whole: true })}</span> <span className={`text-xs ${sub}`}>{t('netback.farmerNet')} · {rupees(nb.farmerNetPerUnitPaise)}/{unitLabel}</span></p>
        </div>
        <div className={`relative h-11 overflow-hidden rounded-xl ${track}`}>
          <motion.div className="absolute inset-y-0 left-0 rounded-xl bg-forest-500" initial={{ width: 0 }} whileInView={{ width: pct(nb.farmerNetPaise) }} viewport={{ once: true }} transition={{ duration: 1, ease }} />
          {nb.sellerCostsPaise > 0 && (
            <motion.div className="absolute inset-y-0 rounded-r-xl bg-[repeating-linear-gradient(135deg,#B42318_0_6px,#D4523F_6px_12px)]" style={{ left: pct(nb.farmerNetPaise) }}
              initial={{ width: 0 }} whileInView={{ width: pct(nb.sellerCostsPaise) }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.9, ease }} />
          )}
          <span className="absolute inset-y-0 left-3 flex items-center text-xs font-bold text-white">{t('netback.gross')} {rupees(nb.grossPaise, { whole: true })}</span>
        </div>
        <p className={`mt-1.5 text-xs ${sub}`}>{t('netback.gross')} {rupees(nb.grossPaise)} − {t('netback.sellerCosts')} {rupees(nb.sellerCostsPaise)} = <strong>{rupees(nb.farmerNetPaise)}</strong></p>
      </div>
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="text-sm font-bold">{t('netback.buyer')}</p>
          <p className="tabular text-right"><span className="text-2xl font-extrabold text-gold-400">{rupees(nb.buyerLandedTotalPaise, { whole: true })}</span> <span className={`text-xs ${sub}`}>{t('netback.landed')} · {rupees(nb.buyerLandedPerUnitPaise)}/{unitLabel}</span></p>
        </div>
        <div className={`relative h-11 overflow-hidden rounded-xl ${track}`}>
          <motion.div className="absolute inset-y-0 left-0 rounded-l-xl bg-forest-700" initial={{ width: 0 }} whileInView={{ width: pct(nb.grossPaise) }} viewport={{ once: true }} transition={{ duration: 1, ease }} />
          {nb.buyerCostsPaise > 0 && (
            <motion.div className="absolute inset-y-0 rounded-r-xl bg-gold-400" style={{ left: pct(nb.grossPaise) }} initial={{ width: 0 }} whileInView={{ width: pct(nb.buyerCostsPaise) }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.9, ease }} />
          )}
          <span className="absolute inset-y-0 left-3 flex items-center text-xs font-bold text-white">{t('netback.gross')} {rupees(nb.grossPaise, { whole: true })}</span>
        </div>
        <p className={`mt-1.5 text-xs ${sub}`}>{t('netback.gross')} {rupees(nb.grossPaise)} + {t('netback.buyerCosts')} {rupees(nb.buyerCostsPaise)} = <strong>{rupees(nb.buyerLandedTotalPaise)}</strong></p>
      </div>
    </div>
  )
}
