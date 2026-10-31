import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, MapPin, Package, Phone, Truck } from 'lucide-react'
import { toast } from 'sonner'
import type { Unit } from '@shared/clustercart'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/app/auth'
import { useCommodityName } from '@/lib/catalog'
import { date, dateTime, perUnit, qty, rupees } from '@/lib/format'
import { friendlyError } from '@/lib/errors'
import { Badge, Button, Card, DemoBadge, EmptyState, ErrorState, PageHeader, PageLoader, SelectField, StatusBadge, TextAreaField, TextField } from '@/components/ui'
import { NetBackPanel } from '@/features/marketplace/NetBackPanel'

export function OrdersPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const name = useCommodityName()
  const q = useQuery({
    queryKey: ['orders', 'list', user?.id], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('orders').select('id,order_number,status,quantity,unit,gross_paise,commodity_id,farmer_id,buyer_id,created_at,is_demo').order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      return data
    },
  })
  if (q.isLoading) return <PageLoader />
  if (q.error) return <ErrorState message={friendlyError(q.error, t)} onRetry={() => q.refetch()} />
  return (
    <div>
      <PageHeader title={t('orders.title')} lead={t('orders.lead')} />
      {!q.data?.length ? <EmptyState icon={<Package aria-hidden />} title={t('orders.none')} /> : (
        <ul className="grid gap-3">
          {q.data.map((o) => (
            <li key={o.id}>
              <Link to={`/orders/${o.id}`} className="card flex flex-wrap items-center justify-between gap-3 p-4 no-underline hover:border-forest-300">
                <div>
                  <p className="font-extrabold text-forest-800">{o.order_number} <DemoBadge show={o.is_demo} /></p>
                  <p className="text-sm text-charcoal-700">{name(o.commodity_id)} · {qty(o.quantity, o.unit)} · {dateTime(o.created_at)} · {o.farmer_id === user?.id ? t('netback.farmer') : t('netback.buyer')}</p>
                </div>
                <div className="flex items-center gap-3"><span className="tabular font-extrabold">{rupees(o.gross_paise)}</span><StatusBadge status={o.status} label={t(`orders.${o.status}`)} /></div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function OrderDetailPage() {
  const { id } = useParams()
  const { t } = useTranslation()
  const { user } = useAuth()
  const qc = useQueryClient()
  const name = useCommodityName()
  const [pickupDate, setPickupDate] = useState(new Date(Date.now() + 86_400_000).toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [provider, setProvider] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')

  const q = useQuery({
    queryKey: ['orders', 'detail', id],
    queryFn: async () => {
      const { data: o, error } = await supabase.from('orders').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      if (!o) return null
      const [lines, events, parties, pickup, delivery] = await Promise.all([
        supabase.from('order_cost_lines').select('*').eq('order_id', o.id),
        supabase.from('order_events').select('*').eq('order_id', o.id).order('id'),
        supabase.from('profiles').select('id,display_name,district,state').in('id', [o.farmer_id, o.buyer_id, o.logistics_provider_id].filter(Boolean) as string[]),
        supabase.from('harvest_pickup_locations').select('address_line,contact_phone').eq('listing_id', o.listing_id).maybeSingle(),
        supabase.from('order_delivery_details').select('*').eq('order_id', o.id).maybeSingle(),
      ])
      return { o, lines: lines.data ?? [], events: events.data ?? [], parties: Object.fromEntries((parties.data ?? []).map((p) => [p.id, p])), pickup: pickup.data, delivery: delivery.data }
    },
  })
  const providers = useQuery({ queryKey: ['logistics-providers'], queryFn: async () => (await supabase.rpc('list_logistics_providers')).data as { id: string; display_name: string; district: string | null }[] | null })
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['orders'] }); void qc.invalidateQueries({ queryKey: ['listings'] }) }
  const transition = useMutation({
    mutationFn: async (to: string) => {
      const { error } = await supabase.rpc('transition_order', { p_order_id: id!, p_to_status: to, p_note: note || undefined, p_pickup_date: to === 'pickup_scheduled' ? pickupDate : undefined })
      if (error) throw error
    },
    onSuccess: () => { setNote(''); refresh() }, onError: (e) => toast.error(friendlyError(e, t)),
  })
  const assign = useMutation({
    mutationFn: async () => { const { error } = await supabase.rpc('assign_logistics', { p_order_id: id!, p_provider_id: provider }); if (error) throw error },
    onSuccess: refresh, onError: (e) => toast.error(friendlyError(e, t)),
  })
  const saveAddress = useMutation({
    mutationFn: async () => {
      const row = { address_line: address.trim(), contact_phone: phone.trim() || null }
      const { error } = q.data?.delivery
        ? await supabase.from('order_delivery_details').update(row).eq('order_id', id!)
        : await supabase.from('order_delivery_details').insert({ ...row, order_id: id!, buyer_id: user!.id })
      if (error) throw error
    },
    onSuccess: () => { toast.success(t('profile.saved')); refresh() }, onError: (e) => toast.error(friendlyError(e, t)),
  })

  if (q.isLoading) return <PageLoader />
  if (q.error) return <ErrorState message={friendlyError(q.error, t)} onRetry={() => q.refetch()} />
  if (!q.data) return <EmptyState title={t('errors.notFound')} />
  const { o, lines, events, parties, pickup, delivery } = q.data
  const role = user?.id === o.farmer_id ? 'farmer' : user?.id === o.buyer_id ? 'buyer' : 'other'
  const snap = o.terms_snapshot as Record<string, string | number>
  const actions: { to: string; label: string; who: string[]; variant?: 'danger' | 'secondary' }[] = [
    { to: 'pickup_scheduled', label: t('orders.schedulePickup'), who: ['farmer'] },
    { to: 'in_transit', label: t('orders.markInTransit'), who: ['farmer'] },
    { to: 'delivered', label: t('orders.confirmReceipt'), who: ['buyer'] },
    { to: 'completed', label: t('orders.complete'), who: ['buyer', 'farmer'] },
    { to: 'cancelled', label: t('orders.cancel'), who: ['buyer', 'farmer'], variant: 'danger' },
    { to: 'disputed', label: t('orders.dispute'), who: ['buyer', 'farmer'], variant: 'secondary' },
  ]
  const allowedFrom: Record<string, string[]> = { pickup_scheduled: ['confirmed'], in_transit: ['pickup_scheduled'], delivered: ['in_transit'], completed: ['delivered'], cancelled: ['confirmed', 'pickup_scheduled'], disputed: ['in_transit', 'delivered'] }
  const available = actions.filter((a) => a.who.includes(role) && allowedFrom[a.to].includes(o.status))

  return (
    <div>
      <Link to="/orders" className="text-sm font-semibold">← {t('nav.orders')}</Link>
      <PageHeader title={`${t('orders.number')} ${o.order_number}`} lead={`${name(o.commodity_id)} · ${snap.listing_title}`} actions={<><StatusBadge status={o.status} label={t(`orders.${o.status}`)} /><DemoBadge show={o.is_demo} /></>} />
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="grid gap-6">
          <Card className="p-5">
            <h2 className="text-lg font-extrabold">{t('orders.terms')}</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[[t('common.quantity'), qty(o.quantity, o.unit)], [t('common.price'), perUnit(o.price_paise_per_unit, o.unit)], [t('common.grade'), String(snap.grade)], [t('listing.deliveryTerms'), t(`listing.${o.delivery_terms}`)]].map(([k, v]) => (
                <div key={k} className="rounded-2xl bg-forest-50 p-3"><dt className="text-xs font-semibold text-charcoal-500">{k}</dt><dd className="tabular font-extrabold text-forest-800">{v}</dd></div>
              ))}
            </dl>
            <div className="mt-4">
              <NetBackPanel quantity={Number(o.quantity)} unit={o.unit as Unit} pricePaisePerUnit={o.price_paise_per_unit} commodityId={o.commodity_id}
                lines={lines.map((l) => ({ label: l.label, payer: l.payer as 'farmer' | 'buyer', amountPaise: l.amount_paise, certainty: l.certainty as 'estimated' | 'confirmed', source: l.source }))} />
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="text-lg font-extrabold">{t('orders.timeline')}</h2>
            <ol className="mt-4 grid gap-4 border-l-2 border-forest-200 pl-5">
              {events.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[1.72rem] top-1 size-3 rounded-full bg-gold-400 ring-4 ring-white" />
                  <p className="font-bold">{t(`orders.${e.to_status}`, { defaultValue: e.to_status })} <span className="text-xs font-normal text-charcoal-500">· {e.actor_role} · {dateTime(e.created_at)}</span></p>
                  {e.note && <p className="text-sm text-charcoal-700">{e.note}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <div className="grid h-fit gap-6">
          {available.length > 0 && (
            <Card className="grid gap-3 p-5">
              {available.some((a) => a.to === 'pickup_scheduled') && <TextField label={t('orders.pickupDate')} type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} />}
              <TextAreaField label={t('orders.note')} optional value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} />
              {available.map((a) => <Button key={a.to} variant={a.variant} loading={transition.isPending && transition.variables === a.to} onClick={() => transition.mutate(a.to)}>{a.label}</Button>)}
            </Card>
          )}
          <Card className="p-5">
            <h2 className="text-lg font-extrabold">{t('orders.parties')}</h2>
            <ul className="mt-3 grid gap-2 text-sm">
              <li><Badge tone="green">{t('netback.farmer')}</Badge> {parties[o.farmer_id]?.display_name}</li>
              <li><Badge tone="gold">{t('netback.buyer')}</Badge> {parties[o.buyer_id]?.display_name}</li>
              {o.logistics_provider_id && <li><Badge tone="blue"><Truck aria-hidden className="size-3" /></Badge> {parties[o.logistics_provider_id]?.display_name}</li>}
            </ul>
            {role === 'farmer' && ['confirmed', 'pickup_scheduled'].includes(o.status) && (
              <div className="mt-4 grid gap-2">
                <SelectField label={t('orders.assignLogistics')} value={provider} onChange={(e) => setProvider(e.target.value)}>
                  <option value="">—</option>{providers.data?.map((p) => <option key={p.id} value={p.id}>{p.display_name} {p.district ? `· ${p.district}` : ''}</option>)}
                </SelectField>
                <Button variant="secondary" disabled={!provider} loading={assign.isPending} onClick={() => assign.mutate()}>{t('common.confirm')}</Button>
              </div>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-lg font-extrabold"><MapPin aria-hidden className="size-5" />{t('orders.pickupInfo')}</h2>
            <p className="mt-2 text-sm">{String(snap.pickup_area)}</p>
            {pickup ? <p className="mt-1 text-sm">{pickup.address_line} {pickup.contact_phone && <span className="ml-1 inline-flex items-center gap-1"><Phone aria-hidden className="size-3" />{pickup.contact_phone}</span>}</p> : <p className="mt-1 text-xs text-charcoal-500">{t('logistics.hidden')}</p>}
          </Card>
          <Card className="grid gap-3 p-5">
            <h2 className="text-lg font-extrabold">{t('orders.deliveryAddress')}</h2>
            {delivery && <p className="text-sm">{delivery.address_line} {delivery.contact_phone}</p>}
            {role === 'buyer' && !['delivered', 'completed', 'cancelled'].includes(o.status) && (
              <>
                <TextField label={t('seeds.address')} value={address} onChange={(e) => setAddress(e.target.value)} placeholder={delivery?.address_line} minLength={5} />
                <TextField label={t('profile.phone')} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} optional />
                <Button variant="secondary" disabled={address.trim().length < 5} loading={saveAddress.isPending} onClick={() => saveAddress.mutate()}>{t('orders.saveAddress')}</Button>
              </>
            )}
          </Card>
          <p className="text-xs text-charcoal-500">{t('orders.receipt')}: {o.order_number} · {date(o.created_at)} · {rupees(o.gross_paise)} · INR</p>
        </div>
      </div>
    </div>
  )
}

export function LogisticsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['logistics', 'jobs'], queryFn: async () => { const { data, error } = await supabase.rpc('logistics_jobs'); if (error) throw error; return data as Record<string, string | number | null>[] } })
  const move = useMutation({
    mutationFn: async ({ id, to }: { id: string; to: string }) => {
      const { error } = await supabase.rpc('transition_order', { p_order_id: id, p_to_status: to, p_pickup_date: to === 'pickup_scheduled' ? new Date(Date.now() + 86_400_000).toISOString().slice(0, 10) : undefined })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['logistics'] }), onError: (e) => toast.error(friendlyError(e, t)),
  })
  if (q.isLoading) return <PageLoader />
  if (q.error) return <ErrorState message={friendlyError(q.error, t)} />
  return (
    <div>
      <PageHeader title={t('logistics.title')} lead={t('logistics.lead')} />
      {!q.data?.length ? <EmptyState icon={<Truck aria-hidden />} title={t('logistics.none')} /> : (
        <ul className="grid gap-4">
          {q.data.map((j) => (
            <li key={String(j.order_id)}>
              <Card className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-extrabold">{j.order_number} · {j.commodity} · {qty(j.quantity as number, String(j.unit))}</p><StatusBadge status={String(j.status)} label={t(`orders.${j.status}`)} /></div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-forest-50 p-3 text-sm"><p className="font-bold">{t('logistics.pickup')}: {j.pickup_area}</p><p>{j.pickup_address ?? t('logistics.hidden')} {j.pickup_phone ?? ''}</p>{j.pickup_date && <p>{date(String(j.pickup_date))}</p>}</div>
                  <div className="rounded-2xl bg-gold-100 p-3 text-sm"><p className="font-bold">{t('logistics.drop')}: {j.delivery_area}</p><p>{j.delivery_address ?? t('logistics.hidden')} {j.delivery_phone ?? ''}</p></div>
                </div>
                <div className="mt-3 flex gap-2">
                  {j.status === 'confirmed' && <Button size="sm" onClick={() => move.mutate({ id: String(j.order_id), to: 'pickup_scheduled' })}>{t('orders.schedulePickup')}</Button>}
                  {j.status === 'pickup_scheduled' && <Button size="sm" onClick={() => move.mutate({ id: String(j.order_id), to: 'in_transit' })}>{t('orders.markInTransit')}</Button>}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function NotificationsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['notifications', 'list'], queryFn: async () => { const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100); if (error) throw error; return data } })
  const markAll = useMutation({ mutationFn: async () => { await supabase.rpc('mark_notifications_read', {}) }, onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications'] }) })
  if (q.isLoading) return <PageLoader />
  return (
    <div>
      <PageHeader title={t('notifications.title')} actions={<Button variant="secondary" onClick={() => markAll.mutate()}><CheckCheck aria-hidden className="size-4" />{t('notifications.markAll')}</Button>} />
      {!q.data?.length ? <EmptyState icon={<Bell aria-hidden />} title={t('notifications.none')} /> : (
        <ul className="grid gap-2">
          {q.data.map((n) => (
            <li key={n.id}>
              <Link to={n.link ?? '/dashboard'} className={`card flex gap-3 p-4 no-underline ${n.read_at ? 'opacity-75' : 'border-gold-300'}`}>
                {!n.read_at && <span className="mt-2 size-2.5 shrink-0 rounded-full bg-gold-400" aria-label="unread" />}
                <div><p className="font-bold text-forest-800">{n.title}</p>{n.body && <p className="text-sm text-charcoal-700">{n.body}</p>}<p className="text-xs text-charcoal-500">{dateTime(n.created_at)}</p></div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
