// Per-device conveniences only (never security-relevant).
const KEY = 'seedx.prefs.v1'
export type Prefs = { disable3d: boolean; lang?: 'en' | 'hi'; weather?: 'auto' | 'clear' | 'dust' | 'rain' }
export function readPrefs(): Prefs {
  try { return { disable3d: false, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { return { disable3d: false } }
}
export function writePrefs(p: Partial<Prefs>) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...readPrefs(), ...p })) } catch { /* storage unavailable */ }
}
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}
