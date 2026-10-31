/**
 * SEED X scene manifest. Only real, published Spline scene URLs may be added here.
 * URLs come from env vars (VITE_SPLINE_HERO_FARM_URL, VITE_SPLINE_CHARACTER_TRIO_URL,
 * VITE_SPLINE_FARMER_GUIDE_URL, VITE_SPLINE_HARVEST_JOURNEY_URL). Until the owner publishes the
 * SEED X scenes in Spline (see docs/SPLINE_ASSETS.md) every scene is `awaiting_authoring` and the
 * app renders its built-in fallback. Never paste an arbitrary public scene URL.
 */
export type SceneStatus = 'published' | 'awaiting_authoring'
export interface SceneEntry {
  id: 'SEEDX_HERO_FARM' | 'SEEDX_CHARACTER_TRIO' | 'SEEDX_FARMER_GUIDE' | 'SEEDX_HARVEST_JOURNEY'
  page: string
  splineUrl: string | null
  status: SceneStatus
  fallback: 'hero-illustration' | 'team-cards' | 'dhruv-avatar' | 'journey-steps'
  priority: 'eager' | 'lazy'
  mobile: 'static-fallback' | 'scene'
  owner: string
}

/** Only accept published Spline runtime URLs (https://prod.spline.design/<id>/scene.splinecode). */
function splineEnv(key: string): string | null {
  const v = (import.meta.env as Record<string, string | undefined>)[key]?.trim()
  return v && /^https:\/\/prod\.spline\.design\/[A-Za-z0-9_-]+\/scene\.splinecode$/.test(v) ? v : null
}
const entry = (e: Omit<SceneEntry, 'status' | 'splineUrl'> & { env: string }): SceneEntry => {
  const url = splineEnv(e.env)
  const { env: _env, ...rest } = e
  void _env
  return { ...rest, splineUrl: url, status: url ? 'published' : 'awaiting_authoring' }
}

export const SCENES: SceneEntry[] = [
  entry({ id: 'SEEDX_HERO_FARM', env: 'VITE_SPLINE_HERO_FARM_URL', page: '/', fallback: 'hero-illustration', priority: 'lazy', mobile: 'static-fallback', owner: 'SEED X brand' }),
  entry({ id: 'SEEDX_CHARACTER_TRIO', env: 'VITE_SPLINE_CHARACTER_TRIO_URL', page: '/about', fallback: 'team-cards', priority: 'lazy', mobile: 'static-fallback', owner: 'SEED X brand' }),
  entry({ id: 'SEEDX_FARMER_GUIDE', env: 'VITE_SPLINE_FARMER_GUIDE_URL', page: '/', fallback: 'dhruv-avatar', priority: 'lazy', mobile: 'static-fallback', owner: 'SEED X brand' }),
  entry({ id: 'SEEDX_HARVEST_JOURNEY', env: 'VITE_SPLINE_HARVEST_JOURNEY_URL', page: '/how-it-works', fallback: 'journey-steps', priority: 'lazy', mobile: 'static-fallback', owner: 'SEED X brand' }),
]

export function scene(id: SceneEntry['id']): SceneEntry {
  return SCENES.find((s) => s.id === id)!
}
