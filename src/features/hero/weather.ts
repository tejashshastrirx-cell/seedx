/**
 * SEED X weather ambience engine (Canvas 2D). Visual only - never a claim about real weather.
 * Pure functions + bounded, reusable particle pools so it can be unit tested and never allocates per frame.
 */
export type WeatherMode = 'auto' | 'clear' | 'dust' | 'rain'
export type VisualMode = Exclude<WeatherMode, 'auto'>

/**
 * No weather service is connected, so Auto resolves to a documented default ambience that matches
 * the approved hero artwork (a passing golden-hour shower). It is labelled as ambience, not weather.
 */
export const AUTO_DEFAULT: VisualMode = 'rain'
export function resolveMode(mode: WeatherMode, liveSource: VisualMode | null = null): VisualMode {
  return mode === 'auto' ? liveSource ?? AUTO_DEFAULT : mode
}

export function shouldAnimate(o: { mode: VisualMode; reducedMotion: boolean; inView: boolean; pageVisible: boolean }) {
  return o.mode !== 'clear' && !o.reducedMotion && o.inView && o.pageVisible
}

export type Budget = { drops: number; motes: number; splashes: number; lens: number }
export function budget(o: { width: number; saveData: boolean }): Budget {
  const small = o.width < 768
  const k = (small ? 0.42 : 1) * (o.saveData ? 0.5 : 1)
  return { drops: Math.round(440 * k), motes: Math.round(80 * k), splashes: Math.round(48 * k), lens: small ? 3 : 7 }
}

type Drop = { x: number; y: number; z: number; len: number; speed: number }
type Mote = { x: number; y: number; r: number; a: number; vx: number; vy: number; ph: number }
type Splash = { x: number; y: number; t: number; life: number; r: number }
type Lens = { x: number; y: number; r: number; t: number; life: number }
export type WeatherState = { drops: Drop[]; motes: Mote[]; splashes: Splash[]; lens: Lens[]; next: number; time: number; w: number; h: number }

const WIND = 0.16 // horizontal slant (rain falls slightly to the right, matching the artwork)

function rnd(seed: { s: number }) { seed.s = (seed.s * 1664525 + 1013904223) >>> 0; return seed.s / 4294967296 }

export function createState(w: number, h: number, b: Budget, seedValue = 7): WeatherState {
  const seed = { s: seedValue }
  const drops: Drop[] = Array.from({ length: b.drops }, () => {
    const z = Math.pow(rnd(seed), 1.6)
    return { x: rnd(seed) * w * 1.2 - w * 0.1, y: rnd(seed) * h, z, len: 10 + z * 30, speed: 650 + z * 950 }
  })
  const motes: Mote[] = Array.from({ length: b.motes }, () => ({
    x: rnd(seed) * w, y: rnd(seed) * h, r: 0.6 + rnd(seed) * 1.8, a: 0.12 + rnd(seed) * 0.4,
    vx: 6 + rnd(seed) * 14, vy: -3 + rnd(seed) * 6, ph: rnd(seed) * 6.28,
  }))
  const splashes: Splash[] = Array.from({ length: b.splashes }, () => ({ x: 0, y: 0, t: 1, life: 1, r: 0 }))
  const lens: Lens[] = Array.from({ length: b.lens }, () => ({
    x: w * (0.45 + rnd(seed) * 0.55), y: h * (0.08 + rnd(seed) * 0.85), r: 6 + rnd(seed) * 16, t: rnd(seed) * 6, life: 5 + rnd(seed) * 6,
  }))
  return { drops, motes, splashes, lens, next: 0, time: 0, w, h }
}

/** Advance the simulation. `groundY(x)` is where splashes appear (lower band of the scene). */
export function step(s: WeatherState, mode: VisualMode, dt: number) {
  const { w, h } = s
  s.time += dt
  if (mode === 'rain') {
    for (const d of s.drops) {
      d.y += d.speed * dt
      d.x += d.speed * WIND * dt
      const ground = h * (0.7 + d.z * 0.28)
      if (d.y > ground) {
        if (d.z > 0.35) {
          const sp = s.splashes[s.next % s.splashes.length]
          sp.x = d.x; sp.y = ground; sp.t = 0; sp.life = 0.35 + d.z * 0.25; sp.r = 2 + d.z * 7
          s.next++
        }
        d.y = -d.len - Math.random() * h * 0.3
        d.x = Math.random() * w * 1.2 - w * 0.15
      }
    }
    for (const sp of s.splashes) if (sp.t < sp.life) sp.t += dt
    for (const l of s.lens) { l.t += dt; if (l.t > l.life) { l.t = 0; l.x = w * (0.45 + Math.random() * 0.55); l.y = h * (0.08 + Math.random() * 0.85) } }
  }
  if (mode === 'dust' || mode === 'rain') {
    for (const m of s.motes) {
      m.ph += dt * 0.6
      m.x += (m.vx + Math.sin(m.ph) * 8) * dt
      m.y += (m.vy + Math.cos(m.ph * 0.7) * 5) * dt
      if (m.x > w + 10) m.x = -10
      if (m.y < -10) m.y = h + 10
      if (m.y > h + 10) m.y = -10
    }
  }
}

export function draw(ctx: CanvasRenderingContext2D, s: WeatherState, mode: VisualMode) {
  const { w, h } = s
  ctx.clearRect(0, 0, w, h)
  if (mode === 'clear') return
  if (mode === 'rain') {
    ctx.lineCap = 'round'
    for (const d of s.drops) {
      // Sun-glint: drops on the sunlit right half pick up warm light; left (storm side) stays cool.
      const warm = Math.min(1, Math.max(0, (d.x / w - 0.45) * 1.8))
      const r = Math.round(205 + 50 * warm), g = Math.round(220 + 6 * warm), b = Math.round(232 - 82 * warm)
      ctx.strokeStyle = `rgba(${r},${g},${b},${0.07 + d.z * 0.3})`
      ctx.lineWidth = 0.55 + d.z * 1.25
      ctx.beginPath()
      ctx.moveTo(d.x, d.y)
      ctx.lineTo(d.x - d.len * WIND, d.y - d.len)
      ctx.stroke()
    }
    ctx.lineWidth = 1
    for (const sp of s.splashes) {
      if (sp.t >= sp.life) continue
      const k = sp.t / sp.life
      ctx.strokeStyle = `rgba(255,236,200,${(1 - k) * 0.35})`
      ctx.beginPath()
      ctx.ellipse(sp.x, sp.y, sp.r * (0.4 + k), sp.r * 0.28 * (0.4 + k), 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    for (const l of s.lens) {
      const k = l.t / l.life
      const a = Math.sin(Math.min(1, k) * Math.PI) * 0.22
      if (a <= 0.01) continue
      const g2 = ctx.createRadialGradient(l.x - l.r * 0.3, l.y - l.r * 0.3, l.r * 0.1, l.x, l.y, l.r)
      g2.addColorStop(0, `rgba(255,248,230,${a * 0.9})`)
      g2.addColorStop(0.7, `rgba(255,236,200,${a * 0.25})`)
      g2.addColorStop(1, `rgba(255,236,200,${a * 0.6})`)
      ctx.fillStyle = g2
      ctx.beginPath(); ctx.arc(l.x, l.y + k * 6, l.r, 0, Math.PI * 2); ctx.fill()
    }
  }
  const moteAlpha = mode === 'dust' ? 1 : 0.45
  for (const m of s.motes) {
    const sun = Math.min(1, Math.max(0.25, m.x / w))
    ctx.fillStyle = `rgba(255,214,140,${m.a * sun * moteAlpha})`
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r * (mode === 'dust' ? 1.2 : 0.9), 0, Math.PI * 2); ctx.fill()
  }
}
