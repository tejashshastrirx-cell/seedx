import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bookmark, Flag, MapPin, ShoppingBasket, SlidersHorizontal, Sprout, X } from 'lucide-react'
import { toast } from 'sonner'
import type { Unit } from '@shared/clustercart'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/app/auth'
import { INDIAN_STATES, useCommodities, useCommodityName, useCropCategories, useVarieties, localName } from '@/lib/catalog'
import { clearRecent, pushRecent, readRecent } from '@/lib/searchHistory'
import { date, perUnit, qty, rupees, toPaise, unitShort } from '@/lib/format'
import { friendlyError } from '@/lib/errors'
import { Badge, Button, Card, DemoBadge, EmptyState, ErrorState, LinkButton, Notice, PageHeader, PageLoader, Pager, SelectField, Sheet, Skeleton, StatusBadge, TextAreaField, TextField, cx } from '@/components/ui'
import { NetBackPanel } from './NetBackPanel'
import { CommodityOptions } from '@/components/CommodityOptions'

const PAGE = 12

function useFilters() {
  const [params, setParams] = useSearchParams()
  const get = (k: string) => params.get(k) ?? ''
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k)
    if (!('page' in patch)) next.delete('page')
    setParams(next)
  }
  return { get, set, params }
}

export function MarketplacePage() {
  const { t, i18n } = useTranslation()
  const { get, set, params } = useFilters()
  const { user } = useAuth()
  const qc = useQueryClient()
  const name = useCommodityName()
  const commodities = useCommodities()
  const categories = useCropCategories()
  const [recent, setRecent] = useState(readRecent)
  const tab = get('tab') === 'demand' ? 'demand' : 'listings'
  const page = Number(get('page') || 0)
  const [sheet, setSheet] = useState(false)
  const filters = { cat: get('cat'), crop: get('crop'), state: get('state'), grade: get('grade'), q: get('q'), minQty: get('minQty'),
    minPrice: get('minPrice'), maxPrice: get('maxPrice'), harvestFrom: get('harvestFrom'), real: get('real') }
  const sort = get('sort') || 'newest'
  const catIds = filters.cat ? (commodities.data ?? []).filter((c) => c.category === filters.cat).map((c) => c.id) : null
  const rupeeFilter = (v: string) => (v && Number(v) > 0 ? Math.round(Number(v) * 100) : null)
  const saved = useQuery({
    queryKey: ['saved-searches', user?.id], enabled: !!user,
    queryFn: async () => { const { data, error } = await supabase.from('saved_searches').select('*').eq('scope', 'marketplace').order('created_at', { ascending: false }); if (error) throw error; return data },
  })
  const saveSearch = useMutation({
    mutationFn: async (label: string) => {
      const f = Object.fromEntries([...params.entries()].filter(([k]) => k !== 'page'))
      const { error } = await supabase.from('saved_searches').insert({ scope: 'marketplace', name: label.slice(0, 60), filters: f })
      if (error) throw error
    },
    onSuccess: () => { toast.success(t('market.searchSaved')); void qc.invalidateQueries({ queryKey: ['saved-searches'] }) },
    onError: (e) => toast.error(friendlyError(e, t)),
  })
  const deleteSearch = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('saved_searches').delete().eq('id', id); if (error) throw error },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['saved-searches'] }),
  })
  const applySaved = (f: unknown) => {
    const blank = Object.fromEntries(Object.keys(filters).map((k) => [k, ''])) as Record<string, string>
    set({ ...blank, sort: '', tab: '', ...((f ?? {}) as Record<string, string>) })
  }
  const setQuery = (v: string) => { if (v.trim()) setRecent(pushRecent(v)); set({ q: v }) }

  const listings = useQuery({
    queryKey: ['marketplace', tab, filters, sort, page, catIds?.join(',')],
    enabled: !filters.cat || !!commodities.data,
    queryFn: async () => {
      if (tab === 'listings') {
        let q = supabase.from('harvest_listings')
          .select('id,title,commodity_id,grade,unit,available_quantity,asking_price_paise_per_unit,min_price_paise_per_unit,district,state,available_until,status,is_demo,farmer_id', { count: 'exact' })
          .in('status', ['published', 'partially_reserved']).gte('available_until', new Date().toISOString().slice(0, 10))
        if (filters.crop) q = q.eq('commodity_id', Number(filters.crop))
        else if (catIds) q = q.in('commodity_id', catIds.length ? catIds : [-1])
        if (filters.state) q = q.eq('state', filters.state)
        if (filters.grade) q = q.eq('grade', filters.grade)
        if (filters.q) q = q.ilike('title', `%${filters.q.replace(/[%_]/g, '')}%`)
        if (Number(filters.minQty) > 0) q = q.gte('available_quantity', Number(filters.minQty))
        if (rupeeFilter(filters.minPrice)) q = q.gte('min_price_paise_per_unit', rupeeFilter(filters.minPrice)!)
        if (rupeeFilter(filters.maxPrice)) q = q.lte('min_price_paise_per_unit', rupeeFilter(filters.maxPrice)!)
        if (filters.harvestFrom) q = q.gte('harvest_date', filters.harvestFrom)
        if (filters.real) q = q.eq('is_demo', false)
        q = sort === 'price_asc' ? q.order('min_price_paise_per_unit', { ascending: true })
          : sort === 'price_desc' ? q.order('min_price_paise_per_unit', { ascending: false })
          : sort === 'qty_desc' ? q.order('available_quantity', { ascending: false })
          : sort === 'ending' ? q.order('available_until', { ascending: true })
          : q.order('created_at', { ascending: false })
        const { data, error, count } = await q.order('id').range(page * PAGE, page * PAGE + PAGE - 1)
        if (error) throw error
        return { rows: data, count: count ?? 0, kind: 'listings' as const }
      }
      let q = supabase.from('demand_requests')
        .select('id,title,commodity_id,min_grade,unit,quantity,filled_quantity,max_price_paise_per_unit,delivery_district,delivery_state,delivery_until,buyer_type,status,is_demo', { count: 'exact' })
        .eq('visibility', 'public').in('status', ['open', 'partially_filled'])
      if (filters.crop) q = q.eq('commodity_id', Number(filters.crop))
      else if (catIds) q = q.in('commodity_id', catIds.length ? catIds : [-1])
      if (filters.state) q = q.eq('delivery_state', filters.state)
      if (filters.grade) q = q.eq('min_grade', filters.grade)
      if (filters.q) q = q.ilike('title', `%${filters.q.replace(/[%_]/g, '')}%`)
      if (Number(filters.minQty) > 0) q = q.gte('quantity', Number(filters.minQty))
      if (rupeeFilter(filters.minPrice)) q = q.gte('max_price_paise_per_unit', rupeeFilter(filters.minPrice)!)
      if (rupeeFilter(filters.maxPrice)) q = q.lte('max_price_paise_per_unit', rupeeFilter(filters.maxPrice)!)
      if (filters.real) q = q.eq('is_demo', false)
      q = sort === 'price_asc' ? q.order('max_price_paise_per_unit', { ascending: true })
        : sort === 'price_desc' ? q.order('max_price_paise_per_unit', { ascending: false })
        : sort === 'qty_desc' ? q.order('quantity', { ascending: false })
        : sort === 'ending' ? q.order('delivery_until', { ascending: true })
        : q.order('created_at', { ascending: false })
      const { data, error, count } = await q.order('id').range(page * PAGE, page * PAGE + PAGE - 1)
      if (error) throw error
      return { rows: data, count: count ?? 0, kind: 'demand' as const }
    },
  })

  const active = Object.entries(filters).filter(([, v]) => v)
  const chipLabel = (k: string, v: string) => k === 'crop' ? name(Number(v))
    : k === 'cat' ? localName(categories.data?.find((c) => c.code === v)?.names, i18n.language, v)
    : k === 'real' ? t('market.hideDemo') : `${t(`market.chip.${k}`, { defaultValue: '' })} ${v}`.trim()
  const filterControls = (
    <div className="grid gap-4">
      <TextField key={filters.q} label={t('common.search')} defaultValue={filters.q} onKeyDown={(e) => { if (e.key === 'Enter') setQuery((e.target as HTMLInputElement).value) }}
        onBlur={(e) => e.target.value !== filters.q && setQuery(e.target.value)} placeholder="Sharbati…" />
      {recent.length > 0 && (
        <div className="-mt-2 flex flex-wrap items-center gap-1.5" aria-label={t('market.recent')}>
          <span className="text-xs font-semibold text-charcoal-500">{t('market.recent')}:</span>
          {recent.slice(0, 5).map((r) => <button key={r} type="button" className="rounded-full bg-cream-200 px-2.5 py-1 text-xs font-semibold" onClick={() => set({ q: r })}>{r}</button>)}
          <button type="button" className="text-xs underline" onClick={() => { clearRecent(); setRecent([]) }}>{t('market.clearRecent')}</button>
        </div>
      )}
      <SelectField label={t('market.sort')} value={sort} onChange={(e) => set({ sort: e.target.value === 'newest' ? '' : e.target.value })}>
        {['newest', 'price_asc', 'price_desc', 'qty_desc', 'ending'].map((k) => <option key={k} value={k}>{t(`market.sorts.${k}`)}</option>)}
      </SelectField>
      <SelectField label={t('market.category')} value={filters.cat} onChange={(e) => set({ cat: e.target.value, crop: '' })}>
        <option value="">{t('common.all')}</option>
        {categories.data?.map((c) => <option key={c.code} value={c.code}>{localName(c.names, i18n.language, c.code)}</option>)}
      </SelectField>
      <SelectField label={t('common.commodity')} value={filters.crop} onChange={(e) => set({ crop: e.target.value })}>
        <option value="">{t('common.all')}</option>
        <CommodityOptions />
      </SelectField>
      <SelectField label={t('listing.state')} value={filters.state} onChange={(e) => set({ state: e.target.value })}>
        <option value="">{t('common.all')}</option>
        {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
      </SelectField>
      <SelectField label={t('common.grade')} value={filters.grade} onChange={(e) => set({ grade: e.target.value })}>
        <option value="">{t('common.any')}</option>
        {['A', 'B', 'C', 'ungraded'].map((g) => <option key={g}>{g}</option>)}
      </SelectField>
      <TextField key={`mq${filters.minQty}`} label={t('market.minQty')} type="number" min={0} inputMode="decimal" defaultValue={filters.minQty} onBlur={(e) => e.target.value !== filters.minQty && set({ minQty: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <TextField key={`p1${filters.minPrice}`} label={t('market.minPrice')} type="number" min={0} inputMode="decimal" defaultValue={filters.minPrice} onBlur={(e) => e.target.value !== filters.minPrice && set({ minPrice: e.target.value })} />
        <TextField key={`p2${filters.maxPrice}`} label={t('market.maxPrice')} type="number" min={0} inputMode="decimal" defaultValue={filters.maxPrice} onBlur={(e) => e.target.value !== filters.maxPrice && set({ maxPrice: e.target.value })} />
      </div>
      <p className="-mt-2 text-xs text-charcoal-500">{t('market.priceHint')}</p>
      {tab === 'listings' && <TextField label={t('market.harvestFrom')} type="date" value={filters.harvestFrom} onChange={(e) => set({ harvestFrom: e.target.value })} />}
      <label className="flex min-h-11 items-center gap-2 text-sm font-bold"><input type="checkbox" className="size-5" checked={!!filters.real} onChange={(e) => set({ real: e.target.checked ? '1' : '' })} />{t('market.hideDemo')}</label>
      {user && (
        <div className="grid gap-2 border-t border-cream-200 pt-3">
          <Button size="sm" variant="secondary" disabled={saveSearch.isPending || !active.length || categories.isLoading} onClick={() => saveSearch.mutate(active.map(([k, v]) => chipLabel(k, v)).join(' · ') || t('market.allListings'))}>
            <Bookmark aria-hidden className="size-4" />{t('market.saveSearch')}
          </Button>
          {saved.data?.map((s) => (
            <div key={s.id} className="flex items-center gap-1">
              <button type="button" className="flex-1 truncate rounded-lg bg-forest-50 px-2 py-1.5 text-left text-sm font-semibold" onClick={() => applySaved(s.filters)}>{s.name}</button>
              <button type="button" className="grid size-9 place-items-center rounded-lg hover:bg-cream-200" aria-label={`${t('common.delete')} ${s.name}`} onClick={() => deleteSearch.mutate(s.id)}><X aria-hidden className="size-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div>
      <PageHeader eyebrow="SEED X" title={t('nav.marketplace')} lead={t('home.p1d')} actions={<LinkButton to="/farmer/harvest/new" variant="secondary"><Sprout aria-hidden className="size-4" />{t('listing.create')}</LinkButton>} />
      <div role="tablist" className="mb-5 inline-flex rounded-2xl bg-white p-1 shadow-[var(--shadow-card)]">
        {(['listings', 'demand'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => set({ tab: k === 'demand' ? 'demand' : '' })}
            className={cx('min-h-11 rounded-xl px-4 text-sm font-bold first-letter:uppercase', tab === k ? 'bg-forest-700 text-white' : 'text-forest-800')}>
            {k === 'listings' ? t('home.liveListings') : t('home.liveDemand')}
          </button>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[17rem_1fr]">
        <aside className="hidden lg:block" aria-label={t('common.filters')}><Card className="sticky top-24 p-5">{filterControls}</Card></aside>
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setSheet(true)}><SlidersHorizontal aria-hidden className="size-4" />{t('common.filters')}{active.length ? ` (${active.length})` : ''}</Button>
            <span className="text-sm font-semibold text-charcoal-700" aria-live="polite">{listings.data ? t('common.results', { count: listings.data.count }) : ''}</span>
            {active.map(([k, v]) => (
              <button key={k} onClick={() => set({ [k]: '' })} className="rounded-full bg-forest-100 px-3 py-1.5 text-xs font-bold text-forest-800" aria-label={`${t('common.reset')} ${k}`}>
                {chipLabel(k, v)} ✕
              </button>
            ))}
          </div>
          {listings.isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48" />)}</div>
            : listings.error ? <ErrorState message={friendlyError(listings.error, t)} onRetry={() => listings.refetch()} />
            : !listings.data?.rows.length ? <EmptyState icon={<ShoppingBasket aria-hidden />} title={t('common.noResults')} action={active.length ? <Button variant="secondary" onClick={() => set(Object.fromEntries(Object.keys(filters).map((k) => [k, ''])))}>{t('common.clearFilters')}</Button> : undefined} />
            : (
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {listings.data.kind === 'listings' ? listings.data.rows.map((l) => (
                  <li key={l.id}>
                    <Link to={`/marketplace/${l.id}`} className="card flex h-full flex-col p-5 no-underline hover:border-forest-300">
                      <div className="flex items-start justify-between gap-2"><Badge tone="green">{name(l.commodity_id)}</Badge><DemoBadge show={l.is_demo} /></div>
                      <h2 className="mt-3 text-lg font-extrabold text-forest-800">{l.title}</h2>
                      <p className="mt-1 flex items-center gap-1 text-sm text-charcoal-700"><MapPin aria-hidden className="size-4" />{l.district}, {l.state}</p>
                      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                        <div><dt className="text-charcoal-500">{t('listing.available')}</dt><dd className="tabular font-bold">{qty(l.available_quantity, l.unit)}</dd></div>
                        <div><dt className="text-charcoal-500">{t('common.grade')}</dt><dd className="font-bold">{l.grade}</dd></div>
                        <div className="col-span-2"><dt className="text-charcoal-500">{t('listing.askingPrice')}</dt><dd className="tabular text-lg font-extrabold text-forest-700">{perUnit(l.asking_price_paise_per_unit ?? l.min_price_paise_per_unit, l.unit)}</dd></div>
                      </dl>
                      <p className="mt-auto pt-3 text-xs text-charcoal-500">{t('listing.availableUntil')}: {date(l.available_until)}</p>
                    </Link>
                  </li>
                )) : listings.data.rows.map((d) => (
                  <li key={d.id}>
                    <div className="card flex h-full flex-col p-5">
                      <div className="flex items-start justify-between gap-2"><Badge tone="gold">{name(d.commodity_id)}</Badge><DemoBadge show={d.is_demo} /></div>
                      <h2 className="mt-3 text-lg font-extrabold">{d.title}</h2>
                      <p className="mt-1 flex items-center gap-1 text-sm text-charcoal-700"><MapPin aria-hidden className="size-4" />{d.delivery_district}, {d.delivery_state} · {d.buyer_type}</p>
                      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                        <div><dt className="text-charcoal-500">{t('demand.quantity')}</dt><dd className="tabular font-bold">{qty(Number(d.quantity) - Number(d.filled_quantity), d.unit)}</dd></div>
                        <div><dt className="text-charcoal-500">{t('demand.minGrade')}</dt><dd className="font-bold">{d.min_grade}</dd></div>
                        <div className="col-span-2"><dt className="text-charcoal-500">{t('demand.maxPrice')}</dt><dd className="tabular text-lg font-extrabold text-forest-700">{perUnit(d.max_price_paise_per_unit, d.unit)}</dd></div>
                      </dl>
                      <p className="mt-auto pt-3 text-xs text-charcoal-500">{t('demand.deliveryUntil')}: {date(d.delivery_until)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          <Pager page={page} hasMore={!!listings.data && (page + 1) * PAGE < listings.data.count} onPage={(p) => set({ page: String(p) })} />
        </div>
      </div>
      <Sheet open={sheet} onClose={() => setSheet(false)} title={t('common.filters')}
        footer={<><Button variant="secondary" className="flex-1" onClick={() => { set({ crop: '', state: '', grade: '', q: '' }); setSheet(false) }}>{t('common.reset')}</Button><Button className="flex-1" onClick={() => setSheet(false)}>{t('common.apply')}</Button></>}>
        {filterControls}
      </Sheet>
    </div>
  )
}

export function ListingDetailPage() {
  const { id } = useParams()
  const { t } = useTranslation()
  const { user, hasRole, emailVerified } = useAuth()
  const name = useCommodityName()
  const varieties = useVarieties()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [terms, setTerms] = useState('buyer_pays_transport')
  const [hours, setHours] = useState('72')
  const [message, setMessage] = useState('')
  const [reportOpen, setReportOpen] = useState(false)

  const q = useQuery({
    queryKey: ['listing', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('harvest_listings').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      if (!data) return null
      const [{ data: farmer }, { data: media }] = await Promise.all([
        supabase.from('profiles').select('display_name,district,state').eq('id', data.farmer_id).maybeSingle(),
        supabase.from('harvest_media').select('storage_path').eq('listing_id', data.id),
      ])
      return { l: data, farmer, media: media ?? [] }
    },
  })

  const submit = useMutation({
    mutationFn: async () => {
      const l = q.data!.l
      const { data, error } = await supabase.rpc('submit_offer', {
        p_listing_id: l.id, p_quantity: Number(quantity), p_price_paise_per_unit: toPaise(price), p_delivery_terms: terms,
        p_message: message || undefined, p_expires_in_hours: Number(hours),
      })
      if (error) throw error
      return data
    },
    onSuccess: () => { toast.success(t('listing.offerSent')); void qc.invalidateQueries({ queryKey: ['offers'] }); nav('/buyer/purchases') },
    onError: (e) => toast.error(friendlyError(e, t)),
  })

  if (q.isLoading) return <PageLoader />
  if (q.error) return <ErrorState message={friendlyError(q.error, t)} onRetry={() => q.refetch()} />
  if (!q.data) return <EmptyState title={t('errors.notFound')} action={<LinkButton to="/marketplace">{t('nav.marketplace')}</LinkButton>} />
  const { l, farmer, media } = q.data
  const unit = l.unit as Unit
  const pricePaise = toPaise(price)
  const qtyNum = Number(quantity)
  const own = user?.id === l.farmer_id
  const variety = varieties.data?.find((v) => v.id === l.variety_id)
  const canOffer = !!user && hasRole('buyer') && emailVerified && !own && ['published', 'partially_reserved'].includes(l.status)
  const storageUrl = (p: string) => supabase.storage.from('harvest-images').getPublicUrl(p).data.publicUrl

  return (
    <div>
      <Link to="/marketplace" className="text-sm font-semibold">← {t('nav.marketplace')}</Link>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card className="p-6">
          <div className="flex flex-wrap items-center gap-2"><Badge tone="green">{name(l.commodity_id)}</Badge>{variety && <Badge>{variety.name_en}</Badge>}<StatusBadge status={l.status} /><DemoBadge show={l.is_demo} /></div>
          <h1 className="mt-3 text-3xl font-extrabold">{l.title}</h1>
          <p className="mt-2 flex items-center gap-1 text-charcoal-700"><MapPin aria-hidden className="size-4" />{t('listing.publicArea')}: {[l.locality, l.district, l.state].filter(Boolean).join(', ')}</p>
          <p className="mt-1 text-sm text-charcoal-500">{t('listing.farmer')}: {farmer?.display_name ?? '-'}</p>
          {media.length > 0 && (
            <div className="mt-4 flex gap-3 overflow-x-auto">{media.map((m) => <img key={m.storage_path} src={storageUrl(m.storage_path)} alt={`${l.title}`} className="h-40 w-56 shrink-0 rounded-2xl object-cover" loading="lazy" />)}</div>
          )}
          <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {[[t('listing.available'), qty(l.available_quantity, l.unit)], [t('listing.reserved'), qty(l.reserved_quantity, l.unit)], [t('common.grade'), l.grade],
              [t('listing.askingPrice'), perUnit(l.asking_price_paise_per_unit, l.unit)], [t('listing.minPrice'), perUnit(l.min_price_paise_per_unit, l.unit)],
              [t('listing.harvestDate'), date(l.harvest_date)], [t('listing.availableFrom'), date(l.available_from)], [t('listing.availableUntil'), date(l.available_until)]].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-forest-50 p-3"><dt className="text-xs font-semibold text-charcoal-500">{k}</dt><dd className="tabular mt-0.5 font-extrabold text-forest-800">{v}</dd></div>
            ))}
          </dl>
          {l.quality_notes && <p className="mt-5 rounded-2xl bg-cream-50 p-4 text-charcoal-700">{l.quality_notes}</p>}
          <p className="mt-4 text-xs text-charcoal-500">{t('listing.approxHint')}</p>
          {user && !own && <Button variant="ghost" size="sm" className="mt-3" onClick={() => setReportOpen(true)}><Flag aria-hidden className="size-4" />{t('listing.report')}</Button>}
        </Card>

        <Card className="h-fit p-6">
          <h2 className="text-xl font-extrabold">{t('listing.makeOffer')}</h2>
          {own ? <div className="mt-4"><Notice tone="info" title={t('listing.yourListing')}><Link to="/farmer/offers">{t('nav.offers')}</Link></Notice></div>
            : !user ? <div className="mt-4"><Notice tone="info" title={t('listing.loginToOffer')}><Link to={`/login?next=/marketplace/${l.id}`}>{t('nav.login')}</Link></Notice></div>
            : !emailVerified ? <div className="mt-4"><Notice tone="warn" title={t('errors.EMAIL_NOT_VERIFIED')} /></div>
            : !hasRole('buyer') ? <div className="mt-4"><Notice tone="warn" title={t('errors.ROLE_REQUIRED')}><Link to="/dashboard">{t('onboarding.title')}</Link></Notice></div>
            : (
              <form className="mt-4 grid gap-4" onSubmit={(e) => { e.preventDefault(); submit.mutate() }}>
                <TextField label={t('listing.offerQty', { unit })} inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} required
                  hint={`${t('listing.available')}: ${qty(l.available_quantity, l.unit)}`} error={qtyNum > Number(l.available_quantity) ? t('errors.INSUFFICIENT_STOCK') : undefined} />
                <TextField label={t('listing.offerPrice', { unit })} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required
                  hint={l.min_price_paise_per_unit ? `${t('listing.minPrice')}: ${rupees(l.min_price_paise_per_unit)}/${unitShort(unit)}` : undefined}
                  error={price && Number.isNaN(pricePaise) ? t('errors.validation') : l.min_price_paise_per_unit && pricePaise < l.min_price_paise_per_unit ? t('errors.BELOW_MIN_PRICE') : undefined} />
                <SelectField label={t('listing.deliveryTerms')} value={terms} onChange={(e) => setTerms(e.target.value)}>
                  {['buyer_pays_transport', 'seller_pays_transport', 'buyer_collects'].map((k) => <option key={k} value={k}>{t(`listing.${k}`)}</option>)}
                </SelectField>
                <SelectField label={t('listing.expires')} value={hours} onChange={(e) => setHours(e.target.value)}>
                  {[24, 48, 72, 168].map((h) => <option key={h} value={h}>{t('listing.hours', { n: h })}</option>)}
                </SelectField>
                <TextAreaField label={t('demand.notes')} optional value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} />
                {qtyNum > 0 && pricePaise > 0 && (
                  <NetBackPanel compact quantity={qtyNum} unit={unit} pricePaisePerUnit={pricePaise} commodityId={l.commodity_id} state={l.state}
                    lines={l.seller_handling_paise_per_unit > 0 ? [{ label: t('listing.handling'), payer: 'farmer', amountPaise: Math.round(qtyNum * l.seller_handling_paise_per_unit), certainty: 'confirmed', source: 'listing' }] : []} />
                )}
                <Button type="submit" loading={submit.isPending} disabled={!canOffer}>{t('listing.makeOffer')}</Button>
              </form>
            )}
        </Card>
      </div>
      {reportOpen && <ReportSheet targetType="harvest_listing" targetId={l.id} onClose={() => setReportOpen(false)} />}
    </div>
  )
}

export function ReportSheet({ targetType, targetId, onClose }: { targetType: string; targetId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [reason, setReason] = useState('misleading')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Sheet open onClose={onClose} title={t('listing.report')} footer={
      <Button className="flex-1" loading={busy} onClick={async () => {
        setBusy(true)
        const { error } = await supabase.from('reports').insert({ reporter_id: user!.id, target_type: targetType, target_id: targetId, reason, details: details || null })
        setBusy(false)
        if (error) toast.error(friendlyError(error, t)); else { toast.success(t('help.sent')); onClose() }
      }}>{t('common.submit')}</Button>}>
      <div className="grid gap-4">
        <SelectField label={t('admin.reason')} value={reason} onChange={(e) => setReason(e.target.value)}>
          {['misleading', 'fraud', 'abusive', 'prohibited', 'duplicate', 'other'].map((r) => <option key={r}>{r}</option>)}
        </SelectField>
        <TextAreaField label={t('help.message')} optional value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} />
      </div>
    </Sheet>
  )
}
