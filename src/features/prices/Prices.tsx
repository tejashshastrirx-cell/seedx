import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { LineChart as ChartIcon, SlidersHorizontal } from 'lucide-react'
import { convertPricePerUnit, type Unit } from '@shared/clustercart'
import { supabase } from '@/lib/supabase'
import { INDIAN_STATES, useCommodities, useCommodityName } from '@/lib/catalog'
import { date, daysAgo, rupees, toPaise, unitShort } from '@/lib/format'
import { friendlyError } from '@/lib/errors'
import { Badge, Button, Card, EmptyState, ErrorState, Notice, PageHeader, Pager, SelectField, Sheet, Skeleton, TextField, cx } from '@/components/ui'

const PAGE = 25
const TYPES = ['mandi_wholesale', 'msp_reference', 'seed_input'] as const
const DEFAULTS: Record<string, string> = { type: 'mandi_wholesale', show: 'quintal', sort: 'newest' }

export function PricesPage({ explorer = false }: { explorer?: boolean }) {
  const { t, i18n } = useTranslation()
  const [params, setParams] = useSearchParams()
  const commodities = useCommodities()
  const name = useCommodityName()
  const [sheet, setSheet] = useState(false)
  const get = (k: string) => params.get(k) ?? DEFAULTS[k] ?? ''
  const f = { type: get('type'), crop: get('crop'), state: get('state'), district: get('district'), market: get('market'), from: get('from'), to: get('to'), min: get('min'), max: get('max'), show: get('show') as Unit, sort: get('sort'), source: get('source') }
  const page = Number(params.get('page') ?? 0)
  const set = (patch: Record<string, string>) => {
    const n = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) (v && v !== DEFAULTS[k]) ? n.set(k, v) : n.delete(k)
    if (!('page' in patch)) n.delete('page')
    setParams(n)
  }

  const sources = useQuery({ queryKey: ['data-sources'], queryFn: async () => (await supabase.from('data_sources').select('*')).data ?? [] })
  const q = useQuery({
    queryKey: ['prices', f, page],
    queryFn: async () => {
      if (f.type === 'seed_input') {
        let qb = supabase.from('seed_products').select('id,commodity_id,brand,variety_name,pack_size,pack_unit,price_paise,updated_at,is_demo,seller_id', { count: 'exact' }).eq('status', 'active')
        if (f.crop) qb = qb.eq('commodity_id', Number(f.crop))
        if (f.min && !Number.isNaN(toPaise(f.min))) qb = qb.gte('price_paise', toPaise(f.min))
        if (f.max && !Number.isNaN(toPaise(f.max))) qb = qb.lte('price_paise', toPaise(f.max))
        const { data, error, count } = await qb.order(f.sort === 'newest' ? 'updated_at' : 'price_paise', { ascending: f.sort === 'lowest' }).range(page * PAGE, page * PAGE + PAGE - 1)
        if (error) throw error
        return { kind: 'seed' as const, rows: data, count: count ?? 0 }
      }
      let qb = supabase.from('market_price_observations').select('*', { count: 'exact' }).eq('price_type', f.type)
      if (f.crop) qb = qb.eq('commodity_id', Number(f.crop))
      if (f.state) qb = qb.eq('state', f.state)
      if (f.district) qb = qb.ilike('district', f.district.replace(/[%_]/g, ''))
      if (f.market) qb = qb.ilike('market', `%${f.market.replace(/[%_]/g, '')}%`)
      if (f.from) qb = qb.gte('observed_on', f.from)
      if (f.to) qb = qb.lte('observed_on', f.to)
      if (f.source) qb = qb.eq('source_id', Number(f.source))
      // Price bounds are entered in the displayed unit and converted to each row's unit server-side
      // only for quintal rows (all current sources report Rs/quintal); other units are converted client-side below.
      if (f.min && !Number.isNaN(toPaise(f.min))) qb = qb.gte('modal_paise', Math.round(convertPricePerUnit(toPaise(f.min), f.show, 'quintal')))
      if (f.max && !Number.isNaN(toPaise(f.max))) qb = qb.lte('modal_paise', Math.round(convertPricePerUnit(toPaise(f.max), f.show, 'quintal')))
      const order = f.sort === 'newest' ? { col: 'observed_on', asc: false } : { col: 'modal_paise', asc: f.sort === 'lowest' }
      const { data, error, count } = await qb.order(order.col, { ascending: order.asc }).order('id').range(page * PAGE, page * PAGE + PAGE - 1)
      if (error) throw error
      return { kind: 'market' as const, rows: data, count: count ?? 0 }
    },
  })
  const trendKey = f.crop && f.type === 'mandi_wholesale' ? [f.crop, f.state, f.market] : null
  const trend = useQuery({
    queryKey: ['price-trend', trendKey],
    enabled: !!trendKey,
    queryFn: async () => {
      let qb = supabase.from('market_price_observations').select('observed_on,modal_paise,unit,market').eq('price_type', 'mandi_wholesale').eq('commodity_id', Number(f.crop)).order('observed_on')
      if (f.state) qb = qb.eq('state', f.state)
      if (f.market) qb = qb.ilike('market', `%${f.market.replace(/[%_]/g, '')}%`)
      const { data } = await qb.limit(400)
      const byDay = new Map<string, number[]>()
      for (const r of data ?? []) { const v = convertPricePerUnit(r.modal_paise, r.unit as Unit, f.show) / 100; byDay.set(r.observed_on, [...(byDay.get(r.observed_on) ?? []), v]) }
      return [...byDay].map(([d, vs]) => ({ d: d.slice(5), v: Math.round(vs.reduce((a, b) => a + b, 0) / vs.length) }))
    },
  })
  const srcName = useMemo(() => Object.fromEntries((sources.data ?? []).map((s) => [s.id, s])), [sources.data])
  const conv = (paise: number | null, unit: string) => paise == null ? '-' : rupees(Math.round(convertPricePerUnit(paise, unit as Unit, f.show)))
  const activeChips = Object.entries(f).filter(([k, v]) => v && v !== DEFAULTS[k] && k !== 'show' && k !== 'sort')

  const controls = (where: string) => (
    <div className="grid gap-4">
      <fieldset>
        <legend className="field-label">{t('prices.type')}</legend>
        <div className="grid gap-2">
          {TYPES.map((ty) => (
            <label key={ty} className={cx('flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 font-semibold', f.type === ty ? 'border-forest-600 bg-forest-50' : 'border-forest-200')}>
              <input type="radio" name={`ptype-${where}`} className="size-4 accent-forest-700" checked={f.type === ty} onChange={() => set({ type: ty })} />{t(`prices.${ty}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <SelectField label={t('common.commodity')} value={f.crop} onChange={(e) => set({ crop: e.target.value })}><option value="">{t('common.all')}</option>{commodities.data?.map((c) => <option key={c.id} value={c.id}>{i18n.language === 'hi' ? c.name_hi : c.name_en}</option>)}</SelectField>
      {f.type !== 'seed_input' && <>
        <SelectField label={t('prices.state')} value={f.state} onChange={(e) => set({ state: e.target.value })}><option value="">{t('common.all')}</option>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</SelectField>
        <TextField label={t('prices.district')} defaultValue={f.district} onBlur={(e) => e.target.value !== f.district && set({ district: e.target.value })} />
        <TextField label={t('prices.market')} defaultValue={f.market} onBlur={(e) => e.target.value !== f.market && set({ market: e.target.value })} />
        <div className="grid grid-cols-2 gap-3"><TextField label={t('prices.from')} type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} /><TextField label={t('prices.to')} type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} /></div>
        <SelectField label={t('common.source')} value={f.source} onChange={(e) => set({ source: e.target.value })}><option value="">{t('common.all')}</option>{sources.data?.filter((s) => s.price_type === f.type).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectField>
        <SelectField label={t('prices.showIn')} value={f.show} onChange={(e) => set({ show: e.target.value })}>{['quintal', 'kg', 'tonne'].map((u) => <option key={u} value={u}>{u}</option>)}</SelectField>
      </>}
      <div className="grid grid-cols-2 gap-3">
        <TextField label={`${t('prices.min')} ₹/${unitShort(f.type === 'seed_input' ? 'pack' : f.show)}`} inputMode="decimal" defaultValue={f.min} onBlur={(e) => e.target.value !== f.min && set({ min: e.target.value })} />
        <TextField label={`${t('prices.max')} ₹/${unitShort(f.type === 'seed_input' ? 'pack' : f.show)}`} inputMode="decimal" defaultValue={f.max} onBlur={(e) => e.target.value !== f.max && set({ max: e.target.value })} />
      </div>
      <SelectField label={t('prices.sort')} value={f.sort} onChange={(e) => set({ sort: e.target.value })}>
        <option value="newest">{t('prices.newest')}</option><option value="highest">{t('prices.highest')}</option><option value="lowest">{t('prices.lowest')}</option>
      </SelectField>
    </div>
  )

  return (
    <div>
      <PageHeader eyebrow={t(`prices.${f.type}`)} title={t('prices.title')} lead={t('prices.lead')} />
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <aside className="hidden lg:block" aria-label={t('common.filters')}><Card className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto p-5">{controls('rail')}</Card></aside>
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setSheet(true)} data-testid="open-price-filters"><SlidersHorizontal aria-hidden className="size-4" />{t('common.filters')}</Button>
            <Badge tone="green">{t(`prices.${f.type}`)}</Badge>
            <span className="text-sm font-semibold text-charcoal-700" aria-live="polite" data-testid="price-count">{q.data ? t('common.results', { count: q.data.count }) : ''}</span>
            {activeChips.filter(([k]) => k !== 'type').map(([k, v]) => <button key={k} onClick={() => set({ [k]: '' })} className="rounded-full bg-forest-100 px-3 py-1.5 text-xs font-bold text-forest-800">{k === 'crop' ? name(Number(v)) : v} ✕</button>)}
            {activeChips.length > 0 && <Button variant="ghost" size="sm" onClick={() => setParams({})}>{t('common.reset')}</Button>}
          </div>
          {f.type === 'msp_reference' && <div className="mb-4"><Notice tone="info" title={t('prices.mspNote')} /></div>}
          {f.type === 'mandi_wholesale' && <div className="mb-4"><Notice tone="warn" title={t('prices.sampleNote')} /></div>}
          {explorer && trendKey && (trend.data?.length ?? 0) > 1 && (
            <Card className="mb-5 p-4">
              <h2 className="mb-2 flex items-center gap-2 text-base font-extrabold"><ChartIcon aria-hidden className="size-4" />{t('prices.trend')} · ₹/{unitShort(f.show)}</h2>
              <div className="h-56"><ResponsiveContainer><LineChart data={trend.data}><CartesianGrid stroke="#E6F1E7" /><XAxis dataKey="d" fontSize={12} /><YAxis fontSize={12} width={56} domain={['auto', 'auto']} /><Tooltip formatter={(v) => `₹${v}`} /><Line dataKey="v" stroke="#174B35" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer></div>
            </Card>
          )}
          {q.isLoading ? <div className="grid gap-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
            : q.error ? <ErrorState message={friendlyError(q.error, t)} onRetry={() => q.refetch()} />
            : !q.data?.rows.length ? <EmptyState title={t('common.noResults')} action={<Button variant="secondary" onClick={() => setParams({})}>{t('common.clearFilters')}</Button>} />
            : q.data.kind === 'seed' ? (
              <ul className="grid gap-2" data-testid="price-rows">{q.data.rows.map((r) => (
                <li key={r.id} className="card flex flex-wrap items-center justify-between gap-2 p-4"><div><p className="font-bold">{name(r.commodity_id)} · {r.brand} {r.variety_name}</p><p className="text-xs text-charcoal-500">{t('prices.seed_input')} · {r.pack_size} {r.pack_unit} · {t('common.updated')} {date(r.updated_at)} {r.is_demo && '· ' + t('common.demo')}</p></div><span className="tabular text-lg font-extrabold">{rupees(r.price_paise)}</span></li>
              ))}</ul>
            ) : (
              <Card className="overflow-x-auto p-0">
                <table className="w-full min-w-[48rem] text-left text-sm" data-testid="price-rows">
                  <thead className="bg-forest-50"><tr>{[t('common.commodity'), t('prices.market'), t('prices.min'), t('prices.modal'), t('prices.max'), t('common.reportedOn'), t('common.source')].map((h) => <th key={h} className="px-3 py-3 font-bold">{h}</th>)}</tr></thead>
                  <tbody>{q.data.rows.map((r) => {
                    const age = daysAgo(r.observed_on)
                    return (
                      <tr key={r.id} className="border-t border-forest-100">
                        <td className="px-3 py-3"><p className="font-bold">{name(r.commodity_id)}</p><p className="text-xs text-charcoal-500">{r.variety}{r.season ? ` · ${r.season}` : ''}</p></td>
                        <td className="px-3 py-3">{r.market ?? '—'}<p className="text-xs text-charcoal-500">{[r.district, r.state].filter(Boolean).join(', ') || 'All India'}</p></td>
                        <td className="tabular px-3 py-3">{conv(r.min_paise, r.unit)}</td>
                        <td className="tabular px-3 py-3 font-extrabold text-forest-800">{conv(r.modal_paise, r.unit)}<span className="text-xs font-normal">/{unitShort(f.show)}</span></td>
                        <td className="tabular px-3 py-3">{conv(r.max_paise, r.unit)}</td>
                        <td className="px-3 py-3">{date(r.observed_on)}<p className="text-xs">{r.price_type === 'msp_reference' ? '' : age <= 2 ? <span className="text-forest-600">{t('prices.fresh')}</span> : <span className="text-warn-700">{t('prices.stale', { n: age })}</span>}</p></td>
                        <td className="px-3 py-3 text-xs">{srcName[r.source_id]?.publisher ?? ''}<div className="mt-1 flex flex-wrap gap-1">{r.is_sample && <Badge tone="amber">SAMPLE</Badge>}{r.verification_status === 'verification_pending' && <Badge tone="blue">{t('common.verificationPending')}</Badge>}</div><p className="text-charcoal-500">{t('common.retrievedAt')} {date(r.retrieved_at)}</p></td>
                      </tr>
                    )
                  })}</tbody>
                </table>
              </Card>
            )}
          <Pager page={page} hasMore={!!q.data && (page + 1) * PAGE < q.data.count} onPage={(p) => set({ page: String(p) })} />
        </div>
      </div>
      <Sheet open={sheet} onClose={() => setSheet(false)} title={t('common.filters')}
        footer={<><Button variant="secondary" className="flex-1" onClick={() => { setParams({}); setSheet(false) }}>{t('common.reset')}</Button><Button className="flex-1" onClick={() => setSheet(false)} data-testid="apply-price-filters">{t('common.apply')}</Button></>}>
        {controls('sheet')}
      </Sheet>
    </div>
  )
}
