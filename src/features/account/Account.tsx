import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bookmark, BookmarkCheck, CheckCircle2, Circle, ExternalLink, Landmark, LandPlot, Network, Plus, ShieldCheck, ShoppingBasket, Sprout, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/app/auth'
import { INDIAN_STATES } from '@/lib/catalog'
import { date, dateTime } from '@/lib/format'
import { friendlyError } from '@/lib/errors'
import { readPrefs, writePrefs } from '@/lib/prefs'
import { Badge, Button, Card, EmptyState, ErrorState, LinkButton, Notice, PageHeader, PageLoader, SelectField, Sheet, StatusBadge, TextAreaField, TextField, cx } from '@/components/ui'
import { LanguageSwitch } from '@/components/Layout'

// ---------------------------------------------------------------------------------- schemes
export function SchemesPage({ savedOnly = false }: { savedOnly?: boolean }) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const qc = useQueryClient()
  const f = { q: params.get('q') ?? '', type: params.get('type') ?? '', level: params.get('level') ?? '', state: params.get('state') ?? '', category: params.get('category') ?? '' }
  const set = (patch: Record<string, string>) => { const n = new URLSearchParams(params); for (const [k, v] of Object.entries(patch)) v ? n.set(k, v) : n.delete(k); setParams(n) }
  const saved = useQuery({ queryKey: ['saved-schemes', user?.id], enabled: !!user, queryFn: async () => new Set(((await supabase.from('saved_schemes').select('scheme_id')).data ?? []).map((r) => r.scheme_id)) })
  const q = useQuery({
    queryKey: ['schemes', f, savedOnly, saved.data?.size],
    queryFn: async () => {
      let qb = supabase.from('government_schemes').select('*').in('status', ['published', 'review_due'])
      if (f.type) qb = qb.eq('scheme_type', f.type)
      if (f.level) qb = qb.eq('level', f.level)
      if (f.category) qb = qb.contains('farmer_categories', [f.category])
      if (f.q) qb = qb.or(`title_en.ilike.%${f.q.replace(/[%_,()]/g, '')}%,summary_en.ilike.%${f.q.replace(/[%_,()]/g, '')}%`)
      const { data, error } = await qb.order('title_en')
      if (error) throw error
      return data.filter((s) => (!f.state || s.applicable_states.length === 0 || s.applicable_states.includes(f.state)) && (!savedOnly || saved.data?.has(s.id)))
    },
  })
  const toggle = useMutation({
    mutationFn: async (id: string) => {
      const { error } = saved.data?.has(id) ? await supabase.from('saved_schemes').delete().eq('scheme_id', id).eq('user_id', user!.id) : await supabase.from('saved_schemes').insert({ user_id: user!.id, scheme_id: id })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['saved-schemes'] }), onError: (e) => toast.error(friendlyError(e, t)),
  })
  return (
    <div>
      <PageHeader title={savedOnly ? t('schemes.savedTitle') : t('schemes.title')} lead={t('schemes.lead')} />
      {!savedOnly && (
        <Card className="mb-5 grid gap-3 p-4 sm:grid-cols-5">
          <TextField label={t('common.search')} defaultValue={f.q} onBlur={(e) => set({ q: e.target.value })} className="sm:col-span-2" />
          <SelectField label={t('schemes.type')} value={f.type} onChange={(e) => set({ type: e.target.value })}><option value="">{t('common.all')}</option>{['income_support', 'insurance', 'credit', 'soil_health', 'irrigation_energy', 'market_access', 'organic', 'mechanisation'].map((x) => <option key={x} value={x}>{x.replace(/_/g, ' ')}</option>)}</SelectField>
          <SelectField label={t('schemes.level')} value={f.level} onChange={(e) => set({ level: e.target.value })}><option value="">{t('common.all')}</option><option value="central">{t('schemes.central')}</option><option value="state">{t('schemes.state')}</option></SelectField>
          <SelectField label={t('listing.state')} value={f.state} onChange={(e) => set({ state: e.target.value })}><option value="">{t('common.all')}</option>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</SelectField>
          <SelectField label="Farmer category" value={f.category} onChange={(e) => set({ category: e.target.value })} className="sm:col-span-2"><option value="">{t('common.all')}</option>{['landholding', 'tenant', 'sharecropper'].map((c) => <option key={c}>{c}</option>)}</SelectField>
        </Card>
      )}
      <Notice tone="info" title={t('schemes.disclaimer')} />
      {q.isLoading ? <PageLoader /> : q.error ? <ErrorState message={friendlyError(q.error, t)} /> : !q.data?.length ? <div className="mt-4"><EmptyState icon={<Landmark aria-hidden />} title={savedOnly ? t('schemes.noneSaved') : t('common.noResults')} /></div> : (
        <ul className="mt-5 grid gap-4 md:grid-cols-2">
          {q.data.map((s) => (
            <li key={s.id}>
              <Card className="flex h-full flex-col p-5">
                <div className="flex flex-wrap gap-2"><Badge tone="green">{s.scheme_type.replace(/_/g, ' ')}</Badge><Badge>{s.level}</Badge>{s.last_verified_at ? <Badge tone="green">{t('schemes.lastVerified', { d: date(s.last_verified_at) })}</Badge> : <Badge tone="blue">{t('common.verificationPending')}</Badge>}</div>
                <h2 className="mt-3 text-lg font-extrabold"><Link to={`/schemes/${s.slug}`} className="no-underline">{i18n.language === 'hi' && s.title_hi ? s.title_hi : s.title_en}</Link></h2>
                <p className="mt-1 text-sm text-charcoal-700">{i18n.language === 'hi' && s.summary_hi ? s.summary_hi : s.summary_en}</p>
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <LinkButton size="sm" variant="secondary" to={`/schemes/${s.slug}`}>{t('common.view')}</LinkButton>
                  <a href={s.official_url} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1 rounded-xl px-3 text-sm font-bold">{t('schemes.official')}<ExternalLink aria-hidden className="size-4" /></a>
                  {user && <Button size="sm" variant="ghost" onClick={() => toggle.mutate(s.id)} aria-pressed={saved.data?.has(s.id)}>{saved.data?.has(s.id) ? <><BookmarkCheck aria-hidden className="size-4" />{t('schemes.saved')}</> : <><Bookmark aria-hidden className="size-4" />{t('schemes.save')}</>}</Button>}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function SchemeDetailPage() {
  const { slug } = useParams()
  const { t, i18n } = useTranslation()
  const q = useQuery({ queryKey: ['scheme', slug], queryFn: async () => (await supabase.from('government_schemes').select('*').eq('slug', slug!).maybeSingle()).data })
  if (q.isLoading) return <PageLoader />
  const s = q.data
  if (!s) return <EmptyState title={t('errors.notFound')} />
  return (
    <div className="max-w-3xl">
      <Link to="/schemes" className="text-sm font-semibold">← {t('schemes.title')}</Link>
      <PageHeader title={i18n.language === 'hi' && s.title_hi ? s.title_hi : s.title_en} lead={i18n.language === 'hi' && s.summary_hi ? s.summary_hi : s.summary_en} />
      {s.last_verified_at ? <Notice tone="success" title={t('schemes.lastVerified', { d: date(s.last_verified_at) })} /> : <Notice tone="warn" title={t('schemes.pending')} />}
      <div className="mt-5 grid gap-4">
        <Card className="p-5"><h2 className="font-extrabold">{t('schemes.eligibility')}</h2><p className="mt-2 text-charcoal-700">{s.eligibility_en}</p></Card>
        <Card className="p-5"><h2 className="font-extrabold">{t('schemes.benefit')}</h2><p className="mt-2 text-charcoal-700">{s.benefit_en}</p></Card>
        <Card className="p-5"><h2 className="font-extrabold">{t('schemes.documents')}</h2><ul className="mt-2 list-disc pl-5 text-charcoal-700">{s.documents_en.map((d) => <li key={d}>{d}</li>)}</ul></Card>
        <Card className="p-5"><h2 className="font-extrabold">{t('schemes.steps')}</h2><ol className="mt-2 list-decimal pl-5 text-charcoal-700">{s.application_steps_en.map((d) => <li key={d}>{d}</li>)}</ol></Card>
        {(s.opens_on || s.closes_on) && <p className="text-sm">{date(s.opens_on)} – {date(s.closes_on)}</p>}
        <div className="flex flex-wrap gap-3">
          <a href={s.official_url} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-forest-700 px-5 font-semibold text-white no-underline">{t('schemes.official')}<ExternalLink aria-hidden className="size-4" /></a>
          {s.application_url && <a href={s.application_url} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-forest-200 bg-white px-5 font-semibold no-underline">{t('schemes.apply')}<ExternalLink aria-hidden className="size-4" /></a>}
        </div>
        <p className="text-sm text-charcoal-500">{t('schemes.disclaimer')}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------- landowner
export function LandPage() {
  const { t } = useTranslation()
  const { user, hasRole } = useAuth()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ title: '', state: 'Madhya Pradesh', district: '', locality: '', area: '', area_unit: 'acre', arrangement: 'lease', permitted_use: '', water_source: '', available_from: new Date().toISOString().slice(0, 10) })
  const [reply, setReply] = useState<Record<string, string>>({})
  const mine = useQuery({ queryKey: ['land', 'mine', user?.id], enabled: !!user && hasRole('landowner'), queryFn: async () => (await supabase.from('land_listings').select('*').eq('owner_id', user!.id).order('created_at', { ascending: false })).data ?? [] })
  const publicLand = useQuery({ queryKey: ['land', 'public'], queryFn: async () => (await supabase.from('land_listings').select('*').eq('status', 'published').order('created_at', { ascending: false }).limit(30)).data ?? [] })
  const enquiries = useQuery({ queryKey: ['land', 'enquiries', user?.id], enabled: !!user, queryFn: async () => (await supabase.from('land_enquiries').select('*').order('created_at', { ascending: false })).data ?? [] })
  const create = useMutation({
    mutationFn: async () => { const { error } = await supabase.from('land_listings').insert({ ...form, owner_id: user!.id, area: Number(form.area), status: 'published' }); if (error) throw error },
    onSuccess: () => { setOpen(false); void qc.invalidateQueries({ queryKey: ['land'] }) }, onError: (e) => toast.error(friendlyError(e, t)),
  })
  const enquire = useMutation({
    mutationFn: async ({ id, owner, message }: { id: string; owner: string; message: string }) => { const { error } = await supabase.from('land_enquiries').insert({ land_listing_id: id, owner_id: owner, enquirer_id: user!.id, message }); if (error) throw error },
    onSuccess: () => { toast.success(t('help.sent')); void qc.invalidateQueries({ queryKey: ['land'] }) }, onError: (e) => toast.error(friendlyError(e, t)),
  })
  const respond = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('land_enquiries').update({ owner_reply: reply[id], status: 'responded' }).eq('id', id); if (error) throw error },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['land'] }), onError: (e) => toast.error(friendlyError(e, t)),
  })
  const F = (k: keyof typeof form) => ({ value: form[k], onChange: (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value }) })
  return (
    <div>
      <PageHeader title={t('land.title')} lead={t('land.lead')} actions={hasRole('landowner') ? <Button onClick={() => setOpen(true)}><Plus aria-hidden className="size-4" />{t('land.create')}</Button> : undefined} />
      {!hasRole('landowner') && <div className="mb-5"><Notice tone="info" title={t('land.needsRole')}><Link to="/dashboard">{t('onboarding.title')}</Link></Notice></div>}
      {hasRole('landowner') && (mine.data?.length ?? 0) > 0 && (
        <section className="mb-8"><h2 className="mb-3 text-xl font-extrabold">{t('nav.landowner')}</h2>
          <ul className="grid gap-3 md:grid-cols-2">{mine.data!.map((l) => <li key={l.id}><Card className="p-4"><p className="font-extrabold">{l.title} <StatusBadge status={l.status} /></p><p className="text-sm text-charcoal-700">{l.area} {l.area_unit} · {t(`land.${l.arrangement}`)} · {l.district}</p></Card></li>)}</ul>
        </section>
      )}
      {(enquiries.data?.length ?? 0) > 0 && (
        <section className="mb-8"><h2 className="mb-3 text-xl font-extrabold">{t('land.enquiries')}</h2>
          <ul className="grid gap-3">{enquiries.data!.map((e) => (
            <li key={e.id}><Card className="p-4"><p className="text-sm">{e.message}</p><p className="text-xs text-charcoal-500">{dateTime(e.created_at)} · <StatusBadge status={e.status} /></p>
              {e.owner_reply && <p className="mt-2 rounded-xl bg-forest-50 p-2 text-sm">{e.owner_reply}</p>}
              {e.owner_id === user?.id && e.status === 'open' && <div className="mt-2 flex gap-2"><input className="field-input" aria-label={t('land.reply')} value={reply[e.id] ?? ''} onChange={(ev) => setReply({ ...reply, [e.id]: ev.target.value })} /><Button size="sm" onClick={() => respond.mutate(e.id)} disabled={!reply[e.id]}>{t('land.reply')}</Button></div>}
            </Card></li>))}
          </ul>
        </section>
      )}
      <h2 className="mb-3 text-xl font-extrabold">{t('land.publicTitle')}</h2>
      {!publicLand.data?.length ? <EmptyState icon={<LandPlot aria-hidden />} title={t('common.noResults')} /> : (
        <ul className="grid gap-4 md:grid-cols-2">
          {publicLand.data.map((l) => (
            <li key={l.id}><Card className="p-5">
              <p className="font-extrabold">{l.title}</p>
              <p className="text-sm text-charcoal-700">{l.area} {l.area_unit} · {t(`land.${l.arrangement}`)} · {l.district}, {l.state}</p>
              <p className="mt-1 text-sm">{l.permitted_use} {l.water_source && `· ${l.water_source}`}</p>
              {user && l.owner_id !== user.id && <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); const m = String(new FormData(e.currentTarget).get('m') ?? ''); if (m.length >= 5) enquire.mutate({ id: l.id, owner: l.owner_id, message: m }); e.currentTarget.reset() }}>
                <input name="m" className="field-input" aria-label={t('land.message')} placeholder={t('land.message')} minLength={5} required /><Button size="sm" type="submit">{t('land.enquire')}</Button></form>}
            </Card></li>
          ))}
        </ul>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title={t('land.create')} footer={<Button className="flex-1" loading={create.isPending} disabled={!form.title || !form.district || !(Number(form.area) > 0)} onClick={() => create.mutate()}>{t('common.save')}</Button>}>
        <div className="grid gap-3">
          <TextField label={t('listing.titleField')} {...F('title')} />
          <SelectField label={t('listing.state')} {...F('state')}>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</SelectField>
          <TextField label={t('listing.district')} {...F('district')} /><TextField label={t('listing.locality')} optional {...F('locality')} />
          <div className="grid grid-cols-2 gap-3"><TextField label={t('land.area')} inputMode="decimal" {...F('area')} /><SelectField label={t('common.unit')} {...F('area_unit')}>{['acre', 'hectare', 'bigha'].map((u) => <option key={u}>{u}</option>)}</SelectField></div>
          <SelectField label={t('land.arrangement')} {...F('arrangement')}>{['lease', 'sharecropping', 'partnership'].map((a) => <option key={a} value={a}>{t(`land.${a}`)}</option>)}</SelectField>
          <TextField label={t('land.permittedUse')} optional {...F('permitted_use')} /><TextField label={t('land.water')} optional {...F('water_source')} />
          <TextField label={t('listing.availableFrom')} type="date" {...F('available_from')} />
        </div>
      </Sheet>
    </div>
  )
}

// ---------------------------------------------------------------------------------- dashboard + onboarding
const REQUESTABLE = ['farmer', 'buyer', 'seed_seller', 'logistics', 'landowner'] as const

export function DashboardPage() {
  const { t } = useTranslation()
  const { profile, roles, hasRole, emailVerified, user } = useAuth()
  const qc = useQueryClient()
  const unread = useQuery({ queryKey: ['notifications', 'unread', user?.id], enabled: !!user, queryFn: async () => (await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null)).count ?? 0 })
  const request = useMutation({
    mutationFn: async (role: string) => { const { error } = await supabase.rpc('request_role', { p_role: role }); if (error) throw error },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['me'] }), onError: (e) => toast.error(friendlyError(e, t)),
  })
  const activeAny = roles.some((r) => r.status === 'active')
  const steps = [
    { done: emailVerified, label: t('onboarding.step1'), to: '/verify-email' },
    { done: activeAny, label: t('onboarding.step2'), to: '#roles' },
    { done: !!profile?.onboarding_completed || !!(profile?.district && profile?.state), label: t('onboarding.step3'), to: '/profile' },
  ]
  return (
    <div>
      <PageHeader title={t('dashboard.title', { name: profile?.display_name ?? '' })} lead={t('dashboard.lead')} />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <Card className="p-5">
          <h2 className="text-lg font-extrabold">{t('dashboard.checklist')}</h2>
          <ol className="mt-3 grid gap-2">{steps.map((s) => (
            <li key={s.label}><a href={s.to} className={cx('flex min-h-12 items-center gap-3 rounded-xl px-3 font-semibold no-underline', s.done ? 'text-forest-700' : 'bg-gold-100 text-forest-900')}>
              {s.done ? <CheckCircle2 aria-hidden className="size-5" /> : <Circle aria-hidden className="size-5" />}{s.label}{!s.done && <span className="ml-auto text-xs font-bold">{t('onboarding.nextAction')} →</span>}</a></li>
          ))}</ol>
          <p className="mt-4 text-sm"><Link to="/notifications">{t('dashboard.unread')}: <strong>{unread.data ?? 0}</strong></Link></p>
        </Card>
        <Card className="p-5" >
          <h2 id="roles" className="text-lg font-extrabold">{t('onboarding.title')}</h2>
          <p className="text-sm text-charcoal-700">{t('onboarding.lead')}</p>
          {!emailVerified && <div className="mt-3"><Notice tone="warn" title={t('errors.EMAIL_NOT_VERIFIED')} /></div>}
          <ul className="mt-4 grid gap-2">{REQUESTABLE.map((r) => {
            const row = roles.find((x) => x.role === r)
            return (
              <li key={r} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-forest-100 p-3">
                <div><p className="font-bold">{t(`onboarding.${r}`)}</p><p className="text-xs text-charcoal-500">{r === 'farmer' ? t('onboarding.farmerD') : r === 'buyer' ? t('onboarding.buyerD') : t('onboarding.reviewD')}</p></div>
                {row ? <StatusBadge status={row.status} label={t(`onboarding.${row.status}`)} /> : <Button size="sm" variant="secondary" disabled={!emailVerified} loading={request.isPending && request.variables === r} onClick={() => request.mutate(r)}>{t('onboarding.request')}</Button>}
              </li>
            )
          })}</ul>
        </Card>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {hasRole('farmer') && <LinkButton to="/farmer/harvest/new"><Sprout aria-hidden className="size-4" />{t('dashboard.quickFarmer')}</LinkButton>}
        {hasRole('buyer') && <LinkButton to="/buyer/requirements" variant="gold"><ShoppingBasket aria-hidden className="size-4" />{t('dashboard.quickBuyer')}</LinkButton>}
        {hasRole('buyer') && <LinkButton to="/matching" variant="secondary"><Network aria-hidden className="size-4" />{t('dashboard.quickMatch')}</LinkButton>}
        <LinkButton to="/seeds" variant="secondary">{t('dashboard.quickSeeds')}</LinkButton>
      </div>
    </div>
  )
}

export function ProfilePage() {
  const { t } = useTranslation()
  const { user, profile, roles } = useAuth()
  const qc = useQueryClient()
  const priv = useQuery({ queryKey: ['me', 'private', user?.id], enabled: !!user, queryFn: async () => (await supabase.from('profile_private').select('*').eq('id', user!.id).maybeSingle()).data })
  const [p, setP] = useState({ display_name: '', state: '', district: '', bio: '', phone: '', address: '' })
  useEffect(() => {
    if (profile) setP((x) => ({ ...x, display_name: profile.display_name, state: profile.state ?? '', district: profile.district ?? '', bio: profile.bio ?? '' }))
  }, [profile])
  useEffect(() => { if (priv.data) setP((x) => ({ ...x, phone: priv.data?.phone ?? '', address: priv.data?.address_line ?? '' })) }, [priv.data])
  const save = useMutation({
    mutationFn: async () => {
      const a = await supabase.from('profiles').update({ display_name: p.display_name.trim(), state: p.state || null, district: p.district || null, bio: p.bio || null, onboarding_completed: true }).eq('id', user!.id)
      if (a.error) throw a.error
      const b = await supabase.from('profile_private').update({ phone: p.phone || null, address_line: p.address || null }).eq('id', user!.id)
      if (b.error) throw b.error
    },
    onSuccess: () => { toast.success(t('profile.saved')); void qc.invalidateQueries({ queryKey: ['me'] }) }, onError: (e) => toast.error(friendlyError(e, t)),
  })
  const F = (k: keyof typeof p) => ({ value: p[k], onChange: (e: { target: { value: string } }) => setP({ ...p, [k]: e.target.value }) })
  return (
    <div className="max-w-3xl">
      <PageHeader title={t('profile.title')} lead={t('profile.lead')} />
      <form className="grid gap-6" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <h2 className="font-extrabold sm:col-span-2">{t('profile.public')}</h2>
          <TextField label={t('auth.name')} {...F('display_name')} required minLength={1} maxLength={80} className="sm:col-span-2" />
          <SelectField label={t('listing.state')} {...F('state')}><option value="">—</option>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</SelectField>
          <TextField label={t('listing.district')} {...F('district')} />
          <TextAreaField label={t('profile.bio')} optional {...F('bio')} maxLength={500} className="sm:col-span-2" />
        </Card>
        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <h2 className="font-extrabold sm:col-span-2">{t('profile.private')}</h2>
          <TextField label={t('profile.phone')} inputMode="tel" optional {...F('phone')} pattern="[0-9+ \-]{6,20}" />
          <TextField label={t('profile.address')} optional {...F('address')} maxLength={300} />
        </Card>
        <Card className="p-5"><h2 className="font-extrabold">{t('profile.roles')}</h2><div className="mt-2 flex flex-wrap gap-2">{roles.map((r) => <StatusBadge key={r.id} status={r.status} label={`${r.role} · ${r.status}`} />)}</div><p className="mt-2 text-sm text-charcoal-500">{user?.email}</p></Card>
        <Button type="submit" loading={save.isPending} className="w-fit">{t('common.save')}</Button>
      </form>
    </div>
  )
}

export function SettingsPage() {
  const { t } = useTranslation()
  const { refresh } = useAuth()
  const [disable3d, setDisable3d] = useState(readPrefs().disable3d)
  const [enrol, setEnrol] = useState<{ id: string; qr: string; secret: string } | null>(null)
  const [code, setCode] = useState('')
  const factors = useQuery({ queryKey: ['mfa-factors'], queryFn: async () => (await supabase.auth.mfa.listFactors()).data?.totp ?? [] })
  async function start() {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `SEED X ${new Date().toISOString().slice(0, 10)}` })
    if (error) { toast.error(error.message); return }
    setEnrol({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
  }
  async function verify() {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrol!.id, code })
    if (error) { toast.error(t('errors.validation')); return }
    setEnrol(null); setCode(''); void factors.refetch(); await refresh(); toast.success(t('settings.enrolled'))
  }
  return (
    <div className="max-w-2xl">
      <PageHeader title={t('settings.title')} />
      <div className="grid gap-5">
        <Card className="flex items-center justify-between p-5"><span className="font-bold">{t('settings.language')}</span><LanguageSwitch /></Card>
        <Card className="p-5"><label className="flex min-h-11 items-center gap-3 font-bold"><input type="checkbox" className="size-5 accent-forest-700" checked={disable3d} onChange={(e) => { setDisable3d(e.target.checked); writePrefs({ disable3d: e.target.checked }) }} />{t('settings.disable3d')}</label></Card>
        <Card className="grid gap-3 p-5">
          <h2 className="flex items-center gap-2 text-lg font-extrabold"><ShieldCheck aria-hidden className="size-5" />{t('settings.mfaTitle')}</h2>
          <p className="text-sm text-charcoal-700">{t('settings.mfaLead')}</p>
          {factors.data?.filter((f) => f.status === 'verified').map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-xl bg-forest-50 p-3"><span className="font-semibold">{t('settings.enrolled')} · {f.friendly_name}</span>
              <Button size="sm" variant="danger" onClick={async () => { const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id }); if (error) toast.error(error.message); else void factors.refetch() }}><Trash2 aria-hidden className="size-4" />{t('settings.remove')}</Button></div>
          ))}
          {!enrol ? <Button variant="secondary" className="w-fit" onClick={start}>{t('settings.enrol')}</Button> : (
            <div className="grid gap-3">
              <p className="text-sm">{t('settings.scan')}</p>
              <img src={enrol.qr} alt="TOTP QR code" className="size-48 rounded-xl bg-white p-2" />
              <code className="break-all rounded-lg bg-cream-50 p-2 text-xs">{enrol.secret}</code>
              <TextField label={t('auth.mfaCode')} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              <Button onClick={verify} disabled={code.length !== 6} className="w-fit">{t('auth.mfaVerify')}</Button>
            </div>
          )}
        </Card>
        <Card className="p-5"><Button variant="secondary" onClick={async () => { await supabase.auth.signOut({ scope: 'others' }); toast.success(t('settings.signedOutOthers')) }}>{t('settings.signOutOthers')}</Button></Card>
      </div>
    </div>
  )
}
