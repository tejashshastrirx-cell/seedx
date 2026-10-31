import { CatmullRomCurve3, Vector3 } from 'three'

/** SEED X world layout (units ~ metres). Farm on the left/near, collection centre middle, city far right. */
export const SUN_DIR = new Vector3(110, 9, -78).normalize()

export type Plot = { x: number; z: number; w: number; d: number; rot: number; crop: 'wheat' | 'young' | 'mustard' | 'paddy' }
export const PLOTS: Plot[] = [
  { x: -10, z: 8, w: 16, d: 12, rot: 0.08, crop: 'wheat' },
  { x: -27, z: 6, w: 14, d: 13, rot: 0.08, crop: 'young' },
  { x: -12, z: -9, w: 17, d: 11, rot: 0.08, crop: 'mustard' },
  { x: -29, z: -10, w: 13, d: 12, rot: 0.08, crop: 'wheat' },
  { x: 5, z: 18, w: 12, d: 9, rot: 0.08, crop: 'paddy' },
  { x: -24, z: 22, w: 15, d: 9, rot: 0.08, crop: 'wheat' },
  { x: 6, z: -22, w: 14, d: 10, rot: -0.2, crop: 'young' },
]

export const HUB = new Vector3(20, 0, -4)
export const CITY = new Vector3(118, 0, -82)
export const PICKUPS = [new Vector3(-14, 0, 15), new Vector3(-30, 0, -2), new Vector3(-6, 0, -16)]

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Deterministic terrain height. Flat farmland, gentle undulation, ridges on the far edges, open plain towards the city. */
export function heightAt(x: number, z: number): number {
  let h = Math.sin(x * 0.045) * 0.5 + Math.cos(z * 0.052) * 0.45 + Math.sin((x + z) * 0.021) * 0.7
  const farm = 1 - smoothstep(18, 42, Math.hypot(x + 12, z - 4))
  h *= 1 - farm * 0.75
  const r = Math.hypot(x - 10, z + 10)
  const ang = Math.atan2(z + 10, x - 10)
  const cityAng = Math.atan2(CITY.z + 10, CITY.x - 10)
  const valley = Math.exp(-((ang - cityAng) ** 2) / 0.09)
  const ridge = smoothstep(70, 150, r) * (16 + 7 * Math.sin(ang * 5 + 1.3) + 4 * Math.sin(ang * 11)) * (1 - valley * 0.92)
  return h + ridge
}

export function inPlot(x: number, z: number): Plot | null {
  for (const p of PLOTS) {
    const dx = x - p.x, dz = z - p.z
    const c = Math.cos(-p.rot), s = Math.sin(-p.rot)
    const lx = dx * c - dz * s, lz = dx * s + dz * c
    if (Math.abs(lx) <= p.w / 2 && Math.abs(lz) <= p.d / 2) return p
  }
  return null
}

/** A curve that hugs the terrain, lifted slightly. */
export function groundCurve(points: Vector3[], lift = 0.18, samples = 80): CatmullRomCurve3 {
  const base = new CatmullRomCurve3(points.map((p) => new Vector3(p.x, 0, p.z)))
  const pts = base.getSpacedPoints(samples).map((p) => new Vector3(p.x, heightAt(p.x, p.z) + lift, p.z))
  return new CatmullRomCurve3(pts)
}

export const ROUTE_POINTS: Vector3[][] = [
  [PICKUPS[0], new Vector3(-4, 0, 11), new Vector3(8, 0, 4), HUB],
  [PICKUPS[1], new Vector3(-20, 0, 0), new Vector3(2, 0, -2), HUB],
  [PICKUPS[2], new Vector3(4, 0, -12), new Vector3(14, 0, -9), HUB],
]
export const MARKET_ROUTE: Vector3[] = [HUB, new Vector3(38, 0, -20), new Vector3(64, 0, -42), new Vector3(92, 0, -64), CITY]

/** Seeded PRNG so the world is identical on every load (and in poster renders). */
export function rng(seed: number) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}
