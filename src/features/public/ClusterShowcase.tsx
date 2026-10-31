import { lazy, Suspense, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { ArrowRight, Info, Network, Truck } from 'lucide-react'
import { DEFAULT_TRANSPORT, runClusterCart, ALGORITHM_VERSION, type Grade, type Unit } from '@shared/clustercart'
import { supabase } from '@/lib/supabase'
import { qty, rupees, unitShort } from '@/lib/format'
import { readPrefs, prefersReducedMotion } from '@/lib/prefs'
import { webglAvailable } from '@/scenes/SplineScene'
import { ClusterNetwork2D } from '@/scenes/ClusterNetwork2D'
import { NetBackChart } from '@/components/NetBackChart'
import { Badge, cx } from '@/components/ui'
import type { ShowcaseRun } from '@/scenes/ClusterShowcase3D'

const ClusterShowcase3D = lazy(() => import('@/scenes/ClusterShowcase3D'))
const COLORS = ['#E5A63B', '#D4523F', '#8FBB9D']

/** Runs the real ClusterCart engine in the browser on the published (demo-labelled) requirements and listings. */
function useShowcaseRuns() {
  return useQuery({
    queryKey: ['showcase-runs'],
    staleTime: 60_000,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10)
      const [{ data: demand }, { data: listings }, { data: commodities }, { data: buyers }] = await Promise.all([
        supabase.from('demand_requests').select('*').eq('visibility', 'public').in('status', ['open', 'partially_filled']).order('created_at').limit(4),
        supabase.from('harvest_listings').select('*').in('status', ['published', 'partially_reserved']).gt('available_quantity', 0).limit(200),
        supabase.from('commodities').select('id,shelf_life_days,name_en'),
        supabase.from('profiles').select('id,display_name'),
      ])
      const life = new Map((commodities ?? []).map((c) => [c.id, c.shelf_life_days]))
      const names = new Map((buyers ?? []).map((b) => [b.id, b.display_name]))
      const runs: (ShowcaseRun & { demandTitle: string; isDemo: boolean; commodity: string })[] = []
      for (const [i, d] of (demand ?? []).entries()) {
        const supply = (listings ?? []).filter((l) => l.farmer_id !== d.buyer_id && l.commodity_id === d.commodity_id).map((l) => ({
          listingId: l.id, farmerId: l.farmer_id, title: l.title, commodityId: l.commodity_id, varietyId: l.variety_id, grade: l.grade as Grade, unit: l.unit as Unit,
          availableQuantity: Number(l.available_quantity), minPricePaisePerUnit: l.min_price_paise_per_unit, askingPricePaisePerUnit: l.asking_price_paise_per_unit,
          sellerHandlingPaisePerUnit: l.seller_handling_paise_per_unit, availableFrom: l.available_from, availableUntil: l.available_until, harvestDate: l.harvest_date,
          shelfLifeDays: life.get(l.commodity_id) ?? 30, lat: l.approx_lat, lng: l.approx_lng, area: `${l.district}, ${l.state}`,
        }))
        const result = runClusterCart({
          demandId: d.id, commodityId: d.commodity_id, varietyId: d.variety_id, minGrade: d.min_grade as Grade, unit: d.unit as Unit,
          remainingQuantity: Number(d.quantity) - Number(d.filled_quantity), maxPricePaisePerUnit: d.max_price_paise_per_unit, deliveryFrom: d.delivery_from,
          deliveryUntil: d.delivery_until, lat: d.approx_lat, lng: d.approx_lng, maxTransitHours: d.max_transit_hours, area: `${d.delivery_district}, ${d.delivery_state}`,
        }, supply, DEFAULT_TRANSPORT, { today, minPoolingSaving: 0.05, minAllocationKg: 50 })
        if (!result.allocations.length) continue
        const excludedCoords = result.exclusions.map((x) => { const s = supply.find((y) => y.listingId === x.listingId); return s?.lat != null ? { exclusion: x, lat: s.lat, lng: s.lng!, area: s.area } : null }).filter((x): x is NonNullable<typeof x> => !!x)
        runs.push({ key: d.id, result, buyer: names.get(d.buyer_id) ?? d.title, color: COLORS[i % COLORS.length], excludedCoords, demandTitle: d.title, isDemo: d.is_demo, commodity: (commodities ?? []).find((c) => c.id === d.commodity_id)?.name_en ?? '' })
      }
      return runs
    },
  })
}

export function ClusterShowcase() {
  const { t } = useTranslation()
  const runs = useShowcaseRuns()
  const [focus, setFocus] = useState<string | null>(null)
  const can3d = useMemo(() => typeof window !== 'undefined' && webglAvailable() && !readPrefs().disable3d, [])
  const list = runs.data ?? []
  const current = list.find((r) => r.key === focus) ?? list[0]
  if (runs.isLoading || !current) return null
  const r = current.result
  const top = [...r.allocations].sort((a, b) => b.quantityKg - a.quantityKg)[0]
  const pooled = r.recommendation === 'pooled'
  const maxCost = Math.max(r.separate.totalPaise, r.pooled?.costPaise ?? 0, 1)

  return (
    <section className="relative ml-[calc(50%-50vw)] w-screen overflow-hidden bg-forest-900 py-20 text-cream-100" aria-labelledby="cc-title">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="max-w-3xl">
          <p className="eyebrow text-gold-300">{t('match.notAI')}</p>
          <h2 id="cc-title" className="mt-3 text-4xl font-extrabold text-white sm:text-5xl">{t('showcase.title')}</h2>
          <p className="mt-4 text-lg text-cream-200">{t('showcase.lead')}</p>
        </div>
        <div className="mt-6 flex flex-wrap gap-2" role="tablist">
          {list.map((x) => (
            <button key={x.key} role="tab" aria-selected={x.key === current.key} onClick={() => setFocus(x.key)}
              className={cx('min-h-11 rounded-xl px-4 text-sm font-bold transition-colors', x.key === current.key ? 'bg-gold-400 text-forest-900' : 'bg-white/8 text-cream-100 hover:bg-white/15')}>
              {x.commodity} → {x.buyer.replace(' (demo)', '')}
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <div className="relative aspect-[4/3] overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0E2C1F] lg:aspect-auto lg:min-h-[560px]">
            {can3d ? (
              <Suspense fallback={<div className="grid h-full place-items-center p-6"><ClusterNetwork2D result={r} /></div>}>
                <ClusterShowcase3D runs={list} focus={current.key} animate={!prefersReducedMotion()} />
              </Suspense>
            ) : <div className="grid h-full place-items-center p-6"><ClusterNetwork2D result={r} /></div>}
            <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap gap-2">
              {current.isDemo && <Badge tone="amber">{t('common.demo')}</Badge>}
              <Badge tone="green">{ALGORITHM_VERSION}</Badge>
            </div>
            <p className="pointer-events-none absolute inset-x-4 bottom-4 text-xs text-cream-200/80"><Info aria-hidden className="mr-1 inline size-3.5" />{t('showcase.computed')}</p>
          </div>

          <motion.div key={current.key} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="grid content-start gap-5 rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6">
            <div>
              <p className="text-sm font-bold text-cream-200">{current.demandTitle}</p>
              <p className="mt-1 text-3xl font-extrabold text-white">{t(`match.${r.recommendation}`)}</p>
              <p className="mt-1 text-sm text-cream-200">{qty(r.allocatedKg / 100)} q {t('match.allocated').toLowerCase()} · {r.allocations.length} {t('showcase.farms')}{r.unmatchedKg > 0 ? ` · ${qty(r.unmatchedKg / 100)} q ${t('match.unmatched').toLowerCase()}` : ''}</p>
            </div>
            <div className="grid gap-3">
              {[{ k: 'separate', label: t('match.separateCost'), v: r.separate.totalPaise, per: r.separate.perKgPaise, color: 'bg-cream-200/40' },
                ...(r.pooled ? [{ k: 'pooled', label: t('match.pooledCost'), v: r.pooled.costPaise, per: r.pooled.perKgPaise, color: 'bg-gold-400' }] : [])].map((row) => (
                <div key={row.k}>
                  <div className="flex justify-between text-sm"><span className="font-bold">{row.label}</span><span className="tabular">{rupees(row.v, { whole: true })} · {rupees(row.per)}/kg</span></div>
                  <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-white/10"><motion.div className={`h-full rounded-full ${row.color}`} initial={{ width: 0 }} whileInView={{ width: `${(row.v / maxCost) * 100}%` }} viewport={{ once: true }} transition={{ duration: 1 }} /></div>
                </div>
              ))}
              {r.pooled && <p className={cx('text-sm font-bold', r.savingsPaise > 0 ? 'text-forest-300' : 'text-gold-300')}>{t('match.savings')}: {rupees(r.savingsPaise, { whole: true })}</p>}
            </div>
            <ul className="grid gap-2 text-sm text-cream-200">{r.explanation.slice(0, 2).map((e) => <li key={e} className="flex gap-2"><Network aria-hidden className="mt-0.5 size-4 shrink-0 text-gold-300" />{e}</li>)}</ul>
            {top && (
              <div className="rounded-2xl bg-white/[0.05] p-4">
                <p className="mb-3 text-sm font-bold">NetBack · {top.area.split(',')[0]} · {qty(top.quantity, top.unit)}</p>
                <NetBackChart dark quantity={top.quantity} pricePaisePerUnit={top.pricePaisePerUnit} unitLabel={unitShort(top.unit)}
                  lines={[
                    ...(top.sellerHandlingPaise > 0 ? [{ label: t('listing.handling'), payer: 'farmer' as const, amountPaise: top.sellerHandlingPaise, certainty: 'confirmed' as const, source: 'listing' }] : []),
                    { label: t('match.route'), payer: 'buyer' as const, amountPaise: pooled ? top.pooledTransportSharePaise : top.separateTransportPaise, certainty: 'estimated' as const, source: 'ClusterCart estimate' },
                  ]} />
              </div>
            )}
            <p className="flex items-center gap-2 text-xs text-cream-200/80"><Truck aria-hidden className="size-4" />{t('match.estimateNote')}</p>
            <Link to="/matching" className="inline-flex min-h-12 w-fit items-center gap-2 rounded-xl bg-gold-400 px-5 font-bold text-forest-900 no-underline hover:bg-gold-300">{t('showcase.cta')}<ArrowRight aria-hidden className="size-4" /></Link>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
