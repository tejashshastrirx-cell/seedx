import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { localName, useCommodities, useCropCategories } from '@/lib/catalog'
import { LANGUAGES } from '@/i18n/languages'
import { Badge, Button, Card, ErrorState, PageHeader, PageLoader, SelectField, TextField } from '@/components/ui'
import type { Tables } from '@/types/database'
import { AdminNav } from './Admin'

type Draft = { code: string; category: string; unit: string; shelf: number; active: boolean; sort: number; names: Record<string, string> }
const empty: Draft = { code: '', category: 'vegetable', unit: 'kg', shelf: 7, active: true, sort: 100, names: {} }
const toDraft = (c: Tables<'commodities'>): Draft => ({
  code: c.code, category: c.category, unit: c.default_unit, shelf: c.shelf_life_days, active: c.is_active, sort: c.sort_order,
  names: { ...((c.names ?? {}) as Record<string, string>) },
})

export function AdminCataloguePage() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const commodities = useCommodities()
  const categories = useCropCategories()
  const [draft, setDraft] = useState<Draft | null>(null)
  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const names = Object.fromEntries(Object.entries(d.names).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v))
      const { error } = await supabase.rpc('admin_upsert_commodity', {
        p_code: d.code.trim(), p_category: d.category, p_names: names, p_default_unit: d.unit,
        p_shelf_life_days: d.shelf, p_is_active: d.active, p_sort_order: d.sort,
      })
      if (error) throw error
    },
    onSuccess: () => { toast.success(t('catalogue.saved')); setDraft(null); void qc.invalidateQueries({ queryKey: ['catalog'] }) },
    onError: (e) => toast.error(friendlyError(e, t)),
  })
  if (commodities.isLoading || categories.isLoading) return <PageLoader />
  if (commodities.error) return <ErrorState message={friendlyError(commodities.error, t)} onRetry={() => commodities.refetch()} />
  const lang = i18n.language
  return (
    <div>
      <PageHeader title={t('catalogue.title')} lead={t('catalogue.lead')} /><AdminNav />
      <div className="mb-4"><Button onClick={() => setDraft({ ...empty, names: {} })}>{t('catalogue.add')}</Button></div>
      {draft && (
        <Card className="mb-6 grid gap-4 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField label={t('catalogue.code')} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} hint="a-z and _ only" />
            <SelectField label={t('catalogue.category')} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
              {categories.data?.map((c) => <option key={c.code} value={c.code}>{localName(c.names, lang, c.code)}</option>)}
            </SelectField>
            <SelectField label={t('common.unit')} value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })}>
              {['kg', 'quintal', 'tonne'].map((u) => <option key={u}>{u}</option>)}
            </SelectField>
            <TextField label={t('catalogue.shelf')} type="number" min={1} max={720} value={draft.shelf} onChange={(e) => setDraft({ ...draft, shelf: Number(e.target.value) })} />
            <TextField label={t('catalogue.sort')} type="number" value={draft.sort} onChange={(e) => setDraft({ ...draft, sort: Number(e.target.value) })} />
            <label className="flex items-center gap-2 pt-7 font-bold"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />{t('catalogue.active')}</label>
          </div>
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 font-extrabold">{t('catalogue.names')}</legend>
            {LANGUAGES.map((l) => (
              <TextField key={l.code} lang={l.code} label={`${l.native} (${l.english})`} optional={l.code !== 'en'} maxLength={80}
                value={draft.names[l.code] ?? ''} onChange={(e) => setDraft({ ...draft, names: { ...draft.names, [l.code]: e.target.value } })} />
            ))}
          </fieldset>
          <div className="flex gap-2">
            <Button disabled={save.isPending || !draft.code || !(draft.names.en ?? '').trim()} onClick={() => save.mutate(draft)}>{save.isPending ? t('common.saving') : t('common.save')}</Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>{t('common.cancel')}</Button>
          </div>
          <p className="text-sm text-charcoal-700">{t('catalogue.mfaNote')}</p>
        </Card>
      )}
      {categories.data?.map((cat) => {
        const items = (commodities.data ?? []).filter((c) => c.category === cat.code)
        if (!items.length) return null
        return (
          <section key={cat.code} className="mb-6">
            <h2 className="mb-2 text-lg font-extrabold">{localName(cat.names, lang, cat.code)} <span className="text-sm font-normal">({items.length})</span></h2>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((c) => {
                const missing = LANGUAGES.filter((l) => !((c.names ?? {}) as Record<string, string>)[l.code]).length
                return (
                  <li key={c.id}><Card className="flex items-center justify-between gap-2 p-3">
                    <div><p className="font-bold">{localName(c.names, lang, c.name_en)}</p>
                      <p className="text-xs text-charcoal-700">{c.code} · {c.default_unit} {!c.is_active && <Badge tone="red">{t('catalogue.inactive')}</Badge>} {missing > 0 && <Badge tone="amber">{t('catalogue.missing', { count: missing })}</Badge>}</p></div>
                    <Button size="sm" variant="secondary" onClick={() => setDraft(toDraft(c))}>{t('common.edit')}</Button>
                  </Card></li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
