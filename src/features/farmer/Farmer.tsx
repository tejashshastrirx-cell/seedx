import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, LocateFixed, Package, Plus, Sprout, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import type { Unit } from '@shared/clustercart'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/app/auth'
import { DISTRICT_CENTROIDS, INDIAN_STATES, useCommodities, useCommodityName, useVarieties } from '@/lib/catalog'
import { date, dateTime, perUnit, qty, rupees, toPaise, unitShort } from '@/lib/format'
import { friendlyError } from '@/lib/errors'
import { newIdempotencyKey } from '@/lib/idempotency'
import { Badge, Button, Card, DemoBadge, EmptyState, ErrorState, LinkButton, Notice, PageHeader, PageLoader, SelectField, Sheet, Stat, StatusBadge, TextAreaField, TextField } from '@/components/ui'
import { NetBackPanel } from '@/features/marketplace/NetBackPanel'
import { Bar } from '@/components/motion'

export function useMyListings() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['listings', 'mine', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('harvest_listings').select('*').eq('farmer_id', user!.id).order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function FarmerOverviewPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const listings = useMyListings()
  const offers = useQuery({
    queryKey: ['offers', 'farmer-open', user?.id], enabled: !!user,
    queryFn: async () => (await supabase.from('offers').select('id', { count: 'exact', head: true }).eq('farmer_id', user!.id).eq('status', 'submitted').eq('proposed_by', 'buyer')).count ?? 0,
  })
  const totals = useMemo(() => {
    const rows = listings.data ?? []
    return { open: rows.filter((r) => ['published', 'partially_reserved'].includes(r.status)).length, reserved: rows.reduce((t, r) => t + (Number(r.reserved_quantity) > 0 ? 1 : 0), 0), sold: rows.filter((r) => Number(r.sold_quantity) > 0).length }
  }, [listings.data])
  return (
    <div>
      <PageHeader eyebrow={t('nav.farmer')} title={t('nav.farmer')} lead={t('listing.myLead')} actions={<LinkButton to="/farmer/harvest/new"><Plus aria-hidden className="size-4" />{t('listing.create')}</LinkButton>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('home.liveListings')} value={totals.open} />
        <Stat label={t('offers.yourMove')} value={offers.data ?? '–'} tone="gold" />
        <Stat label={t('listing.reserved')} value={totals.reserved} />
        <Stat label={t('listing.sold')} value={totals.sold} />
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <LinkButton to="/farmer/harvest" variant="secondary"><Sprout aria-hidden className="size-4" />{t('nav.harvest')}</LinkButton>
        <LinkButton to="/farmer/offers" variant="secondary"><Package aria-hidden className="size-4" />{t('nav.offers')}</LinkButton>
        <LinkButton to="/farmer/earnings" variant="secondary"><Wallet aria-hidden className="size-4" />{t('nav.earnings')}</LinkButton>
      </div>
    </div>
  )
}

export function HarvestListPage() {
  const { t } = useTranslation()
  const listings = useMyListings()
  const name = useCommodityName()
  const qc = useQueryClient()
  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('harvest_listings').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['listings'] }),
    onError: (e) => toast.error(friendlyError(e, t)),
  })
  if (listings.isLoading) return <PageLoader />
  if (listings.error) return <ErrorState message={friendlyError(listings.error, t)} onRetry={() => listings.refetch()} />
  return (
    <div>
      <PageHeader title={t('listing.myTitle')} lead={t('listing.myLead')} actions={<LinkButton to="/farmer/harvest/new"><Plus aria-hidden className="size-4" />{t('listing.create')}</LinkButton>} />
      {!listings.data?.length ? <EmptyState icon={<Sprout aria-hidden />} title={t('listing.noListings')} body={t('listing.noListingsD')} action={<LinkButton to="/farmer/harvest/new">{t('listing.create')}</LinkButton>} /> : (
        <ul className="grid gap-4">
          {listings.data.map((l) => {
            const total = Number(l.total_quantity)
            const pct = (n: number) => (n / total) * 100
            return (
              <li key={l.id}>
                <Card className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap gap-2"><Badge tone="green">{name(l.commodity_id)}</Badge><StatusBadge status={l.status} /><DemoBadge show={l.is_demo} /></div>
                      <h2 className="mt-2 text-xl font-extrabold"><Link to={`/marketplace/${l.id}`} className="no-underline">{l.title}</Link></h2>
                      <p className="text-sm text-charcoal-700">{l.district}, {l.state} · {perUnit(l.asking_price_paise_per_unit, l.unit)} · {t('listing.availableUntil')} {date(l.available_until)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!['sold', 'withdrawn', 'expired'].includes(l.status) && <LinkButton to={`/farmer/harvest/${l.id}/edit`} variant="secondary" size="sm">{t('common.edit')}</LinkButton>}
                      {l.status === 'draft' && <Button size="sm" onClick={() => setStatus.mutate({ id: l.id, status: 'published' })}>{t('listing.publish')}</Button>}
                      {['published', 'partially_reserved'].includes(l.status) && <Button size="sm" variant="secondary" onClick={() => setStatus.mutate({ id: l.id, status: 'paused' })}>{t('listing.pause')}</Button>}
                      {l.status === 'paused' && <Button size="sm" onClick={() => setStatus.mutate({ id: l.id, status: 'published' })}>{t('listing.resume')}</Button>}
                      {['draft', 'published', 'paused'].includes(l.status) && Number(l.reserved_quantity) === 0 && <Button size="sm" variant="danger" onClick={() => setStatus.mutate({ id: l.id, status: 'withdrawn' })}>{t('listing.withdraw')}</Button>}
                    </div>
                  </div>
                  <div className="mt-4" aria-label="stock">
                    <div className="flex h-3 overflow-hidden rounded-full bg-forest-100">
                      <Bar className="bg-forest-500" pct={pct(Number(l.available_quantity))} />
                      <Bar className="bg-gold-400" pct={pct(Number(l.reserved_quantity))} />
                      <Bar className="bg-charcoal-500" pct={pct(Number(l.sold_quantity))} />
                    </div>
                    <p className="tabular mt-2 flex flex-wrap gap-x-4 text-sm">
                      <span><span className="mr-1 inline-block size-2 rounded-full bg-forest-500" />{t('listing.available')} {qty(l.available_quantity, l.unit)}</span>
                      <span><span className="mr-1 inline-block size-2 rounded-full bg-gold-400" />{t('listing.reserved')} {qty(l.reserved_quantity, l.unit)}</span>
                      <span><span className="mr-1 inline-block size-2 rounded-full bg-charcoal-500" />{t('listing.sold')} {qty(l.sold_quantity, l.unit)}</span>
                    </p>
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

const today = () => new Date().toISOString().slice(0, 10)
const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)

export function HarvestFormPage() {
  const { id } = useParams()
  const { t, i18n } = useTranslation()
  const { user, profile } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const commodities = useCommodities()
  const varieties = useVarieties()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const existing = useQuery({
    queryKey: ['listing-edit', id], enabled: !!id,
    queryFn: async () => {
      const [{ data: l }, { data: p }, { data: media }] = await Promise.all([
        supabase.from('harvest_listings').select('*').eq('id', id!).single(),
        supabase.from('harvest_pickup_locations').select('*').eq('listing_id', id!).maybeSingle(),
        supabase.from('harvest_media').select('*').eq('listing_id', id!),
      ])
      return { l, p, media: media ?? [] }
    },
  })

  const schema = z.object({
    commodity_id: z.coerce.number().int().positive(),
    variety_id: z.string().optional(),
    title: z.string().trim().min(3).max(120),
    grade: z.enum(['A', 'B', 'C', 'ungraded']),
    quality_notes: z.string().max(500).optional(),
    unit: z.enum(['kg', 'quintal', 'tonne']),
    total_quantity: z.coerce.number().positive().max(10_000_000),
    min_price: z.string().optional(),
    asking_price: z.string().optional(),
    handling: z.string().optional(),
    harvest_date: z.string().optional(),
    available_from: z.string().min(10),
    available_until: z.string().min(10),
    state: z.string().min(2),
    district: z.string().trim().min(2).max(80),
    locality: z.string().max(120).optional(),
    approx_lat: z.string().optional(),
    approx_lng: z.string().optional(),
    pickup_address: z.string().max(300).optional(),
    pickup_phone: z.string().regex(/^[0-9+ -]{6,20}$/).or(z.literal('')).optional(),
  }).refine((v) => v.available_until >= v.available_from, { path: ['available_until'] })
    .refine((v) => !v.min_price || !Number.isNaN(toPaise(v.min_price)), { path: ['min_price'] })
    .refine((v) => !v.asking_price || !Number.isNaN(toPaise(v.asking_price)), { path: ['asking_price'] })
    .refine((v) => !v.min_price || !v.asking_price || toPaise(v.asking_price) >= toPaise(v.min_price), { path: ['asking_price'] })
  type F = z.infer<typeof schema>

  const l = existing.data?.l
  const p = existing.data?.p
  const values: Partial<F> | undefined = l ? {
    commodity_id: l.commodity_id, variety_id: l.variety_id ? String(l.variety_id) : '', title: l.title, grade: l.grade as F['grade'], quality_notes: l.quality_notes ?? '',
    unit: l.unit as F['unit'], total_quantity: Number(l.total_quantity), min_price: l.min_price_paise_per_unit ? String(l.min_price_paise_per_unit / 100) : '',
    asking_price: l.asking_price_paise_per_unit ? String(l.asking_price_paise_per_unit / 100) : '', handling: l.seller_handling_paise_per_unit ? String(l.seller_handling_paise_per_unit / 100) : '',
    harvest_date: l.harvest_date ?? '', available_from: l.available_from, available_until: l.available_until, state: l.state, district: l.district, locality: l.locality ?? '',
    approx_lat: l.approx_lat != null ? String(l.approx_lat) : '', approx_lng: l.approx_lng != null ? String(l.approx_lng) : '',
    pickup_address: p?.address_line ?? '', pickup_phone: p?.contact_phone ?? '',
  } : undefined
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<F>({
    resolver: zodResolver(schema) as never,
    values: values as F | undefined,
    defaultValues: { grade: 'A', unit: 'quintal', available_from: today(), available_until: plusDays(30), state: profile?.state ?? 'Madhya Pradesh', district: profile?.district ?? '' },
  })
  const commodityId = Number(watch('commodity_id'))

  async function save(v: F, status: 'draft' | 'published') {
    const centroid = DISTRICT_CENTROIDS[v.district.trim()]
    const lat = v.approx_lat ? Number(v.approx_lat) : centroid?.[0] ?? null
    const lng = v.approx_lng ? Number(v.approx_lng) : centroid?.[1] ?? null
    const row = {
      commodity_id: v.commodity_id, variety_id: v.variety_id ? Number(v.variety_id) : null, title: v.title, grade: v.grade, quality_notes: v.quality_notes || null,
      unit: v.unit, total_quantity: v.total_quantity, min_price_paise_per_unit: v.min_price ? toPaise(v.min_price) : null,
      asking_price_paise_per_unit: v.asking_price ? toPaise(v.asking_price) : null, seller_handling_paise_per_unit: v.handling ? toPaise(v.handling) : 0,
      harvest_date: v.harvest_date || null, available_from: v.available_from, available_until: v.available_until, state: v.state, district: v.district.trim(),
      locality: v.locality || null, approx_lat: lat, approx_lng: lng,
    }
    let listingId = id
    if (id) {
      const { error } = await supabase.from('harvest_listings').update(l?.status === 'draft' ? { ...row, status } : row).eq('id', id)
      if (error) throw error
    } else {
      listingId = crypto.randomUUID()
      const { error } = await supabase.from('harvest_listings').insert({ ...row, id: listingId, farmer_id: user!.id, status })
      if (error) throw error
    }
    if (v.pickup_address || v.pickup_phone) {
      const pickup = { address_line: v.pickup_address || null, contact_phone: v.pickup_phone || null }
      const { error } = p
        ? await supabase.from('harvest_pickup_locations').update(pickup).eq('listing_id', listingId!)
        : await supabase.from('harvest_pickup_locations').insert({ ...pickup, listing_id: listingId!, farmer_id: user!.id })
      if (error) throw error
    }
    return listingId!
  }

  const onSubmit = (status: 'draft' | 'published') => handleSubmit(async (v) => {
    try {
      const lid = await save(v, status)
      await qc.invalidateQueries({ queryKey: ['listings'] })
      toast.success(t('profile.saved'))
      nav(id ? '/farmer/harvest' : `/farmer/harvest/${lid}/edit`)
    } catch (e) { toast.error(friendlyError(e, t)) }
  })

  async function upload(file: File) {
    if (!id || !user) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { toast.error(t('listing.photoHint')); return }
    setUploading(true)
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type]
    const path = `${user.id}/${id}/${crypto.randomUUID()}.${ext}` // server-generated safe path, never user-supplied
    const { error } = await supabase.storage.from('harvest-images').upload(path, file, { contentType: file.type, upsert: false })
    if (!error) {
      const { error: e2 } = await supabase.from('harvest_media').insert({ listing_id: id, farmer_id: user.id, storage_path: path })
      if (e2) toast.error(friendlyError(e2, t)); else void existing.refetch()
    } else toast.error(friendlyError(error, t))
    setUploading(false)
  }

  if (id && existing.isLoading) return <PageLoader />
  return (
    <div>
      <PageHeader title={id ? t('listing.edit') : t('listing.create')} lead={t('listing.approxHint')} />
      <form className="grid gap-6" onSubmit={(e) => e.preventDefault()} noValidate>
        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <SelectField label={t('common.commodity')} {...register('commodity_id')} error={errors.commodity_id && t('errors.validation')} disabled={!!l && l.status !== 'draft'}>
            <option value="">—</option>
            {commodities.data?.map((c) => <option key={c.id} value={c.id}>{i18n.language === 'hi' ? `${c.name_hi} (${c.name_en})` : c.name_en}</option>)}
          </SelectField>
          <SelectField label={t('common.variety')} optional {...register('variety_id')}>
            <option value="">—</option>
            {varieties.data?.filter((v) => v.commodity_id === commodityId).map((v) => <option key={v.id} value={v.id}>{v.name_en}</option>)}
          </SelectField>
          <TextField className="sm:col-span-2" label={t('listing.titleField')} hint={t('listing.titleHint')} {...register('title')} error={errors.title && t('errors.validation')} />
          <SelectField label={t('common.grade')} {...register('grade')}>{['A', 'B', 'C', 'ungraded'].map((g) => <option key={g}>{g}</option>)}</SelectField>
          <TextAreaField label={t('listing.quality')} optional {...register('quality_notes')} />
        </Card>
        <Card className="grid gap-4 p-5 sm:grid-cols-3">
          <TextField label={t('listing.total')} inputMode="decimal" {...register('total_quantity')} error={errors.total_quantity && t('errors.validation')}
            hint={l ? `${t('listing.reserved')}: ${qty(l.reserved_quantity)} · ${t('listing.sold')}: ${qty(l.sold_quantity)}` : undefined} />
          <SelectField label={t('common.unit')} {...register('unit')} disabled={!!l && l.status !== 'draft'}>{['kg', 'quintal', 'tonne'].map((u) => <option key={u}>{u}</option>)}</SelectField>
          <div />
          <TextField label={`${t('listing.minPrice')} (₹/${unitShort(watch('unit') ?? 'quintal')})`} inputMode="decimal" optional hint={t('listing.minPriceHint')} {...register('min_price')} error={errors.min_price && t('errors.validation')} />
          <TextField label={`${t('listing.askingPrice')} (₹/${unitShort(watch('unit') ?? 'quintal')})`} inputMode="decimal" optional {...register('asking_price')} error={errors.asking_price && t('errors.validation')} />
          <TextField label={`${t('listing.handling')} (₹/${unitShort(watch('unit') ?? 'quintal')})`} inputMode="decimal" optional hint={t('listing.handlingHint')} {...register('handling')} />
        </Card>
        <Card className="grid gap-4 p-5 sm:grid-cols-3">
          <TextField label={t('listing.harvestDate')} type="date" optional {...register('harvest_date')} />
          <TextField label={t('listing.availableFrom')} type="date" {...register('available_from')} />
          <TextField label={t('listing.availableUntil')} type="date" {...register('available_until')} error={errors.available_until && t('errors.validation')} />
        </Card>
        <Card className="grid gap-4 p-5 sm:grid-cols-3">
          <SelectField label={t('listing.state')} {...register('state')}>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</SelectField>
          <TextField label={t('listing.district')} list="districts" {...register('district')} error={errors.district && t('errors.validation')} />
          <datalist id="districts">{Object.keys(DISTRICT_CENTROIDS).map((d) => <option key={d} value={d} />)}</datalist>
          <TextField label={t('listing.locality')} optional {...register('locality')} />
          <div className="flex items-end gap-2 sm:col-span-3">
            <Button type="button" variant="secondary" size="sm" onClick={() => navigator.geolocation?.getCurrentPosition((pos) => {
              setValue('approx_lat', pos.coords.latitude.toFixed(2)); setValue('approx_lng', pos.coords.longitude.toFixed(2))
            })}><LocateFixed aria-hidden className="size-4" />{t('listing.useMyLocation')}</Button>
            <span className="text-sm text-charcoal-500">{watch('approx_lat') ? `≈ ${watch('approx_lat')}, ${watch('approx_lng')}` : ''}</span>
          </div>
        </Card>
        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <h2 className="text-lg font-extrabold sm:col-span-2">{t('listing.pickupTitle')}</h2>
          <TextField label={t('listing.pickupAddress')} optional {...register('pickup_address')} />
          <TextField label={t('listing.pickupPhone')} optional inputMode="tel" {...register('pickup_phone')} error={errors.pickup_phone && t('errors.validation')} />
        </Card>
        {id && (
          <Card className="p-5">
            <h2 className="text-lg font-extrabold">{t('listing.photos')}</h2>
            <div className="mt-3 flex flex-wrap gap-3">
              {existing.data?.media.map((m) => <img key={m.id} src={supabase.storage.from('harvest-images').getPublicUrl(m.storage_path).data.publicUrl} alt="" className="size-28 rounded-2xl object-cover" />)}
              <button type="button" onClick={() => fileRef.current?.click()} className="grid size-28 place-items-center rounded-2xl border-2 border-dashed border-forest-300 text-forest-700" disabled={uploading}>
                <span className="grid place-items-center gap-1 text-xs font-bold"><Camera aria-hidden className="size-6" />{t('listing.addPhoto')}</span>
              </button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </div>
            <p className="field-hint">{t('listing.photoHint')}</p>
          </Card>
        )}
        <div className="sticky bottom-20 z-10 flex flex-wrap gap-3 rounded-2xl bg-cream-100/95 p-2 lg:bottom-4">
          {(!l || l.status === 'draft') && <Button type="button" variant="secondary" loading={isSubmitting} onClick={onSubmit('draft')}>{t('listing.saveDraft')}</Button>}
          <Button type="button" loading={isSubmitting} onClick={onSubmit('published')}>{!l || l.status === 'draft' ? t('listing.publish') : t('common.save')}</Button>
        </div>
      </form>
    </div>
  )
}

export function OffersInbox({ side }: { side: 'farmer' | 'buyer' }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const qc = useQueryClient()
  const nav = useNavigate()
  const [counter, setCounter] = useState<{ id: string; unit: string } | null>(null)
  const [counterPrice, setCounterPrice] = useState('')
  const keys = useRef(new Map<string, string>())
  const offers = useQuery({
    queryKey: ['offers', side, user?.id], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('offers')
        .select('*, harvest_listings(title,commodity_id,state,seller_handling_paise_per_unit,min_price_paise_per_unit)')
        .eq(side === 'farmer' ? 'farmer_id' : 'buyer_id', user!.id).order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      return data
    },
  })
  const names = useQuery({
    queryKey: ['profiles', offers.data?.map((o) => (side === 'farmer' ? o.buyer_id : o.farmer_id)).join()], enabled: !!offers.data?.length,
    queryFn: async () => {
      const ids = [...new Set(offers.data!.map((o) => (side === 'farmer' ? o.buyer_id : o.farmer_id)))]
      const { data } = await supabase.from('profiles').select('id,display_name').in('id', ids)
      return Object.fromEntries((data ?? []).map((p) => [p.id, p.display_name]))
    },
  })
  const invalidate = () => { void qc.invalidateQueries({ queryKey: ['offers'] }); void qc.invalidateQueries({ queryKey: ['listings'] }); void qc.invalidateQueries({ queryKey: ['orders'] }) }
  const accept = useMutation({
    mutationFn: async (offerId: string) => {
      // One idempotency key per offer per page session: double-clicks and retries replay the same result.
      if (!keys.current.has(offerId)) keys.current.set(offerId, newIdempotencyKey('accept'))
      const { data, error } = await supabase.rpc('accept_offer', { p_offer_id: offerId, p_idempotency_key: keys.current.get(offerId)! })
      if (error) throw error
      return data as { ok: boolean; order_id?: string; order_number?: string; replayed?: boolean; error?: string }
    },
    onSuccess: (r) => {
      invalidate()
      if (!r.ok) { toast.error(t('offers.expired')); return }
      toast.success(r.replayed ? t('offers.replayed') : t('offers.acceptedToast', { n: r.order_number }))
      nav(`/orders/${r.order_id}`)
    },
    onError: (e) => toast.error(friendlyError(e, t)),
  })
  const respond = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'reject' | 'withdraw' }) => {
      const { error } = await supabase.rpc('respond_offer', { p_offer_id: id, p_action: action })
      if (error) throw error
    },
    onSuccess: invalidate, onError: (e) => toast.error(friendlyError(e, t)),
  })
  const counterM = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('counter_offer', { p_offer_id: counter!.id, p_price_paise_per_unit: toPaise(counterPrice) })
      if (error) throw error
    },
    onSuccess: () => { setCounter(null); setCounterPrice(''); invalidate() }, onError: (e) => toast.error(friendlyError(e, t)),
  })

  if (offers.isLoading) return <PageLoader />
  if (offers.error) return <ErrorState message={friendlyError(offers.error, t)} onRetry={() => offers.refetch()} />
  if (!offers.data?.length) return <EmptyState icon={<Package aria-hidden />} title={t('offers.none')} body={t('offers.noneD')} />
  return (
    <>
      <ul className="grid gap-4">
        {offers.data.map((o) => {
          const listing = o.harvest_listings as unknown as { title: string; commodity_id: number; state: string; seller_handling_paise_per_unit: number } | null
          const myMove = o.status === 'submitted' && o.proposed_by !== side
          const handling = Math.round(Number(o.quantity) * (listing?.seller_handling_paise_per_unit ?? 0))
          const lines = [
            ...(handling > 0 ? [{ label: t('listing.handling'), payer: 'farmer' as const, amountPaise: handling, certainty: 'confirmed' as const, source: 'listing' }] : []),
            ...(o.transport_estimate_paise > 0 && o.delivery_terms !== 'buyer_collects' ? [{ label: t('match.route'), payer: (o.delivery_terms === 'seller_pays_transport' ? 'farmer' : 'buyer') as 'farmer' | 'buyer', amountPaise: o.transport_estimate_paise, certainty: 'estimated' as const, source: o.transport_estimate_source ?? 'estimate' }] : []),
          ]
          return (
            <li key={o.id}>
              <Card className={`p-5 ${myMove ? 'ring-2 ring-gold-300' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><StatusBadge status={o.status} label={t(`offers.${o.status}`)} />{myMove ? <Badge tone="gold">{t('offers.yourMove')}</Badge> : o.status === 'submitted' && <Badge>{t('offers.theirMove')}</Badge>}<Badge>{t('offers.version', { n: o.version })}</Badge></div>
                    <h2 className="mt-2 text-lg font-extrabold">{listing?.title}</h2>
                    <p className="text-sm text-charcoal-700">{t('offers.from')}: {names.data?.[side === 'farmer' ? o.buyer_id : o.farmer_id] ?? '…'} · {dateTime(o.created_at)} · {t(`listing.${o.delivery_terms}`)}</p>
                    {o.message && <p className="mt-1 text-sm italic text-charcoal-700">“{o.message}”</p>}
                    {o.status_reason && <p className="mt-1 text-sm text-danger-600">{o.status_reason}</p>}
                  </div>
                  <p className="tabular text-right"><span className="block text-2xl font-extrabold text-forest-800">{perUnit(o.price_paise_per_unit, o.unit)}</span><span className="text-sm font-semibold">{qty(o.quantity, o.unit)} · {rupees(Math.round(Number(o.quantity) * o.price_paise_per_unit))}</span></p>
                </div>
                {o.status === 'submitted' && <div className="mt-4"><NetBackPanel compact quantity={Number(o.quantity)} unit={o.unit as Unit} pricePaisePerUnit={o.price_paise_per_unit} lines={lines} commodityId={listing?.commodity_id} state={listing?.state} /></div>}
                <div className="mt-4 flex flex-wrap gap-2">
                  {myMove && <Button onClick={() => accept.mutate(o.id)} loading={accept.isPending && accept.variables === o.id}>{t('offers.accept')}</Button>}
                  {myMove && <Button variant="secondary" onClick={() => setCounter({ id: o.id, unit: o.unit })}>{t('offers.counter')}</Button>}
                  {myMove && <Button variant="danger" onClick={() => respond.mutate({ id: o.id, action: 'reject' })}>{t('offers.reject')}</Button>}
                  {o.status === 'submitted' && !myMove && <Button variant="ghost" onClick={() => respond.mutate({ id: o.id, action: 'withdraw' })}>{t('offers.withdraw')}</Button>}
                  {o.status === 'accepted' && <OrderLink offerId={o.id} />}
                </div>
              </Card>
            </li>
          )
        })}
      </ul>
      <Sheet open={!!counter} onClose={() => setCounter(null)} title={t('offers.counter')}
        footer={<Button className="flex-1" loading={counterM.isPending} disabled={Number.isNaN(toPaise(counterPrice)) || !counterPrice} onClick={() => counterM.mutate()}>{t('common.submit')}</Button>}>
        <TextField label={t('offers.counterPrice', { unit: counter?.unit ?? '' })} inputMode="decimal" value={counterPrice} onChange={(e) => setCounterPrice(e.target.value)} />
      </Sheet>
    </>
  )
}

function OrderLink({ offerId }: { offerId: string }) {
  const { t } = useTranslation()
  const q = useQuery({ queryKey: ['orders', 'by-offer', offerId], queryFn: async () => (await supabase.from('orders').select('id,order_number').eq('offer_id', offerId).maybeSingle()).data })
  return q.data ? <LinkButton variant="secondary" to={`/orders/${q.data.id}`}>{t('orders.number')} {q.data.order_number}</LinkButton> : null
}

export function FarmerOffersPage() {
  const { t } = useTranslation()
  return <div><PageHeader title={t('offers.title')} lead={t('offers.farmerLead')} /><OffersInbox side="farmer" /></div>
}

export function FarmerEarningsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const q = useQuery({
    queryKey: ['orders', 'earnings', user?.id], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('orders').select('id,order_number,status,quantity,unit,gross_paise,created_at,is_demo,order_cost_lines(payer,amount_paise)').eq('farmer_id', user!.id).order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
  if (q.isLoading) return <PageLoader />
  if (q.error) return <ErrorState message={friendlyError(q.error, t)} />
  const rows = (q.data ?? []).map((o) => {
    const seller = (o.order_cost_lines as unknown as { payer: string; amount_paise: number }[]).filter((l) => l.payer === 'farmer').reduce((s, l) => s + l.amount_paise, 0)
    return { ...o, net: o.gross_paise - seller }
  })
  const done = rows.filter((r) => ['delivered', 'completed'].includes(r.status))
  const pending = rows.filter((r) => !['delivered', 'completed', 'cancelled'].includes(r.status))
  return (
    <div>
      <PageHeader title={t('nav.earnings')} lead={t('netback.explain')} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={`${t('netback.farmerNet')} · ${t('orders.delivered')}`} value={rupees(done.reduce((s, r) => s + r.net, 0), { whole: true })} />
        <Stat label={`${t('netback.farmerNet')} · ${t('orders.confirmed')}`} value={rupees(pending.reduce((s, r) => s + r.net, 0), { whole: true })} tone="gold" />
        <Stat label={t('nav.orders')} value={rows.length} />
      </div>
      {rows.length === 0 ? <div className="mt-6"><EmptyState icon={<Wallet aria-hidden />} title={t('orders.none')} /></div> : (
        <Card className="mt-6 overflow-x-auto p-0">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="bg-forest-50 text-charcoal-700"><tr>{[t('orders.number'), t('common.status'), t('common.quantity'), t('netback.gross'), t('netback.farmerNet')].map((h) => <th key={h} className="px-4 py-3 font-bold">{h}</th>)}</tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className="border-t border-forest-100">
                <td className="px-4 py-3"><Link to={`/orders/${r.id}`} className="font-bold">{r.order_number}</Link> <DemoBadge show={r.is_demo} /></td>
                <td className="px-4 py-3"><StatusBadge status={r.status} label={t(`orders.${r.status}`)} /></td>
                <td className="tabular px-4 py-3">{qty(r.quantity, r.unit)}</td>
                <td className="tabular px-4 py-3">{rupees(r.gross_paise)}</td>
                <td className="tabular px-4 py-3 font-extrabold text-forest-800">{rupees(r.net)}</td>
              </tr>))}
            </tbody>
          </table>
        </Card>
      )}
      <Notice tone="info" title={t('netback.title')}>{t('netback.explain')}</Notice>
    </div>
  )
}
