import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { computeNetBack, convertPricePerUnit, type CostLine, type Unit } from '@shared/clustercart'
import { supabase } from '@/lib/supabase'
import { date, rupees, unitShort } from '@/lib/format'
import { Badge } from '@/components/ui'
import { NetBackChart } from '@/components/NetBackChart'

/** Latest dated mandi modal price for a commodity (benchmark only, never an offer). */
export function useMandiBenchmark(commodityId: number | null | undefined, state?: string | null) {
  return useQuery({
    queryKey: ['benchmark', commodityId, state],
    enabled: !!commodityId,
    queryFn: async () => {
      let q = supabase.from('market_price_observations').select('modal_paise,unit,observed_on,market,is_sample,price_type')
        .eq('commodity_id', commodityId!).eq('price_type', 'mandi_wholesale').order('observed_on', { ascending: false }).limit(1)
      if (state) q = q.eq('state', state)
      const { data } = await q
      return data?.[0] ?? null
    },
  })
}

export function NetBackPanel({ quantity, unit, pricePaisePerUnit, lines, commodityId, state, compact }: {
  quantity: number; unit: Unit; pricePaisePerUnit: number; lines: CostLine[]; commodityId?: number | null; state?: string | null; compact?: boolean
}) {
  const { t } = useTranslation()
  const bench = useMandiBenchmark(commodityId, state)
  if (!(quantity > 0) || !(pricePaisePerUnit > 0)) return null
  const nb = computeNetBack(quantity, pricePaisePerUnit, lines)
  const benchPerUnit = bench.data ? convertPricePerUnit(bench.data.modal_paise, bench.data.unit as Unit, unit) : null
  const row = (label: string, value: string, strong = false, sub?: string) => (
    <div className={`flex items-baseline justify-between gap-3 py-2 ${strong ? 'border-t border-forest-200 font-extrabold text-forest-800' : ''}`}>
      <span className="text-sm">{label}{sub && <span className="block text-xs font-normal text-charcoal-500">{sub}</span>}</span>
      <span className="tabular text-right">{value}</span>
    </div>
  )
  return (
    <section className="rounded-2xl border border-forest-200 bg-forest-50/60 p-4" aria-label={t('netback.title')}>
      <h3 className="mb-3 text-base font-extrabold">{t('netback.title')}</h3>
      <NetBackChart quantity={quantity} pricePaisePerUnit={pricePaisePerUnit} lines={lines} unitLabel={unitShort(unit)} />
      <details className="mt-3"><summary className="cursor-pointer text-sm font-bold text-forest-700">{t('common.view')}</summary>
      <div className="grid gap-x-8 sm:grid-cols-2">
        <div>
          {row(t('netback.gross'), rupees(nb.grossPaise))}
          {lines.filter((l) => l.payer === 'farmer').map((l) => row(`− ${l.label}`, rupees(l.amountPaise), false, `${l.certainty === 'estimated' ? t('common.estimated') : t('common.confirmed')} · ${l.source}`))}
          {row(t('netback.farmerNet'), rupees(nb.farmerNetPaise), true, `${rupees(nb.farmerNetPerUnitPaise)} ${t('netback.perUnit', { unit: unitShort(unit) })}`)}
        </div>
        <div>
          {row(t('netback.gross'), rupees(nb.grossPaise))}
          {lines.filter((l) => l.payer === 'buyer').map((l) => row(`+ ${l.label}`, rupees(l.amountPaise), false, `${l.certainty === 'estimated' ? t('common.estimated') : t('common.confirmed')} · ${l.source}`))}
          {row(t('netback.landed'), rupees(nb.buyerLandedTotalPaise), true, `${rupees(nb.buyerLandedPerUnitPaise)} ${t('netback.perUnit', { unit: unitShort(unit) })}`)}
        </div>
      </div>
      </details>
      {!compact && <p className="mt-2 text-xs text-charcoal-700">{t('netback.explain')}</p>}
      {benchPerUnit != null && bench.data && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-charcoal-700">
          <strong>{t('netback.benchmark')}:</strong> {rupees(Math.round(benchPerUnit))}/{unitShort(unit)} · {bench.data.market} · {date(bench.data.observed_on)}
          {bench.data.is_sample && <Badge tone="amber">SAMPLE</Badge>}
          <span>{t('netback.benchmarkNote')}</span>
        </p>
      )}
    </section>
  )
}
