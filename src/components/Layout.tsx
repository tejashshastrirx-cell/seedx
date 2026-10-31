import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Languages, LayoutDashboard, LogOut, Menu, Package, ShoppingBasket, Sprout, Truck, Users, X } from 'lucide-react'
import { useAuth } from '@/app/auth'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { readPrefs, writePrefs } from '@/lib/prefs'
import { LANGUAGES, isLangCode, type LangCode } from '@/i18n/languages'
import { Logo } from './Logo'
import { Button, Notice, cx } from './ui'
import { PageTransition } from './motion'

const publicLinks = [
  { to: '/marketplace', k: 'nav.marketplace' }, { to: '/prices', k: 'nav.prices' }, { to: '/seeds', k: 'nav.seeds' },
  { to: '/schemes', k: 'nav.schemes' }, { to: '/how-it-works', k: 'nav.howItWorks' }, { to: '/about', k: 'nav.about' },
]

export function LanguageSwitch({ className }: { className?: string }) {
  const { i18n, t } = useTranslation()
  const { user } = useAuth()
  const qc = useQueryClient()
  const current = isLangCode(i18n.language) ? i18n.language : 'en'
  async function choose(code: LangCode) {
    await i18n.changeLanguage(code)
    writePrefs({ lang: code })
    if (user) {
      // Stored per account so the choice follows the user to other devices (validated by a DB check constraint).
      await supabase.from('profiles').update({ preferred_language: code }).eq('id', user.id)
      void qc.invalidateQueries({ queryKey: ['me', 'profile'] })
    }
  }
  return (
    <label className={cx('relative inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-bold text-forest-800 hover:bg-forest-100', className)}>
      <Languages aria-hidden className="size-4 shrink-0" />
      <span className="sr-only">{t('lang.choose')}</span>
      <select data-testid="language-select" value={current} onChange={(e) => void choose(e.target.value as LangCode)}
        className="min-h-11 cursor-pointer appearance-none bg-transparent pr-1 font-bold focus:outline-none" aria-label={t('lang.choose')}>
        {LANGUAGES.map((l) => <option key={l.code} value={l.code} lang={l.code}>{l.native}{l.code !== 'en' ? ` · ${l.english}` : ''}</option>)}
      </select>
    </label>
  )
}

/** Keeps the UI language and profiles.preferred_language in step after sign-in. */
function LanguageSync() {
  const { i18n } = useTranslation()
  const { user, profile } = useAuth()
  useEffect(() => {
    if (!user || !profile) return
    // An explicit choice on this device wins locally; otherwise adopt the account's saved language.
    // Profiles are only written when the user actively picks a language (see LanguageSwitch).
    if (isLangCode(readPrefs().lang)) return
    if (isLangCode(profile.preferred_language) && profile.preferred_language !== i18n.language) {
      void i18n.changeLanguage(profile.preferred_language)
    }
  }, [user, profile, i18n])
  return null
}

function NotificationBell() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: ['notifications', 'unread', user?.id],
    enabled: !!user,
    refetchInterval: 60_000, // polling fallback when Realtime is disconnected
    queryFn: async () => (await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null)).count ?? 0,
  })
  useEffect(() => {
    if (!user) return
    // RLS-filtered Realtime: only this user's rows are delivered.
    const ch = supabase.channel(`notif-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${user.id}` }, () => {
        void qc.invalidateQueries({ queryKey: ['notifications'] })
      }).subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [user, qc])
  const n = q.data ?? 0
  return (
    <Link to="/notifications" className="relative grid size-11 place-items-center rounded-xl text-forest-800 hover:bg-forest-100" aria-label={`${t('nav.notifications')}${n ? ` (${n})` : ''}`}>
      <Bell aria-hidden className="size-5" />
      {n > 0 && <span className="absolute right-1.5 top-1.5 grid min-w-5 place-items-center rounded-full bg-gold-400 px-1 text-[11px] font-extrabold text-forest-900">{n > 9 ? '9+' : n}</span>}
    </Link>
  )
}

function bottomNav(hasRole: (r: string) => boolean) {
  const items = [{ to: '/dashboard', k: 'nav.dashboard', I: LayoutDashboard }]
  if (hasRole('farmer')) items.push({ to: '/farmer/harvest', k: 'nav.harvest', I: Sprout }, { to: '/farmer/offers', k: 'nav.offers', I: ShoppingBasket })
  if (hasRole('buyer')) items.push({ to: '/buyer/requirements', k: 'nav.requirements', I: ShoppingBasket }, { to: '/matching', k: 'nav.matching', I: Users })
  if (hasRole('logistics')) items.push({ to: '/logistics', k: 'nav.logistics', I: Truck })
  items.push({ to: '/orders', k: 'nav.orders', I: Package })
  return items.slice(0, 5)
}

export function Layout() {
  const { t } = useTranslation()
  const { user, hasRole, emailVerified, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const nav = useNavigate()
  useEffect(() => setOpen(false), [loc.pathname])
  const [atTop, setAtTop] = useState(true)
  useEffect(() => {
    const on = () => setAtTop(window.scrollY < 24)
    on(); window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  const overHero = loc.pathname === '/' && atTop && !open

  const accountLinks = user ? [
    { to: '/dashboard', k: 'nav.dashboard' },
    ...(hasRole('farmer') ? [{ to: '/farmer', k: 'nav.farmer' }, { to: '/farmer/harvest', k: 'nav.harvest' }, { to: '/farmer/offers', k: 'nav.offers' }, { to: '/farmer/earnings', k: 'nav.earnings' }, { to: '/farmer/clients', k: 'nav.clients' }] : []),
    ...(hasRole('buyer') ? [{ to: '/buyer', k: 'nav.buyer' }, { to: '/buyer/requirements', k: 'nav.requirements' }, { to: '/buyer/purchases', k: 'nav.purchases' }, { to: '/buyer/suppliers', k: 'nav.suppliers' }, { to: '/matching', k: 'nav.matching' }] : []),
    ...(hasRole('logistics') ? [{ to: '/logistics', k: 'nav.logistics' }] : []),
    { to: '/orders', k: 'nav.orders' }, { to: '/seeds/orders', k: 'nav.seedOrders' },
    ...(hasRole('seed_seller') ? [{ to: '/seeds/manage', k: 'nav.seedManage' }] : []),
    ...(hasRole('landowner') ? [{ to: '/landowner', k: 'nav.landowner' }] : []),
    { to: '/schemes/saved', k: 'nav.savedSchemes' }, { to: '/profile', k: 'nav.profile' }, { to: '/settings', k: 'nav.settings' },
    ...(hasRole('admin') || hasRole('support') ? [{ to: '/admin', k: 'nav.admin' }] : []),
  ] : []
  const bottom = user ? bottomNav(hasRole) : []

  return (
    <div className="flex min-h-dvh flex-col">
      <LanguageSync />
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-xl focus:bg-white focus:p-3">{t('nav.skip')}</a>
      <header className={cx('sticky top-0 z-30 border-b border-forest-100 bg-cream-100/92 backdrop-blur transition-colors duration-300', overHero && 'header-over-hero')}>
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          <Link to="/" className="no-underline" aria-label="SEED X home"><Logo inverted={overHero} /></Link>
          <nav className="ml-6 hidden items-center gap-1 lg:flex" aria-label="Primary">
            {publicLinks.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => cx('rounded-xl px-3 py-2 text-sm font-semibold no-underline', isActive ? 'bg-forest-100 text-forest-800' : 'text-charcoal-700 hover:bg-forest-50')}>{t(l.k)}</NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <span className="hidden sm:block"><LanguageSwitch /></span>
            {user ? (
              <>
                <NotificationBell />
                <Link to="/dashboard" className="hidden min-h-11 items-center rounded-xl bg-forest-700 px-4 text-sm font-bold text-white no-underline hover:bg-forest-800 sm:inline-flex">{t('nav.dashboard')}</Link>
              </>
            ) : (
              <>
                <Link to="/login" className="hidden min-h-11 items-center rounded-xl px-3 text-sm font-bold text-forest-800 no-underline hover:bg-forest-100 sm:inline-flex">{t('nav.login')}</Link>
                <Link to="/signup" className="inline-flex min-h-11 items-center whitespace-nowrap rounded-xl bg-forest-700 px-3 text-sm font-bold sm:px-4 text-white no-underline hover:bg-forest-800">{t('nav.signup')}</Link>
              </>
            )}
            <button type="button" className="grid size-11 place-items-center rounded-xl text-forest-800 hover:bg-forest-100 lg:hidden" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="mobile-menu" aria-label={t('nav.menu')}>
              {open ? <X aria-hidden className="size-6" /> : <Menu aria-hidden className="size-6" />}
            </button>
            {user && (
              <Button variant="ghost" size="sm" className="hidden lg:inline-flex" onClick={async () => { await signOut(); nav('/') }} aria-label={t('nav.logout')}><LogOut aria-hidden className="size-4" /></Button>
            )}
          </div>
        </div>
        {open && (
          <div id="mobile-menu" className="border-t border-forest-100 bg-cream-50 lg:hidden">
            <nav className="mx-auto grid max-w-7xl gap-1 px-4 py-3" aria-label="Mobile">
              {[{ to: '/', k: 'nav.home' }, ...publicLinks, { to: '/help', k: 'nav.help' }].map((l) => (
                <NavLink key={l.to} to={l.to} className="rounded-xl px-3 py-3 font-semibold text-forest-800 no-underline hover:bg-forest-100">{t(l.k)}</NavLink>
              ))}
              {accountLinks.length > 0 && <hr className="my-2 border-forest-100" />}
              {accountLinks.map((l) => (
                <NavLink key={l.to} to={l.to} className="rounded-xl px-3 py-3 font-semibold text-forest-800 no-underline hover:bg-forest-100">{t(l.k)}</NavLink>
              ))}
              <div className="mt-2 flex items-center justify-between">
                <LanguageSwitch />
                {user ? <Button variant="secondary" size="sm" onClick={async () => { await signOut(); nav('/') }}><LogOut aria-hidden className="size-4" />{t('nav.logout')}</Button>
                  : <Link to="/login" className="font-bold">{t('nav.login')}</Link>}
              </div>
            </nav>
          </div>
        )}
      </header>

      {!supabaseConfigured && <div className="mx-auto w-full max-w-7xl px-4 pt-4"><Notice tone="danger" title={t('errors.supabaseMissing')} /></div>}
      {user && !emailVerified && (
        <div className="mx-auto w-full max-w-7xl px-4 pt-4"><Notice tone="warn" title={t('auth.unverifiedBanner')}><Link to="/verify-email" className="font-bold">{t('auth.verifyTitle')}</Link></Notice></div>
      )}

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-8 px-4">
        {user && accountLinks.length > 0 && !loc.pathname.match(/^\/($|about|how-it-works)/) && (
          <aside className="hidden w-56 shrink-0 py-8 lg:block" aria-label="Account">
            <nav className="sticky top-24 grid gap-0.5">
              {accountLinks.map((l) => (
                <NavLink key={l.to} to={l.to} end className={({ isActive }) => cx('rounded-xl px-3 py-2.5 text-sm font-semibold no-underline', isActive ? 'bg-forest-700 text-white' : 'text-charcoal-700 hover:bg-forest-100')}>{t(l.k)}</NavLink>
              ))}
            </nav>
          </aside>
        )}
        <main id="main" className={cx('min-w-0 flex-1 py-8', bottom.length > 0 && 'pb-28 lg:pb-8')}>
          <PageTransition k={loc.pathname}><Outlet /></PageTransition>
        </main>
      </div>

      <footer className="bg-forest-800 pb-24 text-cream-100 lg:pb-0">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo inverted showTagline />
            <p className="mt-4 max-w-sm text-cream-200">{t('brand.tagline')}</p>
            <p className="mt-4 text-sm font-semibold text-gold-300">{t('brand.credits')}</p>
          </div>
          <nav className="grid content-start gap-2 text-sm" aria-label="Footer">
            {[...publicLinks, { to: '/help', k: 'nav.help' }].map((l) => <Link key={l.to} to={l.to} className="text-cream-100 no-underline hover:underline">{t(l.k)}</Link>)}
          </nav>
          <div className="text-sm text-cream-200">
            <p>{t('footer.privacy')}</p>
            <p className="mt-3">{t('footer.demoNote')}</p>
            <p className="mt-3">{t('footer.sources')}: <a className="text-gold-300 underline" href="https://data.gov.in/" target="_blank" rel="noreferrer">data.gov.in</a> · <a className="text-gold-300 underline" href="https://pib.gov.in/" target="_blank" rel="noreferrer">PIB</a></p>
          </div>
        </div>
        <div className="border-t border-forest-700 py-4 text-center text-xs text-cream-200">© {new Date().getFullYear()} SEED X · {t('brand.supporting')}</div>
      </footer>

      {bottom.length > 0 && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-forest-100 bg-white/96 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="App">
          <ul className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${bottom.length}, minmax(0,1fr))` }}>
            {bottom.map(({ to, k, I }) => (
              <li key={to}>
                <NavLink to={to} className={({ isActive }) => cx('flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-bold no-underline', isActive ? 'text-forest-700' : 'text-charcoal-500')}>
                  <I aria-hidden className="size-5" />{t(k)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  )
}

