import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react'
import { ArrowDown, ArrowRight, CloudRain, ShoppingBasket, Sparkles, Sprout, Sun, Wand2 } from 'lucide-react'
import { useAuth } from '@/app/auth'
import { cx } from '@/components/ui'
import { readPrefs, writePrefs } from '@/lib/prefs'
import { budget, createState, draw, resolveMode, shouldAnimate, step, type VisualMode, type WeatherMode } from './weather'

/** Transparent Canvas 2D ambience layer. Decorative: aria-hidden, paused off-screen / hidden tab / reduced motion. */
export function WeatherCanvas({ mode }: { mode: VisualMode }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion() ?? false
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d', { alpha: true })
    if (!canvas || !ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    const saveData = !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
    let w = 0, h = 0, raf = 0, last = 0, inView = true, pageVisible = !document.hidden
    let state = createState(1, 1, budget({ width: 1, saveData }))
    const resize = () => {
      const r = canvas.getBoundingClientRect()
      w = Math.max(1, r.width); h = Math.max(1, r.height)
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      state = createState(w, h, budget({ width: w, saveData }))
      if (!running()) draw(ctx, state, reduced || mode === 'clear' ? 'clear' : mode) // still frame: nothing drawn when static
    }
    const running = () => shouldAnimate({ mode, reducedMotion: reduced, inView, pageVisible })
    const frame = (t: number) => {
      const dt = Math.min(0.05, last ? (t - last) / 1000 : 0.016)
      last = t
      step(state, mode, dt)
      draw(ctx, state, mode)
      raf = requestAnimationFrame(frame)
    }
    const sync = () => {
      canvas.dataset.animating = String(running())
      if (running() && !raf) { last = 0; raf = requestAnimationFrame(frame) }
      if (!running() && raf) { cancelAnimationFrame(raf); raf = 0 }
      if (!running()) ctx.clearRect(0, 0, w, h)
    }
    const ro = new ResizeObserver(() => { resize(); sync() })
    ro.observe(canvas)
    const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; sync() })
    io.observe(canvas)
    const onVis = () => { pageVisible = !document.hidden; sync() }
    document.addEventListener('visibilitychange', onVis)
    resize(); sync()
    return () => { cancelAnimationFrame(raf); raf = 0; ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', onVis) }
  }, [mode, reduced])
  return <canvas ref={ref} aria-hidden data-weather={mode} className="pointer-events-none absolute inset-0 h-full w-full" />
}

const MODES: { m: WeatherMode; I: typeof Sun }[] = [{ m: 'auto', I: Wand2 }, { m: 'clear', I: Sun }, { m: 'dust', I: Sparkles }, { m: 'rain', I: CloudRain }]

export function WeatherModeControl({ mode, onChange }: { mode: WeatherMode; onChange: (m: WeatherMode) => void }) {
  const { t } = useTranslation()
  return (
    <div role="radiogroup" aria-label={t('story.weather')} className="flex gap-1 rounded-2xl border border-white/15 bg-forest-900/40 p-1 backdrop-blur-md">
      {MODES.map(({ m, I }) => (
        <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => onChange(m)} title={m === 'auto' ? t('hero.autoNote') : undefined}
          className={cx('flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-bold transition-colors', mode === m ? 'bg-gold-400 text-forest-900' : 'text-cream-100 hover:bg-white/10')}>
          <I aria-hidden className="size-4" /><span className="hidden sm:inline">{t(`story.w_${m}`)}</span><span className="sr-only sm:hidden">{t(`story.w_${m}`)}</span>
        </button>
      ))}
    </div>
  )
}

const LQIP = 'data:image/webp;base64,UklGRtQAAABXRUJQVlA4IMgAAAAQBgCdASogABIAPu1qr1AppaSiqAqpMB2JZAC1GoM+TBnKV7zxusV4nqgVJuc72sCaUbv37KBb9pAA/vSfk1kU+YHSMv7ts2b2LqrAohsrz/HsRAlv5nlyh59Mwv6RPHBwYVVuVKwg+5OE40JLjMwoDLIjLBmOEiUQzZmp/VmXBxsG8csxihuJIK6hLxaTbLYgSA5gBd3n8Mxp2TZRd7vuUxoxoTG/AS+zghytRUHsqeoFrTEHZMICt5TKetEjY2kGkMv1p8AAAA=='

/** Homepage hero: approved cinematic artwork + grading + mist + weather canvas + real React UI. */
export function HeroSection() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const reduced = useReducedMotion() ?? false
  const [mode, setMode] = useState<WeatherMode>(() => readPrefs().weather ?? 'auto')
  const visual = resolveMode(mode)
  const px = useMotionValue(0), py = useMotionValue(0)
  const sx = useSpring(px, { stiffness: 40, damping: 18 }), sy = useSpring(py, { stiffness: 40, damping: 18 })
  const bgX = useTransform(sx, (v) => v * -14), bgY = useTransform(sy, (v) => v * -8)
  const choose = (m: WeatherMode) => { setMode(m); writePrefs({ weather: m }) }

  return (
    <section aria-labelledby="hero-title" data-weather-mode={mode} className="relative isolate -mt-24 ml-[calc(50%-50vw)] flex min-h-[100svh] w-screen items-end overflow-hidden bg-forest-900 sm:items-center"
      onPointerMove={(e) => { if (reduced || e.pointerType !== 'mouse') return; const r = e.currentTarget.getBoundingClientRect(); px.set((e.clientX - r.left) / r.width - 0.5); py.set((e.clientY - r.top) / r.height - 0.5) }}>
      {/* Layer 1 - base environment (art-directed crops) */}
      <motion.div className="absolute -inset-6" style={{ x: bgX, y: bgY }}>
        <picture>
          <source media="(max-width: 767px)" type="image/webp" srcSet="/assets/seedx/hero-mobile-540.webp 540w, /assets/seedx/hero-mobile-720.webp 720w" sizes="100vw" />
          <source media="(max-width: 767px)" type="image/jpeg" srcSet="/assets/seedx/hero-mobile-540.jpg 540w, /assets/seedx/hero-mobile-720.jpg 720w" sizes="100vw" />
          <source type="image/webp" srcSet="/assets/seedx/hero-960.webp 960w, /assets/seedx/hero-1280.webp 1280w, /assets/seedx/hero-1672.webp 1672w" sizes="100vw" />
          <img src="/assets/seedx/hero-1280.jpg" srcSet="/assets/seedx/hero-960.jpg 960w, /assets/seedx/hero-1280.jpg 1280w, /assets/seedx/hero-1672.jpg 1672w" sizes="100vw"
            alt={t('hero.alt')} fetchPriority="high" decoding="async"
            className={cx('h-full w-full object-cover object-[52%_center] sm:object-[center_52%] xl:object-[0%_52%]', !reduced && 'animate-[seedx-pushin_38s_ease-in-out_infinite_alternate]')}
            style={{ backgroundImage: `url(${LQIP})`, backgroundSize: 'cover' }} />
        </picture>
      </motion.div>
      {/* Layer 2 - colour grade: dark left copy zone, light bottom, scene stays warm */}
      <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,rgb(8_32_22/0.82)_0%,rgb(8_32_22/0.52)_42%,rgb(8_32_22/0.08)_76%),linear-gradient(0deg,rgb(8_32_22/0.5)_0%,transparent_42%)] xl:bg-[linear-gradient(90deg,rgb(8_32_22/0.84)_0%,rgb(8_32_22/0.6)_30%,rgb(8_32_22/0.06)_52%),linear-gradient(0deg,rgb(8_32_22/0.5)_0%,transparent_42%)] max-sm:bg-[linear-gradient(0deg,rgb(8_32_22/0.9)_0%,rgb(8_32_22/0.55)_48%,rgb(8_32_22/0.15)_100%)]" />
      {/* Layer 3 - atmospheric mist (stronger in rain) */}
      <div aria-hidden className={cx('pointer-events-none absolute inset-0 transition-opacity duration-1000', visual === 'rain' ? 'opacity-70' : visual === 'dust' ? 'opacity-40' : 'opacity-20')}>
        <div className="absolute left-[-10%] top-[34%] h-[28%] w-[70%] rounded-full bg-cream-100/25 blur-3xl motion-safe:animate-[seedx-mist_28s_ease-in-out_infinite_alternate]" />
        <div className="absolute right-[-10%] top-[46%] h-[22%] w-[60%] rounded-full bg-gold-200/20 blur-3xl motion-safe:animate-[seedx-mist_36s_ease-in-out_infinite_alternate-reverse]" />
      </div>
      {/* Layer 4 - weather canvas (visual ambience only) */}
      <WeatherCanvas mode={visual} />

      {/* Layer 6 - real UI */}
      <div className="absolute right-4 top-[5.5rem] z-20 scroll-mt-28 sm:right-8 sm:top-24"><WeatherModeControl mode={mode} onChange={choose} /></div>
      <div className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-24 pt-36 sm:px-8 sm:pb-28">
        <motion.div className="max-w-[40rem] xl:max-w-[31rem]" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.15 } } }}>
          {[
            <p key="e" className="eyebrow text-gold-300">{t('home.eyebrow')}</p>,
            <h1 key="h" id="hero-title" className="mt-4 text-[2.5rem] font-extrabold leading-[1.02] tracking-[-0.025em] text-white [text-shadow:0_2px_30px_rgb(0_0_0/0.35)] sm:text-6xl lg:text-7xl xl:text-[4.25rem]">{t('home.title')}</h1>,
            <p key="s" className="mt-4 text-lg font-bold text-gold-300 sm:text-xl">{t('brand.supporting')}</p>,
            <p key="l" className="mt-4 max-w-xl text-base leading-relaxed text-cream-100/90 sm:text-lg">{t('hero.lead')}</p>,
            <div key="c" className="mt-8 flex flex-wrap items-center gap-3">
              <Link to={user ? '/farmer/harvest' : '/signup'} className="inline-flex min-h-14 items-center gap-2 rounded-xl bg-gold-400 px-6 text-lg font-bold text-forest-900 no-underline shadow-[0_10px_30px_-10px_rgb(229_166_59/0.7)] transition-transform hover:bg-gold-300 active:scale-[0.97]"><Sprout aria-hidden className="size-5" />{t('home.ctaFarmer')}</Link>
              <Link to={user ? '/buyer/requirements' : '/signup'} className="inline-flex min-h-14 items-center gap-2 rounded-xl bg-white px-6 text-lg font-bold text-forest-800 no-underline transition-transform hover:bg-cream-50 active:scale-[0.97]"><ShoppingBasket aria-hidden className="size-5" />{t('home.ctaBuyer')}</Link>
              <Link to="/marketplace" className="inline-flex min-h-12 items-center gap-2 rounded-xl px-3 font-semibold text-cream-100 underline-offset-4 hover:underline">{t('home.ctaExplore')}<ArrowRight aria-hidden className="size-4" /></Link>
            </div>,
            <p key="n" className="mt-6 max-w-lg text-xs text-cream-200/75">{t('home.honest')}</p>,
          ].map((node, i) => <motion.div key={i} variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } } }}>{node}</motion.div>)}
        </motion.div>
      </div>
      {/* lower hero: restrained journey cue (no fake KPIs) */}
      <div className="absolute inset-x-0 bottom-0 z-10 hidden border-t border-white/10 bg-forest-900/30 backdrop-blur-sm md:block">
        <div className="mx-auto flex max-w-7xl items-center gap-8 px-8 py-4 text-sm font-semibold text-cream-100/90">
          {['home.p1t', 'home.p2t', 'home.p3t', 'home.p4t'].map((k, i) => <span key={k} className="flex items-center gap-2"><span className="tabular text-gold-300">0{i + 1}</span>{t(k)}</span>)}
          <a href="#journey" className="ml-auto flex items-center gap-2 text-cream-100 no-underline hover:text-gold-300">{t('hero.scroll')}<ArrowDown aria-hidden className="size-4 motion-safe:animate-bounce" /></a>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">{mode === 'auto' ? t('hero.autoNote') : ''}</p>
    </section>
  )
}
