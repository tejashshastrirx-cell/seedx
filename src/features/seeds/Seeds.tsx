import { useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, Package, Plus, ShieldQuestion, SlidersHorizontal, Sprout } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/app/auth'
import { INDIAN_STATES, useCommodityName } from '@/lib/catalog'
import { date, dateTime, qty, rupees, toPaise } from '@/lib/format'
import { friendlyError } from '@/lib/errors'
import { newIdempotencyKey } from '@/lib/idempotency'
import { Badge, Button, Card, DemoBadge, EmptyState, ErrorState, LinkButton, Notice, PageHeader, PageLoader, SelectField, Sheet, Skeleton, StatusBadge, TextAreaField, TextField, cx } from '@/components/ui'
import { CommodityOptions } from '@/components/CommodityOptions'

type SeedRow = { id: string; seller_id: string; commodity_id: number; variety_name: string; brand: string; pack_size: number; pack_unit: string; price_paise: number; season: string;
  certification_ref: string | null; certification_verified_at: string | null; certification_verified_note: string | null; is_demo: boolean; seed_inventory: { available_packs: number } | null }

function CertBadge({ p }: { p: Pick<SeedRow, 'certification_ref' | 'certification_verified_at'> }) {
  const { t } = useTranslation()
  if (p.certification_ref && p.certification_verified_at) return <Badge tone="green"><BadgeCheck aria-hidden className="size-3.5" />{t('seeds.verified')}</Badge>
  if (p.certification_ref) return <Badge tone="amber"><ShieldQuestion aria-hidden className="size-3.5" />{t('seeds.unverified')}</Badge>
  return <Badge>{t('seeds.noCert')}</Badge>
}

export function SeedsPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const name = useCommodityName()
  const [sheet, setSheet] = useState(false)
  const f = { crop: params.get('crop') ?? '', season: params.get('season') ?? '', brand: params.get('brand') ?? '', max: params.get('max') ?? '', verified: params.get('verified') === '1', stock: params.get('stock') === '1', sort: params.get('sort') ?? 'price' }
  const set = (patch: Record<string, string>) => { const n = new URLSearchParams(params); for (const [k, v] of Object.entries(patch)) v ? n.set(k, v) : n.delete(k); setParams(n) }
  const q = useQuery({
    queryKey: ['seeds', f],
    queryFn: async () => {
      let qb = supabase.from('seed_products').select('id,seller_id,commodity_id,variety_name,brand,pack_size,pack_unit,price_paise,season,certification_ref,certification_verified_at,certification_verified_note,is_demo,seed_inventory(available_packs)').eq('status', 'active')
      if (f.crop) qb = qb.eq('commodity_id', Number(f.crop))
      if (f.season) qb = qb.in('season', [f.season, 'all'])
      if (f.brand) qb = qb.ilike('brand', `%${f.brand.replace(/[%_]/g, '')}%`)
      if (f.max && !Number.isNaN(toPaise(f.max))) qb = qb.lte('price_paise', toPaise(f.max))
      if (f.verified) qb = qb.not('certification_verified_at', 'is', null)
      const { data, error } = await qb.order(f.sort === 'newest' ? 'created_at' : 'price_paise', { ascending: f.sort !== 'newest' }).limit(60)
      if (error) throw error
      return (data as unknown as SeedRow[]).filter((r) => !f.stock || (r.seed_inventory?.available_packs ?? 0) > 0)
    },
  })
  const controls = (
    <div className="grid gap-4">
      <SelectField label={t('common.commodity')} value={f.crop} onChange={(e) => set({ crop: e.target.value })}><option value="">{t('common.all')}</option><CommodityOptions /></SelectField>
      <SelectField label={t('seeds.season')} value={f.season} onChange={(e) => set({ season: e.target.value })}><option value="">{t('seeds.allSeasons')}</option>{['kharif', 'rabi', 'zaid'].map((s) => <option key={s} value={s}>{t(`seeds.${s}`)}</option>)}</SelectField>
      <TextField label={t('seeds.brand')} defaultValue={f.brand} onBlur={(e) => set({ brand: e.target.value })} />
      <TextField label={`${t('prices.max')} ₹`} inputMode="decimal" defaultValue={f.max} onBlur={(e) => set({ max: e.target.value })} />
      <label className="flex min-h-11 items-center gap-3 font-semibold"><input type="checkbox" className="size-5 accent-forest-700" checked={f.verified} onChange={(e) => set({ verified: e.target.checked ? '1' : '' })} />{t('seeds.verifiedOnly')}</label>
      <label className="flex min-h-11 items-center gap-3 font-semibold"><input type="checkbox" className="size-5 accent-forest-700" checked={f.stock} onChange={(e) => set({ stock: e.target.checked ? '1' : '' })} />{t('seeds.inStockOnly')}</label>
      <SelectField label={t('prices.sort')} value={f.sort} onChange={(e) => set({ sort: e.target.value })}><option value="price">{t('prices.lowest')}</option><option value="newest">{t('prices.newest')}</option></SelectField>
    </div>
  )
  return (
    <div>
      <PageHeader eyebrow="SEED X" title={t('seeds.title')} lead={t('seeds.lead')} actions={<LinkButton to="/seeds/orders" variant="secondary">{t('nav.seedOrders')}</LinkButton>} />
      <div className="grid gap-6 lg:grid-cols-[17rem_1fr]">
        <aside className="hidden lg:block"><Card className="sticky top-24 p-5">{controls}</Card></aside>
        <div>
          <Button variant="secondary" size="sm" className="mb-4 lg:hidden" onClick={() => setSheet(true)}><SlidersHorizontal aria-hidden className="size-4" />{t('common.filters')}</Button>
          {q.isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-52" />)}</div>
            : q.error ? <ErrorState message={friendlyError(q.error, t)} onRetry={() => q.refetch()} />
            : !q.data?.length ? <EmptyState icon={<Sprout aria-hidden />} title={t('common.noResults')} action={<Button variant="secondary" onClick={() => setParams({})}>{t('common.clearFilters')}</Button>} />
            : (
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {q.data.map((p) => (
                  <li key={p.id}>
                    <Link to={`/seeds/${p.id}`} className="card flex h-full flex-col p-5 no-underline hover:border-forest-300">
                      <div className="flex flex-wrap gap-2"><Badge tone="green">{name(p.commodity_id)}</Badge><Badge>{t(`seeds.${p.season === 'all' ? 'allSeasons' : p.season}`)}</Badge><DemoBadge show={p.is_demo} /></div>
                      <h2 className="mt-3 text-lg font-extrabold text-forest-800">{p.variety_name}</h2>
                      <p className="text-sm text-charcoal-700">{p.brand} · {qty(p.pack_size, p.pack_unit)}</p>
                      <div className="mt-3"><CertBadge p={p} /></div>
                      <div className="mt-auto flex items-end justify-between pt-4">
                        <span className="tabular text-xl font-extrabold text-forest-700">{rupees(p.price_paise)}</span>
                        <span className={cx('text-xs font-bold', (p.seed_inventory?.available_packs ?? 0) > 0 ? 'text-forest-600' : 'text-danger-600')}>
                          {(p.seed_inventory?.available_packs ?? 0) > 0 ? t('seeds.inStock', { n: p.seed_inventory?.available_packs }) : t('seeds.outOfStock')}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
        </div>
      </div>
      <Sheet open={sheet} onClose={() => setSheet(false)} title={t('common.filters')} footer={<><Button variant="secondary" className="flex-1" onClick={() => { setParams({}); setSheet(false) }}>{t('common.reset')}</Button><Button className="flex-1" onClick={() => setSheet(false)}>{t('common.apply')}</Button></>}>{controls}</Sheet>
    </div>
  )
}

export function SeedDetailPage() {
  const { id } = useParams()
  const { t } = useTranslation()
  const { user, emailVerified, profile } = useAuth()
  const name = useCommodityName()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [packs, setPacks] = useState('1')
  const [state, setState] = useState(profile?.state ?? 'Madhya Pradesh')
  const [district, setDistrict] = useState(profile?.district ?? '')
  const [address, setAddress] = useState('')
  const key = useRef(newIdempotencyKey('seed'))
  const q = useQuery({
    queryKey: ['seed', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('seed_products').select('*, seed_inventory(available_packs)').eq('id', id!).maybeSingle()
      if (error) throw error
      if (!data) return null
      const { data: seller } = await supabase.from('profiles').select('display_name,district,state').eq('id', data.seller_id).maybeSingle()
      return { p: data, seller }
    },
  })
  const order = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('place_seed_order', { p_product_id: id!, p_packs: Number(packs), p_delivery_state: state, p_delivery_district: district.trim(), p_delivery_address: address.trim(), p_idempotency_key: key.current })
      if (error) throw error
      return data as { order_number: string }
    },
    onSuccess: (r) => { toast.success(t('seeds.placed', { n: r.order_number })); key.current = newIdempotencyKey('seed'); void qc.invalidateQueries({ queryKey: ['seed'] }); nav('/seeds/orders') },
    onError: (e) => toast.error(friendlyError(e, t)),
  })
  if (q.isLoading) return <PageLoader />
  if (q.error) return <ErrorState message={friendlyError(q.error, t)} />
  if (!q.data) return <EmptyState title={t('errors.notFound')} />
  const { p, seller } = q.data
  const stock = (p.seed_inventory as unknown as { available_packs: number } | null)?.available_packs ?? 0
  const total = p.price_paise * Number(packs || 0) + p.shipping_paise
  return (
    <div>
      <Link to="/seeds" className="text-sm font-semibold">← {t('seeds.title')}</Link>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card className="p-6">
          <div className="flex flex-wrap gap-2"><Badge tone="green">{name(p.commodity_id)}</Badge><CertBadge p={p} /><DemoBadge show={p.is_demo} /></div>
          <h1 className="mt-3 text-3xl font-extrabold">{p.variety_name}</h1>
          <p className="text-charcoal-700">{p.brand} · {t('seeds.seller')}: {seller?.display_name}</p>
          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[[t('seeds.pack'), qty(p.pack_size, p.pack_unit)], [t('common.price'), rupees(p.price_paise)], [t('seeds.season'), t(`seeds.${p.season === 'all' ? 'allSeasons' : p.season}`)],
              [t('seeds.lot'), p.lot_number ?? '-'], [t('seeds.germination'), p.germination_percent != null ? `${p.germination_percent}%` : '-'], [t('seeds.expiry'), date(p.expiry_date)],
              [t('seeds.delivery'), p.delivery_states.join(', ') || t('common.all')], [t('seeds.shipping'), rupees(p.shipping_paise)], [t('seeds.certRef'), p.certification_ref ?? '-']].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-forest-50 p-3"><dt className="text-xs font-semibold text-charcoal-500">{k}</dt><dd className="font-extrabold text-forest-800">{v}</dd></div>
            ))}
          </dl>
          {p.certification_verified_note && <p className="mt-3 text-sm text-forest-700"><BadgeCheck aria-hidden className="mr-1 inline size-4" />{p.certification_verified_note}</p>}
          {p.description && <p className="mt-4 text-charcoal-700">{p.description}</p>}
        </Card>
        <Card className="h-fit p-6">
          <h2 className="text-xl font-extrabold">{t('seeds.order')}</h2>
          {!user ? <div className="mt-4"><Notice tone="info" title={t('listing.loginToOffer')}><Link to={`/login?next=/seeds/${p.id}`}>{t('nav.login')}</Link></Notice></div>
            : !emailVerified ? <div className="mt-4"><Notice tone="warn" title={t('errors.EMAIL_NOT_VERIFIED')} /></div>
            : user.id === p.seller_id ? <div className="mt-4"><Notice tone="info" title={t('listing.yourListing')} /></div>
            : (
              <form className="mt-4 grid gap-4" onSubmit={(e) => { e.preventDefault(); order.mutate() }}>
                <TextField label={t('seeds.packs')} type="number" min={1} max={Math.max(1, stock)} value={packs} onChange={(e) => setPacks(e.target.value)} hint={t('seeds.inStock', { n: stock })} />
                <SelectField label={t('listing.state')} value={state} onChange={(e) => setState(e.target.value)}>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</SelectField>
                <TextField label={t('listing.district')} value={district} onChange={(e) => setDistrict(e.target.value)} required />
                <TextAreaField label={t('seeds.address')} value={address} onChange={(e) => setAddress(e.target.value)} minLength={5} required />
                <p className="tabular text-lg font-extrabold">{t('common.total')}: {rupees(total)}</p>
                <Notice tone="info" title={t('seeds.payNote')} />
                <Button type="submit" loading={order.isPending} disabled={stock < 1 || Number(packs) < 1}>{t('seeds.placeOrder')}</Button>
              </form>
            )}
        </Card>
      </div>
    </div>
  )
}

export function SeedOrdersPage() {
  const { t } = useTranslation()
  const { user, hasRole } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'buyer' | 'seller'>(hasRole('seed_seller') ? 'seller' : 'buyer')
  const q = useQuery({
    queryKey: ['seed-orders', tab, user?.id], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('seed_orders').select('*, seed_order_items(packs,unit_price_paise,product_snapshot)').eq(tab === 'buyer' ? 'buyer_id' : 'seller_id', user!.id).order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
  const move = useMutation({
    mutationFn: async ({ id, to }: { id: string; to: string }) => { const { error } = await supabase.rpc('transition_seed_order', { p_seed_order_id: id, p_to_status: to }); if (error) throw error },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['seed-orders'] }), onError: (e) => toast.error(friendlyError(e, t)),
  })
  const next: Record<string, { to: string; who: 'buyer' | 'seller' | 'both'; label: string; danger?: boolean }[]> = {
    pending: [{ to: 'confirmed', who: 'seller', label: t('common.confirm') }, { to: 'cancelled', who: 'both', label: t('orders.cancel'), danger: true }],
    confirmed: [{ to: 'packed', who: 'seller', label: 'packed' }, { to: 'cancelled', who: 'both', label: t('orders.cancel'), danger: true }],
    packed: [{ to: 'dispatched', who: 'seller', label: 'dispatched' }], dispatched: [{ to: 'delivered', who: 'buyer', label: t('orders.confirmReceipt') }],
    delivered: [{ to: 'completed', who: 'both', label: t('orders.complete') }],
  }
  return (
    <div>
      <PageHeader title={t('seeds.ordersTitle')} />
      <div role="tablist" className="mb-5 inline-flex rounded-2xl bg-white p-1 shadow-[var(--shadow-card)]">
        {(['buyer', 'seller'] as const).filter((k) => k === 'buyer' || hasRole('seed_seller')).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cx('min-h-11 rounded-xl px-4 text-sm font-bold', tab === k ? 'bg-forest-700 text-white' : 'text-forest-800')}>{t(k === 'buyer' ? 'seeds.asBuyer' : 'seeds.asSeller')}</button>
        ))}
      </div>
      {q.isLoading ? <PageLoader /> : q.error ? <ErrorState message={friendlyError(q.error, t)} /> : !q.data?.length ? <EmptyState icon={<Package aria-hidden />} title={t('orders.none')} action={<LinkButton to="/seeds">{t('seeds.title')}</LinkButton>} /> : (
        <ul className="grid gap-3">
          {q.data.map((o) => {
            const item = (o.seed_order_items as unknown as { packs: number; product_snapshot: { brand: string; variety_name: string } }[])[0]
            return (
              <li key={o.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div><p className="font-extrabold">{o.order_number} <DemoBadge show={o.is_demo} /></p><p className="text-sm text-charcoal-700">{item?.packs} × {item?.product_snapshot.brand} {item?.product_snapshot.variety_name} · {o.delivery_district} · {dateTime(o.created_at)}</p></div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular font-extrabold">{rupees(o.total_paise)}</span><StatusBadge status={o.status} />
                    {(next[o.status] ?? []).filter((a) => a.who === 'both' || a.who === tab).map((a) => <Button key={a.to} size="sm" variant={a.danger ? 'danger' : 'primary'} onClick={() => move.mutate({ id: o.id, to: a.to })}>{a.label}</Button>)}
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

export function SeedManagePage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ commodity_id: '', variety_name: '', brand: '', pack_size: '', pack_unit: 'kg', price: '', season: 'rabi', lot_number: '', germination: '', expiry: '', cert: '', description: '', shipping: '0', states: 'Madhya Pradesh' })
  const q = useQuery({
    queryKey: ['seeds', 'mine', user?.id], enabled: !!user,
    queryFn: async () => { const { data, error } = await supabase.from('seed_products').select('*, seed_inventory(available_packs,reserved_packs)').eq('seller_id', user!.id).order('created_at', { ascending: false }); if (error) throw error; return data },
  })
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('seed_products').insert({
        seller_id: user!.id, commodity_id: Number(form.commodity_id), variety_name: form.variety_name.trim(), brand: form.brand.trim(), pack_size: Number(form.pack_size), pack_unit: form.pack_unit,
        price_paise: toPaise(form.price), season: form.season, lot_number: form.lot_number || null, germination_percent: form.germination ? Number(form.germination) : null,
        expiry_date: form.expiry || null, certification_ref: form.cert || null, description: form.description || null, shipping_paise: toPaise(form.shipping || '0'),
        delivery_states: form.states.split(',').map((s) => s.trim()).filter(Boolean), status: 'active',
      })
      if (error) throw error
    },
    onSuccess: () => { setOpen(false); void qc.invalidateQueries({ queryKey: ['seeds'] }) }, onError: (e) => toast.error(friendlyError(e, t)),
  })
  const stock = useMutation({
    mutationFn: async ({ id, n }: { id: string; n: number }) => { const { error } = await supabase.rpc('set_seed_stock', { p_product_id: id, p_available_packs: n }); if (error) throw error },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['seeds'] }), onError: (e) => toast.error(friendlyError(e, t)),
  })
  const toggle = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => { const { error } = await supabase.from('seed_products').update({ status }).eq('id', id); if (error) throw error },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['seeds'] }), onError: (e) => toast.error(friendlyError(e, t)),
  })
  const F = (k: keyof typeof form) => ({ value: form[k], onChange: (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value }) })
  return (
    <div>
      <PageHeader title={t('seeds.manageTitle')} actions={<Button onClick={() => setOpen(true)}><Plus aria-hidden className="size-4" />{t('seeds.addProduct')}</Button>} />
      {q.isLoading ? <PageLoader /> : !q.data?.length ? <EmptyState icon={<Sprout aria-hidden />} title={t('common.noResults')} /> : (
        <ul className="grid gap-3">
          {q.data.map((p) => {
            const inv = p.seed_inventory as unknown as { available_packs: number; reserved_packs: number } | null
            return (
              <li key={p.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div><p className="font-extrabold">{p.brand} {p.variety_name} <StatusBadge status={p.status} /> <CertBadge p={p} /></p><p className="tabular text-sm text-charcoal-700">{rupees(p.price_paise)} · {t('listing.available')} {inv?.available_packs ?? 0} · {t('listing.reserved')} {inv?.reserved_packs ?? 0}</p></div>
                  <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); const n = Number(new FormData(e.currentTarget).get('n')); if (Number.isInteger(n) && n >= 0) stock.mutate({ id: p.id, n }) }}>
                    <TextField label={t('seeds.stock')} name="n" type="number" min={0} defaultValue={inv?.available_packs ?? 0} className="w-28" />
                    <Button size="sm" type="submit" variant="secondary">{t('common.save')}</Button>
                    <Button size="sm" type="button" variant="ghost" onClick={() => toggle.mutate({ id: p.id, status: p.status === 'active' ? 'paused' : 'active' })}>{p.status === 'active' ? t('listing.pause') : t('listing.resume')}</Button>
                  </form>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title={t('seeds.addProduct')} footer={<Button className="flex-1" loading={create.isPending} onClick={() => create.mutate()} disabled={!form.commodity_id || !form.variety_name || !form.brand || !form.pack_size || Number.isNaN(toPaise(form.price))}>{t('common.save')}</Button>}>
        <div className="grid gap-3">
          <SelectField label={t('common.commodity')} {...F('commodity_id')}><option value="">—</option><CommodityOptions /></SelectField>
          <TextField label={t('common.variety')} {...F('variety_name')} /><TextField label={t('seeds.brand')} {...F('brand')} />
          <div className="grid grid-cols-2 gap-3"><TextField label={t('seeds.pack')} inputMode="decimal" {...F('pack_size')} /><SelectField label={t('common.unit')} {...F('pack_unit')}><option>kg</option><option>g</option></SelectField></div>
          <TextField label={`${t('common.price')} (₹)`} inputMode="decimal" {...F('price')} />
          <SelectField label={t('seeds.season')} {...F('season')}>{['kharif', 'rabi', 'zaid', 'all'].map((s) => <option key={s} value={s}>{s}</option>)}</SelectField>
          <TextField label={t('seeds.lot')} optional {...F('lot_number')} /><TextField label={`${t('seeds.germination')} %`} optional inputMode="decimal" {...F('germination')} />
          <TextField label={t('seeds.expiry')} type="date" optional {...F('expiry')} /><TextField label={t('seeds.certRef')} optional {...F('cert')} hint={t('seeds.unverified')} />
          <TextField label={`${t('seeds.shipping')} (₹)`} inputMode="decimal" {...F('shipping')} /><TextField label={t('seeds.delivery')} {...F('states')} hint="Comma-separated states" />
          <TextAreaField label={t('demand.notes')} optional {...F('description')} />
        </div>
      </Sheet>
    </div>
  )
}
