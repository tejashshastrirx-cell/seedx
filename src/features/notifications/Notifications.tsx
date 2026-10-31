import { useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, ArchiveRestore, Bell, CheckCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/app/auth'
import { dateTime } from '@/lib/format'
import { friendlyError } from '@/lib/errors'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, PageLoader, cx } from '@/components/ui'

export const NOTIFICATION_CATEGORIES = ['offers', 'orders', 'seeds', 'matches', 'listings', 'account', 'security'] as const
const PAGE = 20

export function NotificationsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [category, setCategory] = useState<string>('')
  const [view, setView] = useState<'inbox' | 'unread' | 'archived'>('inbox')
  const [page, setPage] = useState(0)
  const q = useQuery({
    queryKey: ['notifications', 'list', category, view, page],
    queryFn: async () => {
      let r = supabase.from('notifications').select('*', { count: 'exact' })
      r = view === 'archived' ? r.not('archived_at', 'is', null) : r.is('archived_at', null)
      if (view === 'unread') r = r.is('read_at', null)
      if (category) r = r.eq('category', category)
      const { data, error, count } = await r.order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1)
      if (error) throw error
      return { rows: data, count: count ?? 0 }
    },
  })
  const refresh = () => void qc.invalidateQueries({ queryKey: ['notifications'] })
  const onError = (e: unknown) => toast.error(friendlyError(e, t))
  const markAll = useMutation({ mutationFn: async () => { const { error } = await supabase.rpc('mark_notifications_read', {}); if (error) throw error }, onSuccess: refresh, onError })
  const archive = useMutation({
    mutationFn: async ({ ids, on }: { ids: string[]; on: boolean }) => { const { error } = await supabase.rpc('archive_notifications', { p_ids: ids, p_archive: on }); if (error) throw error },
    onSuccess: refresh, onError,
  })
  const remove = useMutation({ mutationFn: async (id: string) => { const { error } = await supabase.from('notifications').delete().eq('id', id); if (error) throw error }, onSuccess: refresh, onError })
  const markRead = (id: string) => void supabase.rpc('mark_notifications_read', { p_ids: [id] }).then(refresh)

  const pages = Math.max(1, Math.ceil((q.data?.count ?? 0) / PAGE))
  const chip = (active: boolean) => cx('min-h-10 whitespace-nowrap rounded-xl px-3 text-sm font-bold', active ? 'bg-forest-700 text-white' : 'bg-white text-forest-800 ring-1 ring-forest-100')
  return (
    <div>
      <PageHeader title={t('notifications.title')} actions={<div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => markAll.mutate()}><CheckCheck aria-hidden className="size-4" />{t('notifications.markAll')}</Button>
        <Link to="/settings#notification-preferences" className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-bold">{t('notif.preferences')}</Link>
      </div>} />
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={t('notif.view')}>
        {(['inbox', 'unread', 'archived'] as const).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} className={chip(view === v)} onClick={() => { setView(v); setPage(0) }}>{t(`notif.views.${v}`)}</button>
        ))}
      </div>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label={t('notif.category')}>
        <button type="button" aria-pressed={!category} className={chip(!category)} onClick={() => { setCategory(''); setPage(0) }}>{t('common.all')}</button>
        {NOTIFICATION_CATEGORIES.map((c) => (
          <button key={c} type="button" aria-pressed={category === c} className={chip(category === c)} onClick={() => { setCategory(c); setPage(0) }}>{t(`notif.categories.${c}`)}</button>
        ))}
      </div>
      {q.isLoading ? <PageLoader /> : q.error ? <ErrorState message={friendlyError(q.error, t)} onRetry={() => q.refetch()} /> : !q.data?.rows.length ? (
        <EmptyState icon={<Bell aria-hidden />} title={t('notifications.none')} />
      ) : (
        <>
          <ul className="grid gap-2" data-testid="notification-list">
            {q.data.rows.map((n) => (
              <li key={n.id}>
                <Card className={cx('flex flex-wrap items-start gap-3 p-4', !n.read_at && 'border-gold-300')}>
                  {!n.read_at && <span className="mt-2 size-2.5 shrink-0 rounded-full bg-gold-400" aria-label={t('notif.unread')} />}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2"><Badge tone="green">{t(`notif.categories.${n.category ?? 'security'}`)}</Badge><span className="text-xs text-charcoal-500">{dateTime(n.created_at)}</span></p>
                    <Link to={n.link ?? '/dashboard'} onClick={() => !n.read_at && markRead(n.id)} className="mt-1 block font-bold text-forest-800">{n.title}</Link>
                    {n.body && <p className="text-sm text-charcoal-700">{n.body}</p>}
                  </div>
                  <div className="flex gap-1">
                    {n.archived_at
                      ? <Button size="sm" variant="ghost" onClick={() => archive.mutate({ ids: [n.id], on: false })} aria-label={t('notif.unarchive')}><ArchiveRestore aria-hidden className="size-4" /></Button>
                      : <Button size="sm" variant="ghost" onClick={() => archive.mutate({ ids: [n.id], on: true })} aria-label={t('notif.archive')}><Archive aria-hidden className="size-4" /></Button>}
                    <Button size="sm" variant="ghost" onClick={() => remove.mutate(n.id)} aria-label={t('common.delete')}><Trash2 aria-hidden className="size-4" /></Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          <nav className="mt-4 flex items-center justify-between" aria-label={t('common.page', { n: page + 1 })}>
            <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>{t('common.previous')}</Button>
            <span className="text-sm">{t('common.page', { n: page + 1 })} / {pages}</span>
            <Button variant="secondary" size="sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>{t('common.next')}</Button>
          </nav>
        </>
      )}
    </div>
  )
}

/** Settings panel: optional categories only; orders/account/security are always delivered in-app. */
export function NotificationPreferences() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['notification-preferences', user?.id], enabled: !!user,
    queryFn: async () => { const { data, error } = await supabase.from('notification_preferences').select('*').maybeSingle(); if (error) throw error; return data },
  })
  const save = useMutation({
    mutationFn: async (patch: Partial<Record<'in_app_offers' | 'in_app_seeds' | 'in_app_matches' | 'in_app_listings' | 'email_enabled', boolean>>) => {
      const { error } = q.data
        ? await supabase.from('notification_preferences').update(patch).eq('user_id', user!.id)
        : await supabase.from('notification_preferences').insert(patch)
      if (error) throw error
    },
    onSuccess: () => { toast.success(t('notif.prefsSaved')); void qc.invalidateQueries({ queryKey: ['notification-preferences'] }) },
    onError: (e) => toast.error(friendlyError(e, t)),
  })
  const p = q.data ?? { in_app_offers: true, in_app_seeds: true, in_app_matches: true, in_app_listings: true, email_enabled: false }
  const optional = [['in_app_offers', 'offers'], ['in_app_seeds', 'seeds'], ['in_app_matches', 'matches'], ['in_app_listings', 'listings']] as const
  return (
    <Card as="section" className="grid gap-3 p-5">
      <h2 id="notification-preferences" className="text-lg font-extrabold">{t('notif.preferences')}</h2>
      <p className="text-sm text-charcoal-700">{t('notif.prefsLead')}</p>
      {optional.map(([key, cat]) => (
        <label key={key} className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="size-5" checked={p[key]} disabled={save.isPending || q.isLoading} onChange={(e) => save.mutate({ [key]: e.target.checked })} />
          {t(`notif.categories.${cat}`)}
        </label>
      ))}
      {(['orders', 'account', 'security'] as const).map((cat) => (
        <label key={cat} className="flex min-h-11 items-center gap-3 text-charcoal-700">
          <input type="checkbox" className="size-5" checked disabled />{t(`notif.categories.${cat}`)} <Badge>{t('notif.always')}</Badge>
        </label>
      ))}
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" className="size-5" checked={p.email_enabled} disabled={save.isPending || q.isLoading} onChange={(e) => save.mutate({ email_enabled: e.target.checked })} />
        {t('notif.email')}
      </label>
      <p className="text-sm text-warn-700">{t('notif.emailPending')}</p>
    </Card>
  )
}
