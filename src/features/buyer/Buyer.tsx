import { lazy, Suspense, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Boxes, Network, Plus, Route, ShoppingBasket, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { DEFAULT_TRANSPORT, runClusterCart, type DemandInput, type Grade, type RunResult, type SupplyCandidate, type Unit } from '@shared/clustercart'
import { supabase, SUPABASE_URL } from '@/lib/supabase'
import { useAuth } from '@/app/auth'
import { DISTRICT_CENTROIDS, INDIAN_STATES, useCommodities, useCommodityName, useVarieties } from '@/lib/catalog'
import { date, perUnit, qty, rupees, toPaise } from '@/lib/format'
import { friendlyError } from '@/lib/errors'
import { readPrefs, prefersReducedMotion } from '@/lib/prefs'
import { Badge, Button, Card, DemoBadge, EmptyState, ErrorState, LinkButton, Notice, PageHeader, PageLoader, SelectField, Stat, StatusBadge, TextAreaField, TextField, cx } from '@/components/ui'
import { OffersInbox } from '@/features/farmer/Farmer'
import { ClusterNetwork2D } from '@/scenes/ClusterNetwork2D'
import { webglAvailable } from '@/scenes/SplineScene'

const ClusterNetwork3D = lazy(() => import('@/scenes/ClusterNetwork3D'))

export function useMyDemand() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['demand', 'mine', user?.id], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('demand_requests').select('*').eq('buyer_id', user!.id).order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function BuyerOverviewPage() {
  const { t } = useTranslation()
  const demand = useMyDemand()
  const open = demand.data?.filter((d) => ['open', 'partially_filled'].includes(d.status)) ?? []
  return (
    <div>
      <PageHeader eyebrow={t('nav.buyer')} title={t('nav.buyer')} lead={t('demand.lead')} actions={<LinkButton to="/buyer/requirements"><Plus aria-hidden className="size-4" />{t('demand.create')}</LinkButton>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label={t('home.liveDemand')} value={open.length} />
        <Stat label={t('demand.filled')} value={demand.data?.filter((d) => d.status === 'filled').length ?? '–'} />
        <Stat label={t('nav.matching')} value={<Network aria-hidden className="size-7" />} tone="gold" />
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <LinkButton to="/marketplace" variant="secondary"><ShoppingBasket aria-hidden className="size-4" />{t('nav.marketplace')}</LinkButton>
        <LinkButton to="/matching" variant="secondary"><Network aria-hidden className="size-4" />{t('nav.matching')}</LinkButton>
        <LinkButton to="/buyer/purchases" variant="secondary"><Boxes aria-hidden className="size-4" />{t('nav.purchases')}</LinkButton>
      </div>
    </div>
  )
}

const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)

export function RequirementsPage() {
  const { t, i18n } = useTranslation()
  const { user, profile } = useAuth()
  const qc = useQueryClient()
  const demand = useMyDemand()
  const commodities = useCommodities()
  const varieties = useVarieties()
  const name = useCommodityName()
  const [showForm, setShowForm] = useState(false)
  const schema = z.object({
    commodity_id: z.coerce.number().int().positive(), variety_id: z.string().optional(), title: z.string().trim().min(3).max(120),
    min_grade: z.enum(['A', 'B', 'C', 'ungraded']), quantity: z.coerce.number().positive(), unit: z.enum(['kg', 'quintal', 'tonne']),
    max_price: z.string().optional(), delivery_from: z.string().min(10), delivery_until: z.string().min(10), delivery_state: z.string().min(2),
    delivery_district: z.string().trim().min(2), delivery_locality: z.string().max(120).optional(), max_transit_hours: z.string().optional(),
    buyer_type: z.string(), visibility: z.enum(['public', 'matched_only']), notes: z.string().max(500).optional(),
  }).refine((v) => v.delivery_until >= v.delivery_from, { path: ['delivery_until'] })
    .refine((v) => !v.max_price || !Number.isNaN(toPaise(v.max_price)), { path: ['max_price'] })
  type F = z.infer<typeof schema>
  const { register, handleSubmit, watch, reset, formState: { errors, isSubmitting } } = useForm<F>({
    resolver: zodResolver(schema) as never,
    defaultValues: { min_grade: 'B', unit: 'quintal', delivery_from: plusDays(2), delivery_until: plusDays(14), delivery_state: profile?.state ?? 'Madhya Pradesh', delivery_district: profile?.district ?? '', buyer_type: 'retailer', visibility: 'public', max_transit_hours: '48' },
  })
  const create = useMutation({
    mutationFn: async (v: F) => {
      const c = DISTRICT_CENTROIDS[v.delivery_district.trim()]
      const { error } = await supabase.from('demand_requests').insert({
        buyer_id: user!.id, commodity_id: v.commodity_id, variety_id: v.variety_id ? Number(v.variety_id) : null, title: v.title, min_grade: v.min_grade,
        quantity: v.quantity, unit: v.unit, max_price_paise_per_unit: v.max_price ? toPaise(v.max_price) : null, delivery_from: v.delivery_from,
        delivery_until: v.delivery_until, delivery_state: v.delivery_state, delivery_district: v.delivery_district.trim(), delivery_locality: v.delivery_locality || null,
        approx_lat: c?.[0] ?? null, approx_lng: c?.[1] ?? null, max_transit_hours: v.max_transit_hours ? Number(v.max_transit_hours) : null,
        buyer_type: v.buyer_type, visibility: v.visibility, notes: v.notes || null, status: 'open',
      })
      if (error) throw error
    },
    onSuccess: () => { toast.success(t('profile.saved')); reset(); setShowForm(false); void qc.invalidateQueries({ queryKey: ['demand'] }) },
    onError: (e) => toast.error(friendlyError(e, t)),
  })
  const cancel = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('demand_requests').update({ status: 'cancelled' }).eq('id', id); if (error) throw error },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['demand'] }), onError: (e) => toast.error(friendlyError(e, t)),
  })
  const cid = Number(watch('commodity_id'))
  return (
    <div>
      <PageHeader title={t('demand.title')} lead={t('demand.lead')} actions={<Button onClick={() => setShowForm((v) => !v)}><Plus aria-hidden className="size-4" />{t('demand.create')}</Button>} />
      {showForm && (
        <Card className="mb-6 p-5">
          <form className="grid gap-4 sm:grid-cols-3" onSubmit={handleSubmit((v) => create.mutate(v))} noValidate>
            <SelectField label={t('common.commodity')} {...register('commodity_id')} error={errors.commodity_id && t('errors.validation')}>
              <option value="">—</option>{commodities.data?.map((c) => <option key={c.id} value={c.id}>{i18n.language === 'hi' ? c.name_hi : c.name_en}</option>)}
            </SelectField>
            <SelectField label={t('common.variety')} optional {...register('variety_id')}><option value="">{t('common.any')}</option>{varieties.data?.filter((v) => v.commodity_id === cid).map((v) => <option key={v.id} value={v.id}>{v.name_en}</option>)}</SelectField>
            <SelectField label={t('demand.minGrade')} {...register('min_grade')}>{['A', 'B', 'C', 'ungraded'].map((g) => <option key={g}>{g}</option>)}</SelectField>
            <TextField className="sm:col-span-3" label={t('listing.titleField')} {...register('title')} error={errors.title && t('errors.validation')} />
            <TextField label={t('demand.quantity')} inputMode="decimal" {...register('quantity')} error={errors.quantity && t('errors.validation')} />
            <SelectField label={t('common.unit')} {...register('unit')}>{['kg', 'quintal', 'tonne'].map((u) => <option key={u}>{u}</option>)}</SelectField>
            <TextField label={`${t('demand.maxPrice')} (₹/${watch('unit')})`} optional inputMode="decimal" {...register('max_price')} error={errors.max_price && t('errors.validation')} />
            <TextField label={t('demand.deliveryFrom')} type="date" {...register('delivery_from')} />
            <TextField label={t('demand.deliveryUntil')} type="date" {...register('delivery_until')} error={errors.delivery_until && t('errors.validation')} />
            <TextField label={t('demand.maxTransit')} inputMode="numeric" optional {...register('max_transit_hours')} />
            <SelectField label={t('demand.deliveryState')} {...register('delivery_state')}>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</SelectField>
            <TextField label={t('demand.deliveryDistrict')} list="districts-d" {...register('delivery_district')} error={errors.delivery_district && t('errors.validation')} />
            <datalist id="districts-d">{Object.keys(DISTRICT_CENTROIDS).map((d) => <option key={d} value={d} />)}</datalist>
            <TextField label={t('demand.deliveryLocality')} optional {...register('delivery_locality')} />
            <SelectField label={t('demand.buyerType')} {...register('buyer_type')}>{['retailer', 'restaurant', 'hostel', 'hotel', 'canteen', 'processor', 'wholesaler', 'other'].map((b) => <option key={b}>{b}</option>)}</SelectField>
            <SelectField label={t('demand.visibility')} {...register('visibility')}><option value="public">{t('demand.public')}</option><option value="matched_only">{t('demand.matched_only')}</option></SelectField>
            <TextAreaField label={t('demand.notes')} optional {...register('notes')} />
            <div className="sm:col-span-3"><Button type="submit" loading={isSubmitting || create.isPending}>{t('common.submit')}</Button></div>
          </form>
        </Card>
      )}
      {demand.isLoading ? <PageLoader /> : demand.error ? <ErrorState message={friendlyError(demand.error, t)} /> : !demand.data?.length ? (
        <EmptyState icon={<ShoppingBasket aria-hidden />} title={t('demand.none')} body={t('demand.noneD')} action={<Button onClick={() => setShowForm(true)}>{t('demand.create')}</Button>} />
      ) : (
        <ul className="grid gap-4">
          {demand.data.map((d) => (
            <li key={d.id}>
              <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div>
                  <div className="flex flex-wrap gap-2"><Badge tone="gold">{name(d.commodity_id)}</Badge><StatusBadge status={d.status} label={t(`demand.${d.status}`, { defaultValue: d.status })} /><DemoBadge show={d.is_demo} /></div>
                  <h2 className="mt-2 text-lg font-extrabold">{d.title}</h2>
                  <p className="tabular text-sm text-charcoal-700">{qty(d.filled_quantity)} / {qty(d.quantity, d.unit)} · ≤ {perUnit(d.max_price_paise_per_unit, d.unit)} · {d.delivery_district} · {date(d.delivery_from)}–{date(d.delivery_until)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {['open', 'partially_filled'].includes(d.status) && <LinkButton to={`/matching?demand=${d.id}`}><Network aria-hidden className="size-4" />{t('demand.runMatch')}</LinkButton>}
                  {['open', 'partially_filled', 'draft'].includes(d.status) && <Button variant="danger" size="sm" onClick={() => cancel.mutate(d.id)}>{t('demand.cancel')}</Button>}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function PurchasesPage() {
  const { t } = useTranslation()
  return (
    <div>
      <PageHeader title={t('nav.purchases')} lead={t('offers.buyerLead')} actions={<LinkButton to="/orders" variant="secondary">{t('nav.orders')}</LinkButton>} />
      <OffersInbox side="buyer" />
    </div>
  )
}

// ---------------------------------------------------------------------------------- ClusterCart

async function localPreview(demandId: string, today: string): Promise<RunResult> {
  const { data: d, error } = await supabase.from('demand_requests').select('*').eq('id', demandId).single()
  if (error) throw error
  const [{ data: listings }, { data: c }] = await Promise.all([
    supabase.from('harvest_listings').select('*').eq('commodity_id', d.commodity_id).in('status', ['published', 'partially_reserved']).gt('available_quantity', 0).limit(200),
    supabase.from('commodities').select('shelf_life_days').eq('id', d.commodity_id).single(),
  ])
  const demand: DemandInput = {
    demandId: d.id, commodityId: d.commodity_id, varietyId: d.variety_id, minGrade: d.min_grade as Grade, unit: d.unit as Unit,
    remainingQuantity: Number(d.quantity) - Number(d.filled_quantity), maxPricePaisePerUnit: d.max_price_paise_per_unit, deliveryFrom: d.delivery_from,
    deliveryUntil: d.delivery_until, lat: d.approx_lat, lng: d.approx_lng, maxTransitHours: d.max_transit_hours, area: `${d.delivery_district}, ${d.delivery_state}`,
  }
  const supply: SupplyCandidate[] = (listings ?? []).filter((l) => l.farmer_id !== d.buyer_id).map((l) => ({
    listingId: l.id, farmerId: l.farmer_id, title: l.title, commodityId: l.commodity_id, varietyId: l.variety_id, grade: l.grade as Grade, unit: l.unit as Unit,
    availableQuantity: Number(l.available_quantity), minPricePaisePerUnit: l.min_price_paise_per_unit, askingPricePaisePerUnit: l.asking_price_paise_per_unit,
    sellerHandlingPaisePerUnit: l.seller_handling_paise_per_unit, availableFrom: l.available_from, availableUntil: l.available_until, harvestDate: l.harvest_date,
    shelfLifeDays: c?.shelf_life_days ?? 30, lat: l.approx_lat, lng: l.approx_lng, area: `${l.district}, ${l.state}`,
  }))
  return runClusterCart(demand, supply, DEFAULT_TRANSPORT, { today, minPoolingSaving: 0.05, minAllocationKg: 50 })
}

export function MatchingPage() {
  const { t } = useTranslation()
  const { hasRole, session } = useAuth()
  const [params, setParams] = useSearchParams()
  const demand = useMyDemand()
  const qc = useQueryClient()
  const demandId = params.get('demand') ?? ''
  const [view, setView] = useState<'2d' | '3d'>('2d')
  const [run, setRun] = useState<{ result: RunResult; runId: string | null; preview: boolean } | null>(null)
  const can3d = !readPrefs().disable3d && typeof window !== 'undefined' && webglAvailable()

  const exec = useMutation({
    mutationFn: async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/run-clustercart`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ demand_id: demandId }),
        })
        const body = await res.json().catch(() => ({}))
        if (res.ok) return { result: body.result as RunResult, runId: body.match_run_id as string, preview: false }
        if (res.status === 429) throw Object.assign(new Error('rate'), { status: 429 })
        if (res.status !== 404 && res.status < 500) throw Object.assign(new Error(body.error ?? 'error'), { hint: body.error })
      } catch (e) {
        if ((e as { status?: number }).status === 429 || (e as { hint?: string }).hint) throw e
      }
      // Server engine unreachable: compute a clearly-labelled, unsaved local preview with the same engine.
      return { result: await localPreview(demandId, new Date().toISOString().slice(0, 10)), runId: null, preview: true }
    },
    onSuccess: setRun,
    onError: (e) => toast.error(friendlyError(e, t)),
  })
  const send = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('send_match_offers', { p_match_run_id: run!.runId!, p_delivery_terms: 'buyer_pays_transport' })
      if (error) throw error
      return data as number
    },
    onSuccess: (n) => { toast.success(t('match.sent', { n })); void qc.invalidateQueries({ queryKey: ['offers'] }) },
    onError: (e) => toast.error(friendlyError(e, t)),
  })

  if (!hasRole('buyer')) return <div><PageHeader title={t('match.title')} lead={t('match.lead')} /><Notice tone="warn" title={t('match.needsBuyer')}><Link to="/dashboard">{t('onboarding.title')}</Link></Notice></div>
  const openDemand = demand.data?.filter((d) => ['open', 'partially_filled'].includes(d.status)) ?? []
  const r = run?.result
  return (
    <div>
      <PageHeader eyebrow={t('match.notAI')} title={t('match.title')} lead={t('match.lead')} />
      <Card className="flex flex-wrap items-end gap-3 p-5">
        <SelectField className="min-w-64 flex-1" label={t('match.pick')} value={demandId} onChange={(e) => { setParams(e.target.value ? { demand: e.target.value } : {}); setRun(null) }}>
          <option value="">—</option>
          {openDemand.map((d) => <option key={d.id} value={d.id}>{d.title} · {qty(Number(d.quantity) - Number(d.filled_quantity), d.unit)}</option>)}
        </SelectField>
        <Button disabled={!demandId} loading={exec.isPending} onClick={() => exec.mutate()}><Network aria-hidden className="size-4" />{t('match.run')}</Button>
        {!openDemand.length && !demand.isLoading && <LinkButton variant="secondary" to="/buyer/requirements">{t('demand.create')}</LinkButton>}
      </Card>

      {exec.isPending && <div className="mt-6"><PageLoader label={t('match.running')} /></div>}
      {r && (
        <div className="mt-6 grid gap-6">
          {run.preview ? <Notice tone="warn" title={t('match.preview')}>{t('match.functionUnavailable')}</Notice>
            : <p className="text-xs font-semibold text-charcoal-500">{t('match.stored', { id: run.runId?.slice(0, 8), v: r.algorithmVersion })}</p>}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={t('match.recommendation')} value={<span className={r.recommendation === 'pooled' ? 'text-gold-600' : ''}>{t(`match.${r.recommendation}`)}</span>} tone={r.recommendation === 'pooled' ? 'gold' : 'default'} />
            <Stat label={t('match.allocated')} value={`${qty(r.allocatedKg)} kg`} hint={`${t('match.unmatched')}: ${qty(r.unmatchedKg)} kg`} />
            <Stat label={t('match.separateCost')} value={rupees(r.separate.totalPaise, { whole: true })} hint={`${rupees(r.separate.perKgPaise)} ${t('match.perKg')}`} />
            <Stat label={t('match.pooledCost')} value={r.pooled ? rupees(r.pooled.costPaise, { whole: true }) : '–'} hint={r.pooled ? `${rupees(r.pooled.perKgPaise)} ${t('match.perKg')} · ${t('match.savings')} ${rupees(r.savingsPaise, { whole: true })}` : undefined} />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <Card className="p-4">
              <div className="mb-3 flex gap-2" role="tablist">
                <button role="tab" aria-selected={view === '2d'} className={cx('min-h-10 rounded-xl px-3 text-sm font-bold', view === '2d' ? 'bg-forest-700 text-white' : 'bg-forest-50')} onClick={() => setView('2d')}><Route aria-hidden className="mr-1 inline size-4" />{t('match.vis2d')}</button>
                <button role="tab" aria-selected={view === '3d'} disabled={!can3d} className={cx('min-h-10 rounded-xl px-3 text-sm font-bold disabled:opacity-50', view === '3d' ? 'bg-forest-700 text-white' : 'bg-forest-50')} onClick={() => setView('3d')}><Boxes aria-hidden className="mr-1 inline size-4" />{t('match.vis3d')}</button>
              </div>
              {view === '3d' && can3d ? (
                <div className="aspect-square overflow-hidden rounded-2xl"><Suspense fallback={<ClusterNetwork2D result={r} />}><ClusterNetwork3D result={r} animate={!prefersReducedMotion()} /></Suspense></div>
              ) : <ClusterNetwork2D result={r} />}
              {!can3d && <p className="mt-2 text-xs text-charcoal-500">{t('match.disable3d')}</p>}
              <p className="mt-3 text-xs text-charcoal-500">{t('match.estimateNote')}</p>
            </Card>
            <Card className="p-5">
              <h2 className="text-lg font-extrabold">{t('match.why')}</h2>
              <ul className="mt-3 grid gap-2 text-sm">{r.explanation.map((e) => <li key={e} className="rounded-xl bg-forest-50 p-3">{e}</li>)}</ul>
              {r.warnings.length > 0 && <ul className="mt-3 grid gap-1 text-sm text-warn-700">{r.warnings.map((w) => <li key={w}>⚠ {w}</li>)}</ul>}
              {r.pooled && (
                <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div><dt className="text-charcoal-500">{t('match.route')}</dt><dd className="font-bold">{r.pooled.stops.join(' → ')}</dd></div>
                  <div><dt className="text-charcoal-500">{t('match.vehicle')}</dt><dd className="font-bold">{r.pooled.vehicle}{r.pooled.trips > 1 ? ` ×${r.pooled.trips}` : ''}</dd></div>
                  <div><dt className="text-charcoal-500">{t('match.distance')}</dt><dd className="tabular font-bold">{r.pooled.distanceKm} km</dd></div>
                  <div><dt className="text-charcoal-500">{t('match.duration')}</dt><dd className="tabular font-bold">{r.pooled.durationHours} h</dd></div>
                </dl>
              )}
            </Card>
          </div>

          {r.allocations.length > 0 && (
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[44rem] text-left text-sm">
                <thead className="bg-forest-50"><tr>{[t('listing.title'), t('common.quantity'), t('common.price'), t('netback.gross'), t('netback.farmerNet'), t('match.separateCost'), t('match.pooledCost')].map((h) => <th key={h} className="px-4 py-3 font-bold">{h}</th>)}</tr></thead>
                <tbody>{r.allocations.map((a) => (
                  <tr key={a.listingId} className="border-t border-forest-100 align-top">
                    <td className="px-4 py-3"><Link to={`/marketplace/${a.listingId}`} className="font-bold">{a.title}</Link><p className="text-xs text-charcoal-500">{a.area} · ~{a.directDistanceKm} km</p><ul className="mt-1 text-xs text-charcoal-700">{a.reasons.map((x) => <li key={x}>✓ {x}</li>)}</ul></td>
                    <td className="tabular px-4 py-3">{qty(a.quantity, a.unit)}</td>
                    <td className="tabular px-4 py-3">{perUnit(a.pricePaisePerUnit, a.unit)}<p className="text-xs text-charcoal-500">{a.priceBasis.replace(/_/g, ' ')}</p></td>
                    <td className="tabular px-4 py-3">{rupees(a.grossPaise)}</td>
                    <td className="tabular px-4 py-3 font-bold text-forest-800">{rupees(a.farmerNetPaise)}</td>
                    <td className="tabular px-4 py-3">{rupees(a.separateTransportPaise)}</td>
                    <td className="tabular px-4 py-3">{r.pooled ? rupees(a.pooledTransportSharePaise) : '–'}</td>
                  </tr>))}
                </tbody>
              </table>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-forest-100 p-4">
                <p className="text-sm"><Truck aria-hidden className="mr-1 inline size-4" />{t('netback.landed')}: <strong className="tabular">{rupees(r.buyerLandedPerKgPaise)} / kg</strong></p>
                <Button disabled={run.preview || !run.runId} loading={send.isPending} onClick={() => send.mutate()}>{t('match.sendOffers')}</Button>
              </div>
            </Card>
          )}

          {r.exclusions.length > 0 && (
            <details className="card p-5">
              <summary className="cursor-pointer font-extrabold">{t('match.exclusions')} ({r.exclusions.length})</summary>
              <ul className="mt-3 grid gap-2 text-sm">{r.exclusions.map((x) => <li key={x.listingId + x.code} className="flex flex-wrap gap-2"><Badge tone="red">{x.code}</Badge><span className="font-semibold">{x.title}</span><span className="text-charcoal-700">{x.detail}</span></li>)}</ul>
            </details>
          )}
        </div>
      )}
      {!r && !exec.isPending && <div className="mt-6"><EmptyState icon={<Network aria-hidden />} title={t('match.pick')} body={t('match.estimateNote')} /></div>}
    </div>
  )
}
