import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/app/auth'
import { rupees } from '@/lib/format'
import { Card, Stat } from '@/components/ui'

const ACTIVE_ORDER = ['confirmed', 'pickup_scheduled', 'in_transit', 'delivered', 'disputed']
type Count = { count: number | null; error: unknown }
const n = (r: Count) => (r.error ? null : r.count ?? 0)
const sum = (rows: { gross_paise: number }[] | null) => (rows ?? []).reduce((a, r) => a + Number(r.gross_paise), 0)

/** Real, RLS-scoped figures for the signed-in user only. Nothing here is estimated or invented. */
function useCentre(kind: 'farmer' | 'buyer' | 'seed_seller' | 'logistics', enabled: boolean) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['centre', kind, user?.id], enabled: enabled && !!user, staleTime: 30_000,
    queryFn: async () => {
      const me = user!.id
      const head = { count: 'exact' as const, head: true }
      if (kind === 'farmer') {
        const [listings, offers, orders, done, clients] = await Promise.all([
          supabase.from('harvest_listings').select('id', head).eq('farmer_id', me).in('status', ['published', 'partially_reserved', 'reserved']),
          supabase.from('offers').select('id', head).eq('farmer_id', me).eq('status', 'submitted').eq('proposed_by', 'buyer'),
          supabase.from('orders').select('id', head).eq('farmer_id', me).in('status', ACTIVE_ORDER),
          supabase.from('orders').select('gross_paise').eq('farmer_id', me).eq('status', 'completed').limit(1000),
          supabase.rpc('list_trade_contacts', { p_kind: 'client' }),
        ])
        return { a: n(listings), b: n(offers), c: n(orders), d: sum(done.data), e: (clients.data as unknown[] | null)?.length ?? 0 }
      }
      if (kind === 'buyer') {
        const [reqs, offers, orders, done, suppliers] = await Promise.all([
          supabase.from('demand_requests').select('id', head).eq('buyer_id', me).in('status', ['open', 'partially_filled']),
          supabase.from('offers').select('id', head).eq('buyer_id', me).eq('status', 'submitted').eq('proposed_by', 'farmer'),
          supabase.from('orders').select('id', head).eq('buyer_id', me).in('status', ACTIVE_ORDER),
          supabase.from('orders').select('gross_paise').eq('buyer_id', me).eq('status', 'completed').limit(1000),
          supabase.rpc('list_trade_contacts', { p_kind: 'supplier' }),
        ])
        return { a: n(reqs), b: n(offers), c: n(orders), d: sum(done.data), e: (suppliers.data as unknown[] | null)?.length ?? 0 }
      }
      if (kind === 'seed_seller') {
        const [active, products, pending, live] = await Promise.all([
          supabase.from('seed_products').select('id', head).eq('seller_id', me).eq('status', 'active'),
          supabase.from('seed_products').select('id').eq('seller_id', me).eq('status', 'active').limit(500),
          supabase.from('seed_orders').select('id', head).eq('seller_id', me).eq('status', 'pending'),
          supabase.from('seed_orders').select('id', head).eq('seller_id', me).in('status', ['confirmed', 'packed', 'dispatched']),
        ])
        const ids = (products.data ?? []).map((p) => p.id)
        const low = ids.length ? await supabase.from('seed_inventory').select('product_id', head).in('product_id', ids).lt('available_packs', 10) : { count: 0, error: null }
        return { a: n(active), b: n(low as Count), c: n(pending), d: 0, e: n(live) }
      }
      const jobs = await supabase.rpc('logistics_jobs')
      const rows = (jobs.data ?? []) as { status: string }[]
      return { a: rows.filter((r) => r.status === 'confirmed').length, b: rows.filter((r) => r.status === 'pickup_scheduled').length, c: rows.filter((r) => r.status === 'in_transit').length, d: 0, e: rows.length }
    },
  })
}

function Centre({ title, lead, to, stats, loading }: { title: string; lead: string; to: string; loading: boolean; stats: { label: string; value: string | number | null; href?: string; gold?: boolean }[] }) {
  const { t } = useTranslation()
  return (
    <Card as="section" className="p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div><h2 className="text-lg font-extrabold">{title}</h2><p className="text-sm text-charcoal-700">{lead}</p></div>
        <Link to={to} className="text-sm font-bold">{t('centre.open')} →</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {stats.map((s) => {
          const v = s.value === null ? (loading ? '…' : '—') : s.value
          return s.href ? <Link key={s.label} to={s.href} className="no-underline"><Stat label={s.label} value={v} tone={s.gold ? 'gold' : 'default'} /></Link> : <Stat key={s.label} label={s.label} value={v} tone={s.gold ? 'gold' : 'default'} />
        })}
      </div>
    </Card>
  )
}

export function RoleCentres() {
  const { t } = useTranslation()
  const { hasRole } = useAuth()
  const farmer = useCentre('farmer', hasRole('farmer'))
  const buyer = useCentre('buyer', hasRole('buyer'))
  const seeds = useCentre('seed_seller', hasRole('seed_seller'))
  const logistics = useCentre('logistics', hasRole('logistics'))
  const f = farmer.data, b = buyer.data, s = seeds.data, l = logistics.data
  return (
    <div className="mb-6 grid gap-4" data-testid="role-centres">
      {hasRole('farmer') && <Centre loading={farmer.isLoading} title={t('centre.farmer')} lead={t('centre.farmerLead')} to="/farmer" stats={[
        { label: t('centre.openListings'), value: f?.a ?? null, href: '/farmer/harvest' },
        { label: t('centre.offersToAnswer'), value: f?.b ?? null, href: '/farmer/offers', gold: !!f?.b },
        { label: t('centre.activeOrders'), value: f?.c ?? null, href: '/orders' },
        { label: t('centre.completedSales'), value: f ? rupees(f.d) : null, href: '/farmer/earnings' },
        { label: t('nav.clients'), value: f?.e ?? null, href: '/farmer/clients' },
      ]} />}
      {hasRole('buyer') && <Centre loading={buyer.isLoading} title={t('centre.buyer')} lead={t('centre.buyerLead')} to="/buyer" stats={[
        { label: t('centre.openRequirements'), value: b?.a ?? null, href: '/buyer/requirements' },
        { label: t('centre.offersToAnswer'), value: b?.b ?? null, href: '/buyer/purchases', gold: !!b?.b },
        { label: t('centre.activeOrders'), value: b?.c ?? null, href: '/orders' },
        { label: t('centre.completedSpend'), value: b ? rupees(b.d) : null, href: '/buyer/purchases' },
        { label: t('nav.suppliers'), value: b?.e ?? null, href: '/buyer/suppliers' },
      ]} />}
      {hasRole('seed_seller') && <Centre loading={seeds.isLoading} title={t('centre.seeds')} lead={t('centre.seedsLead')} to="/seeds/manage" stats={[
        { label: t('centre.activeProducts'), value: s?.a ?? null, href: '/seeds/manage' },
        { label: t('centre.lowStock'), value: s?.b ?? null, href: '/seeds/manage', gold: !!s?.b },
        { label: t('centre.newSeedOrders'), value: s?.c ?? null, href: '/seeds/orders', gold: !!s?.c },
        { label: t('centre.inFulfilment'), value: s?.e ?? null, href: '/seeds/orders' },
      ]} />}
      {hasRole('logistics') && <Centre loading={logistics.isLoading} title={t('centre.logistics')} lead={t('centre.logisticsLead')} to="/logistics" stats={[
        { label: t('centre.toSchedule'), value: l?.a ?? null, href: '/logistics', gold: !!l?.a },
        { label: t('centre.scheduled'), value: l?.b ?? null, href: '/logistics' },
        { label: t('centre.inTransit'), value: l?.c ?? null, href: '/logistics' },
        { label: t('centre.allJobs'), value: l?.e ?? null, href: '/logistics' },
      ]} />}
      {hasRole('admin') && <Card className="flex flex-wrap items-center justify-between gap-2 p-5"><div><h2 className="text-lg font-extrabold">{t('centre.admin')}</h2><p className="text-sm text-charcoal-700">{t('admin.mfaRequired')}</p></div><Link to="/admin" className="font-bold">{t('centre.open')} →</Link></Card>}
    </div>
  )
}
