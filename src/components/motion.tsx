import { useEffect, useRef, useState, type ReactNode } from 'react'
import { animate, motion, useInView, useReducedMotion } from 'motion/react'

const ease = [0.22, 1, 0.36, 1] as const

/** Fade/slide content in once when it scrolls into view. Respects reduced motion via MotionConfig. */
export function Reveal({ children, delay = 0, y = 18, className }: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6, ease, delay }}>
      {children}
    </motion.div>
  )
}

/** Stagger children (use with <StaggerItem>). */
export function Stagger({ children, className, as = 'div', gap = 0.08 }: { children: ReactNode; className?: string; as?: 'div' | 'ul' | 'ol'; gap?: number }) {
  const M = motion[as]
  return (
    <M className={className} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-40px' }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}>
      {children}
    </M>
  )
}
export function StaggerItem({ children, className, as = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'li' }) {
  const M = motion[as]
  return <M className={className} variants={{ hidden: { opacity: 0, y: 16, scale: 0.98 }, show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease } } }}>{children}</M>
}

/** Count up to a real value from the database when visible. */
export function CountUp({ value, className }: { value: number | null | undefined; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (value == null || !inView) return
    if (reduce) { setShown(value); return }
    const c = animate(0, value, { duration: 1.1, ease, onUpdate: (v) => setShown(Math.round(v)) })
    return () => c.stop()
  }, [value, inView, reduce])
  return <span ref={ref} className={className}>{value == null ? '–' : shown.toLocaleString('en-IN')}</span>
}

/** Route-level enter transition. */
export function PageTransition({ children, k }: { children: ReactNode; k: string }) {
  return (
    <motion.div key={k} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease }}>
      {children}
    </motion.div>
  )
}

/** Animated proportional bar (stock, fill progress). */
export function Bar({ pct, className }: { pct: number; className: string }) {
  return <motion.span className={className} initial={{ width: 0 }} whileInView={{ width: `${Math.max(0, Math.min(100, pct))}%` }} viewport={{ once: true }} transition={{ duration: 0.9, ease }} />
}
