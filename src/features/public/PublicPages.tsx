import { useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, BadgeCheck, Calculator, CheckCircle2, HelpCircle, Landmark, LifeBuoy, Network, ShoppingBasket, Sprout, Truck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/app/auth'
import { friendlyError } from '@/lib/errors'
import { Button, Card, LinkButton, Notice, PageHeader, SelectField, TextAreaField, TextField } from '@/components/ui'
import { HeroScene } from '@/scenes/HeroScene'
import { CountUp, Reveal, Stagger, StaggerItem } from '@/components/motion'
import { motion } from 'motion/react'
import { SplineScene } from '@/scenes/SplineScene'
import { scene } from '@/scenes/manifest'

/** Original stylised illustration of Dhruv, the fictional farmer guide. Not a real person. */
export function DhruvAvatar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} role="img" aria-label="Dhruv, fictional farmer guide (illustration)">
      <circle cx="60" cy="60" r="60" fill="#E6F1E7" />
      <path d="M22 120 C 24 92 40 80 60 80 C 80 80 96 92 98 120 Z" fill="#F5F0E4" stroke="#174B35" strokeWidth="2" />
      <path d="M50 82 L60 100 L70 82" fill="none" stroke="#174B35" strokeWidth="2" />
      <rect x="52" y="66" width="16" height="16" rx="6" fill="#B07A52" />
      <ellipse cx="60" cy="52" rx="20" ry="22" fill="#B98559" />
      <path d="M38 44 C 40 26 80 22 82 44 C 72 36 50 36 38 44 Z" fill="#E5A63B" />
      <path d="M38 44 C 50 38 70 38 82 44 L 84 48 C 70 42 50 42 36 48 Z" fill="#CF8D22" />
      <circle cx="52" cy="54" r="2.4" fill="#1C2420" /><circle cx="68" cy="54" r="2.4" fill="#1C2420" />
      <path d="M50 62 C 54 60 66 60 70 62" fill="none" stroke="#3A2A1E" strokeWidth="3" strokeLinecap="round" />
      <path d="M53 68 C 57 71 63 71 67 68" fill="none" stroke="#3A2A1E" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function Monogram({ initials, tone }: { initials: string; tone: 'forest' | 'gold' }) {
  return (
    <div className={`grid size-24 place-items-center rounded-3xl text-3xl font-extrabold ${tone === 'forest' ? 'bg-forest-700 text-cream-100' : 'bg-gold-400 text-forest-900'}`} aria-hidden>
      {initials}
    </div>
  )
}

const heroItem = { hidden: { opacity: 0, y: 22 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } } }

export function HomePage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const counts = useQuery({
    queryKey: ['home', 'counts'],
    queryFn: async () => {
      const [l, d, s] = await Promise.all([
        supabase.from('harvest_listings').select('id', { count: 'exact', head: true }),
        supabase.from('demand_requests').select('id', { count: 'exact', head: true }),
        supabase.from('seed_products').select('id', { count: 'exact', head: true }),
      ])
      return { listings: l.count ?? 0, demand: d.count ?? 0, seeds: s.count ?? 0 }
    },
  })
  const pillars = [
    { I: ShoppingBasket, tk: 'home.p1t', dk: 'home.p1d', to: '/marketplace' },
    { I: Calculator, tk: 'home.p2t', dk: 'home.p2d', to: '/how-it-works' },
    { I: Network, tk: 'home.p3t', dk: 'home.p3d', to: '/matching' },
    { I: Landmark, tk: 'home.p4t', dk: 'home.p4d', to: '/schemes' },
  ]
  return (
    <div className="-mt-8">
      <section className="relative -mx-4 overflow-hidden sm:mx-0 sm:mt-6 sm:rounded-[2rem]">
        <div className="absolute inset-0">
          <HeroScene />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-cream-100 via-cream-100/85 to-transparent sm:via-cream-100/70 lg:via-cream-100/60 lg:to-transparent" />
        <motion.div className="pointer-events-none relative max-w-2xl px-5 py-16 sm:px-10 sm:py-24 [&_a]:pointer-events-auto" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } } }}>
          <motion.div variants={heroItem}><p className="eyebrow mb-3">{t('home.eyebrow')}</p></motion.div>
          <motion.div variants={heroItem}><h1 className="text-4xl font-extrabold leading-[1.08] sm:text-6xl">{t('home.title')}</h1></motion.div>
          <motion.div variants={heroItem}><p className="mt-3 text-lg font-bold text-gold-600">{t('brand.supporting')}</p></motion.div>
          <motion.div variants={heroItem}><p className="mt-4 max-w-xl text-lg text-charcoal-700">{t('home.lead')}</p></motion.div>
          <motion.div variants={heroItem} className="mt-8 flex flex-wrap gap-3">
            <LinkButton to={user ? '/farmer/harvest' : '/signup'} size="lg"><Sprout aria-hidden className="size-5" />{t('home.ctaFarmer')}</LinkButton>
            <LinkButton to={user ? '/buyer/requirements' : '/signup'} size="lg" variant="gold"><ShoppingBasket aria-hidden className="size-5" />{t('home.ctaBuyer')}</LinkButton>
            <LinkButton to="/marketplace" size="lg" variant="secondary">{t('home.ctaExplore')}<ArrowRight aria-hidden className="size-5" /></LinkButton>
          </motion.div>
          <motion.div variants={heroItem}><p className="mt-6 text-sm text-charcoal-700">{t('home.honest')}</p></motion.div>
        </motion.div>
      </section>

      <section className="mt-10 grid gap-4 sm:grid-cols-3" aria-labelledby="live">
        <h2 id="live" className="sr-only">{t('home.liveTitle')}</h2>
        {[['listings', 'home.liveListings', '/marketplace'], ['demand', 'home.liveDemand', '/marketplace?tab=demand'], ['seeds', 'home.liveSeeds', '/seeds']].map(([k, label, to]) => (
          <Link key={k} to={to} className="card flex items-center justify-between p-5 no-underline hover:border-forest-300">
            <div>
              <CountUp className="tabular block text-4xl font-extrabold text-forest-800" value={counts.data?.[k as 'listings']} />
              <p className="font-semibold text-charcoal-700">{t(label)}</p>
            </div>
            <ArrowRight aria-hidden className="size-5 text-gold-500" />
          </Link>
        ))}
        <p className="text-xs text-charcoal-500 sm:col-span-3">{t('home.liveNote')}</p>
      </section>

      <section className="mt-14" aria-labelledby="pillars">
        <Reveal><h2 id="pillars" className="text-3xl font-extrabold">{t('home.pillarsTitle')}</h2></Reveal>
        <Stagger className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map(({ I, tk, dk, to }, i) => (
            <StaggerItem key={tk}><Link to={to} className={`card group block h-full p-6 no-underline ${i === 2 ? 'bg-forest-700 text-cream-100' : ''}`}>
              <div className={`grid size-12 place-items-center rounded-2xl ${i === 2 ? 'bg-gold-400 text-forest-900' : 'bg-forest-100 text-forest-700'}`}><I aria-hidden className="size-6" /></div>
              <h3 className={`mt-4 text-lg font-extrabold ${i === 2 ? 'text-white' : ''}`}>{t(tk)}</h3>
              <p className={`mt-2 text-sm ${i === 2 ? 'text-cream-200' : 'text-charcoal-700'}`}>{t(dk)}</p>
            </Link></StaggerItem>
          ))}
        </Stagger>
      </section>

      <section className="mt-14 grid items-center gap-8 lg:grid-cols-[1.3fr_1fr]" aria-labelledby="story">
        <div>
          <p className="eyebrow">{t('brand.supporting')}</p>
          <h2 id="story" className="mt-2 text-3xl font-extrabold">{t('home.storyTitle')}</h2>
          <p className="mt-2 text-charcoal-700">{t('home.storyLead')}</p>
          <Stagger as="ol" className="mt-6 grid gap-3" gap={0.12}>
            {['s1', 's2', 's3', 's4', 's5'].map((k, i) => (
              <StaggerItem as="li" key={k} className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-[var(--shadow-card)]">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-forest-700 font-extrabold text-gold-300">{i + 1}</span>
                <span className="font-semibold">{t(`home.${k}`)}</span>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
        <Reveal delay={0.15}><Card className="flex flex-col items-center gap-4 bg-forest-50 p-8 text-center">
          <SplineScene entry={scene('SEEDX_FARMER_GUIDE')} fallback={<motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}><DhruvAvatar className="size-36" /></motion.div>} />
          <p className="text-xl font-extrabold text-forest-800">{t('home.guideHello')}</p>
          <p className="text-charcoal-700">{t('home.guideText')}</p>
          <LinkButton to={user ? '/farmer/harvest' : '/signup'}>{t('home.guideCta')}</LinkButton>
          <p className="text-xs text-charcoal-500">{t('about.dhruvRole')}</p>
        </Card></Reveal>
      </section>
    </div>
  )
}

export function AboutPage() {
  const { t } = useTranslation()
  return (
    <div>
      <PageHeader eyebrow={t('brand.supporting')} title={t('about.title')} lead={t('about.lead')} />
      <Card className="bg-forest-700 p-8 text-cream-100">
        <h2 className="text-2xl font-extrabold text-white">{t('about.missionTitle')}</h2>
        <p className="mt-3 max-w-3xl text-lg text-cream-200">{t('about.mission')}</p>
        <p className="mt-6 text-xl font-extrabold text-gold-300">{t('brand.tagline')}</p>
      </Card>
      <h2 className="mt-12 text-2xl font-extrabold">{t('about.teamTitle')}</h2>
      <SplineScene entry={scene('SEEDX_CHARACTER_TRIO')} fallback={
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <Card className="p-6"><Monogram initials="TS" tone="forest" /><h3 className="mt-4 text-xl font-extrabold">Tejash Shastri</h3><p className="font-semibold text-gold-600">{t('about.tejashRole')}</p><p className="mt-2 text-xs text-charcoal-500">{t('about.portraitPending')}</p></Card>
          <Card className="p-6"><Monogram initials="S" tone="gold" /><h3 className="mt-4 text-xl font-extrabold">Shaurya</h3><p className="font-semibold text-gold-600">{t('about.shauryaRole')}</p><p className="mt-2 text-xs text-charcoal-500">{t('about.portraitPending')}</p></Card>
          <Card className="p-6"><DhruvAvatar className="size-24" /><h3 className="mt-4 text-xl font-extrabold">Dhruv</h3><p className="font-semibold text-gold-600">{t('about.dhruvRole')}</p><p className="mt-2 text-sm text-charcoal-700">{t('about.dhruvNote')}</p></Card>
        </div>} />
      <h2 className="mt-12 text-2xl font-extrabold">{t('about.principlesTitle')}</h2>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {['pr1', 'pr2', 'pr3', 'pr4', 'pr5', 'pr6'].map((k) => (
          <li key={k} className="flex gap-3 rounded-2xl bg-white p-4 shadow-[var(--shadow-card)]"><CheckCircle2 aria-hidden className="size-5 shrink-0 text-forest-500" /><span className="font-semibold">{t(`about.${k}`)}</span></li>
        ))}
      </ul>
      <p className="mt-10 text-center text-lg font-extrabold text-forest-800">{t('brand.credits')}</p>
    </div>
  )
}

export function HowItWorksPage() {
  const { t } = useTranslation()
  const icons = [BadgeCheck, CheckCircle2, Sprout, ShoppingBasket, Network, Calculator, Truck]
  return (
    <div>
      <PageHeader eyebrow="SEED X" title={t('how.title')} lead={t('how.lead')} actions={<LinkButton to="/signup">{t('nav.signup')}</LinkButton>} />
      <ol className="relative grid gap-4 border-l-4 border-gold-200 pl-6 sm:pl-8">
        {['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7'].map((k, i) => {
          const I = icons[i]
          return (
            <li key={k} className="card relative p-5">
              <span className="absolute -left-[2.6rem] top-5 grid size-9 place-items-center rounded-full bg-forest-700 text-sm font-extrabold text-gold-300 sm:-left-[3.1rem]">{i + 1}</span>
              <div className="flex gap-4"><I aria-hidden className="mt-0.5 size-6 shrink-0 text-forest-600" /><p className="text-lg font-semibold">{t(`how.${k}`)}</p></div>
            </li>
          )
        })}
      </ol>
      <Notice tone="info" title={t('match.notAI')}>{t('netback.explain')}</Notice>
    </div>
  )
}

export function HelpPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState('other')
  const [state, setState] = useState<{ ok?: boolean; err?: string; busy?: boolean }>({})
  return (
    <div>
      <PageHeader title={t('help.title')} lead={t('help.lead')} />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="grid gap-3">
          {[1, 2, 3, 4, 5].map((n) => (
            <details key={n} className="card group p-5">
              <summary className="flex cursor-pointer list-none items-center gap-3 font-bold text-forest-800"><HelpCircle aria-hidden className="size-5 text-gold-500" />{t(`help.q${n}`)}</summary>
              <p className="mt-3 text-charcoal-700">{t(`help.a${n}`)}</p>
            </details>
          ))}
        </div>
        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-xl font-extrabold"><LifeBuoy aria-hidden className="size-5" />{t('help.ticket')}</h2>
          {!user ? <p className="mt-3"><Link to="/login?next=/help" className="font-bold">{t('nav.login')}</Link></p> : state.ok ? <div className="mt-4"><Notice tone="success" title={t('help.sent')} /></div> : (
            <form className="mt-4 grid gap-4" onSubmit={async (e) => {
              e.preventDefault(); setState({ busy: true })
              const { error } = await supabase.from('support_tickets').insert({ user_id: user.id, category, subject: subject.trim(), body: body.trim() })
              setState(error ? { err: friendlyError(error, t) } : { ok: true })
            }}>
              {state.err && <Notice tone="danger" title={state.err} />}
              <SelectField label={t('help.category')} value={category} onChange={(e) => setCategory(e.target.value)}>
                {['account', 'listing', 'order', 'payment', 'seed', 'data', 'other'].map((c) => <option key={c} value={c}>{c}</option>)}
              </SelectField>
              <TextField label={t('help.subject')} value={subject} onChange={(e) => setSubject(e.target.value)} minLength={3} maxLength={140} required />
              <TextAreaField label={t('help.message')} value={body} onChange={(e) => setBody(e.target.value)} minLength={5} maxLength={2000} required rows={5} />
              <Button type="submit" loading={state.busy}>{t('common.submit')}</Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  )
}

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <div className="grid place-items-center py-16 text-center">
      <p className="text-7xl font-extrabold text-gold-400">404</p>
      <h1 className="mt-4 text-3xl font-extrabold">{t('notFound.title')}</h1>
      <p className="mt-2 text-charcoal-700">{t('notFound.lead')}</p>
      <LinkButton to="/" className="mt-6">{t('notFound.home')}</LinkButton>
    </div>
  )
}
