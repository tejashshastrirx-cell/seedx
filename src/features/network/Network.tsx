import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Star, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { date, rupees } from '@/lib/format'
import { friendlyError } from '@/lib/errors'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, PageLoader, SelectField, TextAreaField, TextField, cx } from '@/components/ui'

export type ContactKind = 'client' | 'supplier'
export const STAGES = ['lead', 'saved', 'enquiry', 'active', 'existing_client', 'repeat_client'] as const
const stageTone: Record<string, 'grey' | 'blue' | 'gold' | 'green' | 'amber'> = {
  lead: 'grey', saved: 'grey', enquiry: 'blue', active: 'gold', existing_client: 'green', repeat_client: 'green',
}

type Contact = {
  counterparty_id: string; display_name: string; district: string | null; state: string | null; stage: string; is_favourite: boolean
  private_note: string | null; saved: boolean; completed_orders: number; active_orders: number; offers_count: number
  completed_gross_paise: number; last_interaction_at: string | null
}

export function useContacts(kind: ContactKind) {
  return useQuery({
    queryKey: ['contacts', kind],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_trade_contacts', { p_kind: kind })
      if (error) throw error
      return (data ?? []) as Contact[]
    },
  })
}

/** Upserts the caller's private contact row (owner is forced server-side). */
function useContactWrite(kind: ContactKind) {
  const qc = useQueryClient()
  const { t } = useTranslation()
  return useMutation({
    mutationFn: async (v: { counterparty_id: string; saved: boolean; patch: { is_favourite?: boolean; private_note?: string | null; manual_stage?: 'lead' | 'saved' } }) => {
      const { error } = v.saved
        ? await supabase.from('trade_contacts').update(v.patch).eq('counterparty_id', v.counterparty_id).eq('kind', kind)
        : await supabase.from('trade_contacts').insert({ counterparty_id: v.counterparty_id, kind, ...v.patch })
      if (error) throw error
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['contacts'] }); toast.success(t('contacts.saved')) },
    onError: (e) => toast.error(friendlyError(e, t)),
  })
}

export function SaveContactButton({ counterpartyId, kind }: { counterpartyId: string; kind: ContactKind }) {
  const { t } = useTranslation()
  const contacts = useContacts(kind)
  const write = useContactWrite(kind)
  const existing = contacts.data?.find((c) => c.counterparty_id === counterpartyId)
  if (existing?.saved) return <Badge tone="green">{t(kind === 'client' ? 'contacts.inClients' : 'contacts.inSuppliers')}</Badge>
  return (
    <Button size="sm" variant="secondary" disabled={write.isPending} onClick={() => write.mutate({ counterparty_id: counterpartyId, saved: false, patch: { manual_stage: 'saved' } })}>
      <UserPlus aria-hidden className="size-4" />{t(kind === 'client' ? 'contacts.saveClient' : 'contacts.saveSupplier')}
    </Button>
  )
}

function ContactsPage({ kind }: { kind: ContactKind }) {
  const { t } = useTranslation()
  const q = useContacts(kind)
  const write = useContactWrite(kind)
  const [stage, setStage] = useState('')
  const [search, setSearch] = useState('')
  const [favOnly, setFavOnly] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const rows = useMemo(() => (q.data ?? []).filter((c) =>
    (!stage || c.stage === stage) && (!favOnly || c.is_favourite) &&
    (!search || `${c.display_name} ${c.district ?? ''} ${c.state ?? ''}`.toLowerCase().includes(search.toLowerCase()))), [q.data, stage, search, favOnly])
  const title = t(kind === 'client' ? 'contacts.clientsTitle' : 'contacts.suppliersTitle')
  return (
    <div>
      <PageHeader title={title} lead={t(kind === 'client' ? 'contacts.clientsLead' : 'contacts.suppliersLead')} />
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
        <TextField label={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <SelectField label={t('contacts.stage')} value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="">{t('common.all')}</option>
          {STAGES.map((s) => <option key={s} value={s}>{t(`contacts.stages.${s}`)}</option>)}
        </SelectField>
        <label className="flex min-h-11 items-center gap-2 font-bold"><input type="checkbox" className="size-5" checked={favOnly} onChange={(e) => setFavOnly(e.target.checked)} />{t('contacts.favourites')}</label>
      </div>
      {q.isLoading ? <PageLoader /> : q.error ? <ErrorState message={friendlyError(q.error, t)} onRetry={() => q.refetch()} /> : !rows.length ? (
        <EmptyState icon={<Users aria-hidden />} title={t('contacts.empty')} body={t(kind === 'client' ? 'contacts.emptyClients' : 'contacts.emptySuppliers')} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2" data-testid="contact-list">
          {rows.map((c) => (
            <li key={c.counterparty_id}>
              <Card className="grid gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-extrabold text-forest-800">{c.display_name}</p>
                    <p className="text-sm text-charcoal-700">{[c.district, c.state].filter(Boolean).join(', ') || '—'}</p>
                  </div>
                  <button type="button" aria-pressed={c.is_favourite} aria-label={t('contacts.favourite')} className="grid size-11 place-items-center rounded-xl hover:bg-forest-50"
                    onClick={() => write.mutate({ counterparty_id: c.counterparty_id, saved: c.saved, patch: { is_favourite: !c.is_favourite } })}>
                    <Star aria-hidden className={cx('size-5', c.is_favourite ? 'fill-gold-400 text-gold-500' : 'text-charcoal-500')} />
                  </button>
                </div>
                <p className="flex flex-wrap gap-2"><Badge tone={stageTone[c.stage] ?? 'grey'}>{t(`contacts.stages.${c.stage}`)}</Badge>{!c.saved && <Badge>{t('contacts.fromHistory')}</Badge>}</p>
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <div><dt className="text-charcoal-500">{t('contacts.completed')}</dt><dd className="font-bold">{c.completed_orders}</dd></div>
                  <div><dt className="text-charcoal-500">{t('contacts.activeOrders')}</dt><dd className="font-bold">{c.active_orders}</dd></div>
                  <div><dt className="text-charcoal-500">{t('contacts.offers')}</dt><dd className="font-bold">{c.offers_count}</dd></div>
                </dl>
                <p className="text-sm">{t('contacts.tradedValue')}: <strong>{rupees(c.completed_gross_paise)}</strong>{c.last_interaction_at && <> · {t('contacts.last')} {date(c.last_interaction_at)}</>}</p>
                {editing === c.counterparty_id ? (
                  <div className="grid gap-2">
                    <TextAreaField label={t('contacts.note')} hint={t('contacts.notePrivate')} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => { write.mutate({ counterparty_id: c.counterparty_id, saved: c.saved, patch: { private_note: note.trim() || null } }); setEditing(null) }}>{t('common.save')}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {c.private_note && <p className="flex-1 rounded-lg bg-cream-100 p-2 text-sm">{c.private_note}</p>}
                    <Button size="sm" variant="secondary" onClick={() => { setEditing(c.counterparty_id); setNote(c.private_note ?? '') }}>{t('contacts.editNote')}</Button>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function ClientsPage() { return <ContactsPage kind="client" /> }
export function SuppliersPage() { return <ContactsPage kind="supplier" /> }
