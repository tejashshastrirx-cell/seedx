import { useState } from 'react'
import { NavLink } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { date, dateTime, qty, rupees } from '@/lib/format'
import { friendlyError } from '@/lib/errors'
import { useCommodityName } from '@/lib/catalog'
import { Badge, Button, Card, DemoBadge, EmptyState, ErrorState, PageHeader, PageLoader, Stat, StatusBadge, TextAreaField, TextField, cx } from '@/components/ui'

export function AdminNav() {
  const { t } = useTranslation()
  const links = [['/admin', 'admin.title'], ['/admin/users', 'admin.users'], ['/admin/listings', 'admin.listings'], ['/admin/orders', 'admin.orders'], ['/admin/seeds', 'admin.seeds'],
    ['/admin/schemes', 'admin.schemes'], ['/admin/catalogue', 'catalogue.title'], ['/admin/reports', 'admin.reports'], ['/admin/audit-logs', 'admin.audit']]
  return (
    <nav className="mb-6 flex gap-2 overflow-x-auto pb-1" aria-label="Admin">
      {links.map(([to, k]) => <NavLink key={to} to={to} end className={({ isActive }) => cx('whitespace-nowrap rounded-xl px-3 py-2 text-sm font-bold no-underline', isActive ? 'bg-forest-700 text-white' : 'bg-white text-forest-800')}>{t(k)}</NavLink>)}
    </nav>
  )
}

function useRpc<T>(key: string, fn: () => PromiseLike<{ data: unknown; error: unknown }>) {
  return useQuery({ queryKey: ['admin', key], queryFn: async () => { const { data, error } = await fn(); if (error) throw error; return data as T } })
}

export function AdminOverviewPage() {
  const { t } = useTranslation()
  const q = useRpc<Record<string, number | string | null>>('overview', () => supabase.rpc('admin_overview'))
  const [csv, setCsv] = useState('')
  const imp = useMutation({
    mutationFn: async () => {
      const [head, ...lines] = csv.trim().split(/\r?\n/)
      const cols = head.split(',').map((c) => c.trim())
      const rows = lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v.trim()])))
      const { data, error } = await supabase.rpc('admin_import_prices', { p_source_code: 'ogd_agmarknet', p_rows: rows })
      if (error) throw error
      return data as { upserted: number; rejected: number }
    },
    onSuccess: (r) => toast.success(`${r.upserted} upserted · ${r.rejected} rejected`), onError: (e) => toast.error(friendlyError(e, t)),
  })
  return (
    <div>
      <PageHeader title={t('admin.title')} lead={t('admin.lead')} />
      <AdminNav />
      {q.isLoading ? <PageLoader /> : q.error ? <ErrorState message={friendlyError(q.error, t)} /> : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Object.entries(q.data ?? {}).map(([k, v]) => <Stat key={k} label={k.replace(/_/g, ' ')} value={k === 'last_price_ingestion' ? (v ? dateTime(String(v)) : '–') : String(v ?? 0)} />)}
        </div>
      )}
      <Card className="mt-6 grid gap-3 p-5">
        <h2 className="font-extrabold">{t('admin.importPrices')}</h2>
        <p className="text-sm text-charcoal-700">{t('admin.importHint')}</p>
        <TextAreaField label="CSV" rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} />
        <Button className="w-fit" disabled={!csv.includes('\n')} loading={imp.isPending} onClick={() => imp.mutate()}>{t('common.submit')}</Button>
      </Card>
    </div>
  )
}

export function AdminUsersPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const q = useQuery({ queryKey: ['admin', 'users', search], queryFn: async () => { const { data, error } = await supabase.rpc('admin_list_users', { p_search: search || undefined }); if (error) throw error; return data as { id: string; email: string; email_verified: boolean; display_name: string; district: string | null; roles: { id: string; role: string; status: string }[]; created_at: string }[] } })
  const review = useMutation({
    mutationFn: async ({ id, d }: { id: string; d: string }) => { const { error } = await supabase.rpc('admin_review_role', { p_role_id: id, p_decision: d }); if (error) throw error },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin'] }), onError: (e) => toast.error(friendlyError(e, t)),
  })
  return (
    <div>
      <PageHeader title={t('admin.users')} /><AdminNav />
      <TextField label={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} className="mb-4 max-w-sm" />
      {q.isLoading ? <PageLoader /> : q.error ? <ErrorState message={friendlyError(q.error, t)} /> : (
        <ul className="grid gap-3">{q.data?.map((u) => (
          <li key={u.id}><Card className="p-4">
            <p className="font-extrabold">{u.display_name} <span className="text-sm font-normal text-charcoal-500">{u.email}</span> {u.email_verified ? <Badge tone="green">verified</Badge> : <Badge tone="red">unverified</Badge>}</p>
            <ul className="mt-2 flex flex-wrap gap-2">{u.roles.map((r) => (
              <li key={r.id} className="flex items-center gap-1 rounded-xl bg-forest-50 px-2 py-1 text-sm">
                <StatusBadge status={r.status} label={`${r.role} · ${r.status}`} />
                {r.status === 'requested' && !['admin', 'support'].includes(r.role) && <><Button size="sm" onClick={() => review.mutate({ id: r.id, d: 'active' })}>{t('admin.approve')}</Button><Button size="sm" variant="danger" onClick={() => review.mutate({ id: r.id, d: 'rejected' })}>{t('admin.reject')}</Button></>}
                {r.status === 'active' && !['admin', 'support'].includes(r.role) && <Button size="sm" variant="ghost" onClick={() => review.mutate({ id: r.id, d: 'revoked' })}>{t('admin.revoke')}</Button>}
              </li>))}
            </ul>
          </Card></li>))}
        </ul>
      )}
    </div>
  )
}

function Moderate({ type, id, onDone }: { type: string; id: string; onDone: () => void }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const m = useMutation({
    mutationFn: async () => { const { error } = await supabase.rpc('admin_moderate', { p_target_type: type, p_target_id: id, p_action: 'withdraw', p_reason: reason }); if (error) throw error },
    onSuccess: onDone, onError: (e) => toast.error(friendlyError(e, t)),
  })
  return <div className="flex gap-2"><input className="field-input min-h-10" placeholder={t('admin.reason')} aria-label={t('admin.reason')} value={reason} onChange={(e) => setReason(e.target.value)} /><Button size="sm" variant="danger" disabled={reason.length < 5} onClick={() => m.mutate()}>{t('admin.withdrawListing')}</Button></div>
}

export function AdminListingsPage() {
  const { t } = useTranslation()
  const name = useCommodityName()
  const q = useQuery({ queryKey: ['admin', 'listings'], queryFn: async () => (await supabase.from('harvest_listings').select('*').order('created_at', { ascending: false }).limit(100)).data ?? [] })
  return (
    <div><PageHeader title={t('admin.listings')} /><AdminNav />
      {q.isLoading ? <PageLoader /> : <ul className="grid gap-3">{q.data?.map((l) => (
        <li key={l.id}><Card className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-bold">{l.title} <StatusBadge status={l.status} /> <DemoBadge show={l.is_demo} /></p><p className="text-sm text-charcoal-700">{name(l.commodity_id)} · {qty(l.available_quantity, l.unit)} · {l.district}</p></div>
          {!['withdrawn', 'sold'].includes(l.status) && <Moderate type="harvest_listing" id={l.id} onDone={() => q.refetch()} />}</Card></li>))}</ul>}
    </div>
  )
}

export function AdminOrdersPage() {
  const { t } = useTranslation()
  const q = useQuery({ queryKey: ['admin', 'orders'], queryFn: async () => (await supabase.from('orders').select('id,order_number,status,gross_paise,quantity,unit,created_at,is_demo').order('created_at', { ascending: false }).limit(100)).data ?? [] })
  return (
    <div><PageHeader title={t('admin.orders')} lead="Read-only. Access to private order data is audited." /><AdminNav />
      {q.isLoading ? <PageLoader /> : !q.data?.length ? <EmptyState title={t('orders.none')} /> : <ul className="grid gap-2">{q.data.map((o) => (
        <li key={o.id}><Card className="flex justify-between p-4"><span className="font-bold">{o.order_number} <DemoBadge show={o.is_demo} /></span><span className="flex gap-3"><span className="tabular">{qty(o.quantity, o.unit)} · {rupees(o.gross_paise)}</span><StatusBadge status={o.status} /></span></Card></li>))}</ul>}
    </div>
  )
}

export function AdminSeedsPage() {
  const { t } = useTranslation()
  const [notes, setNotes] = useState<Record<string, string>>({})
  const q = useQuery({ queryKey: ['admin', 'seeds'], queryFn: async () => (await supabase.from('seed_products').select('*').order('created_at', { ascending: false }).limit(100)).data ?? [] })
  const verify = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.rpc('admin_verify_seed_certification', { p_product_id: id, p_note: notes[id] ?? '' }); if (error) throw error },
    onSuccess: () => q.refetch(), onError: (e) => toast.error(friendlyError(e, t)),
  })
  return (
    <div><PageHeader title={t('admin.seeds')} /><AdminNav />
      {q.isLoading ? <PageLoader /> : <ul className="grid gap-3">{q.data?.map((p) => (
        <li key={p.id}><Card className="grid gap-2 p-4">
          <p className="font-bold">{p.brand} {p.variety_name} <StatusBadge status={p.status} /> <DemoBadge show={p.is_demo} /></p>
          <p className="text-sm">Cert ref: {p.certification_ref ?? '—'} {p.certification_verified_at && <Badge tone="green">checked {date(p.certification_verified_at)}</Badge>}</p>
          {p.certification_ref && !p.certification_verified_at && <div className="flex flex-wrap gap-2"><input className="field-input min-h-10 flex-1" aria-label={t('admin.checkedWhat')} placeholder={t('admin.checkedWhat')} value={notes[p.id] ?? ''} onChange={(e) => setNotes({ ...notes, [p.id]: e.target.value })} /><Button size="sm" disabled={(notes[p.id] ?? '').length < 10} onClick={() => verify.mutate(p.id)}>{t('admin.verifyCert')}</Button></div>}
          {p.status !== 'delisted' && <Moderate type="seed_product" id={p.id} onDone={() => q.refetch()} />}
        </Card></li>))}</ul>}
    </div>
  )
}

export function AdminSchemesPage() {
  const { t } = useTranslation()
  const q = useQuery({ queryKey: ['admin', 'schemes'], queryFn: async () => (await supabase.from('government_schemes').select('*').order('title_en')).data ?? [] })
  const review = useMutation({
    mutationFn: async ({ id, to }: { id: string; to: string }) => { const { error } = await supabase.rpc('admin_review_scheme', { p_scheme_id: id, p_to_status: to, p_note: 'Reviewed against official source' }); if (error) throw error },
    onSuccess: () => q.refetch(), onError: (e) => toast.error(friendlyError(e, t)),
  })
  return (
    <div><PageHeader title={t('admin.schemes')} lead="Publishing records last_verified_at = now. Only publish after checking the official URL." /><AdminNav />
      {q.isLoading ? <PageLoader /> : <ul className="grid gap-3">{q.data?.map((s) => (
        <li key={s.id}><Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div><p className="font-bold">{s.title_en} <StatusBadge status={s.status} /></p><p className="text-sm"><a href={s.official_url} target="_blank" rel="noreferrer">{s.official_url}</a> · {s.last_verified_at ? `verified ${date(s.last_verified_at)}` : t('common.verificationPending')}</p></div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => review.mutate({ id: s.id, to: 'published' })}>{t('admin.publish')}</Button>
            <Button size="sm" variant="secondary" onClick={() => review.mutate({ id: s.id, to: 'review_due' })}>{t('admin.markReview')}</Button>
            <Button size="sm" variant="ghost" onClick={() => review.mutate({ id: s.id, to: 'expired' })}>{t('admin.expire')}</Button>
            <Button size="sm" variant="danger" onClick={() => review.mutate({ id: s.id, to: 'withdrawn' })}>{t('admin.withdrawScheme')}</Button>
          </div>
        </Card></li>))}</ul>}
    </div>
  )
}

export function AdminReportsPage() {
  const { t } = useTranslation()
  const q = useQuery({ queryKey: ['admin', 'reports'], queryFn: async () => (await supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(100)).data ?? [] })
  const dismiss = useMutation({
    mutationFn: async (r: { id: string; target_type: string; target_id: string }) => { const { error } = await supabase.rpc('admin_moderate', { p_target_type: r.target_type, p_target_id: r.target_id, p_action: 'dismiss', p_reason: 'No violation found', p_report_id: r.id }); if (error) throw error },
    onSuccess: () => q.refetch(), onError: (e) => toast.error(friendlyError(e, t)),
  })
  return (
    <div><PageHeader title={t('admin.reports')} /><AdminNav />
      {q.isLoading ? <PageLoader /> : !q.data?.length ? <EmptyState title={t('common.noResults')} /> : <ul className="grid gap-3">{q.data.map((r) => (
        <li key={r.id}><Card className="grid gap-2 p-4"><p className="font-bold">{r.target_type} · {r.reason} <StatusBadge status={r.status} /></p><p className="text-sm">{r.details}</p>
          {r.status === 'open' && <div className="flex flex-wrap gap-2"><Moderate type={r.target_type} id={r.target_id} onDone={() => q.refetch()} /><Button size="sm" variant="ghost" onClick={() => dismiss.mutate(r)}>{t('admin.dismiss')}</Button></div>}</Card></li>))}</ul>}
    </div>
  )
}

export function AdminAuditPage() {
  const { t } = useTranslation()
  const q = useQuery({ queryKey: ['admin', 'audit'], queryFn: async () => (await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200)).data ?? [] })
  return (
    <div><PageHeader title={t('admin.audit')} lead="Append-only. Secrets, tokens and OTPs are never logged." /><AdminNav />
      {q.isLoading ? <PageLoader /> : (
        <Card className="overflow-x-auto p-0"><table className="w-full min-w-[40rem] text-left text-sm"><thead className="bg-forest-50"><tr>{['time', 'action', 'resource', 'actor', 'metadata'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
          <tbody>{q.data?.map((a) => <tr key={a.id} className="border-t border-forest-100"><td className="px-3 py-2">{dateTime(a.created_at)}</td><td className="px-3 py-2 font-bold">{a.action}</td><td className="px-3 py-2">{a.resource_type}</td><td className="px-3 py-2 text-xs">{a.actor_id?.slice(0, 8) ?? 'system'}</td><td className="px-3 py-2 text-xs"><code>{JSON.stringify(a.metadata).slice(0, 120)}</code></td></tr>)}</tbody></table></Card>
      )}
    </div>
  )
}
