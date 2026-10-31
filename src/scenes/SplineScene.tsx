import { Component, lazy, Suspense, type ReactNode } from 'react'
import { readPrefs, prefersReducedMotion } from '@/lib/prefs'
import type { SceneEntry } from './manifest'

const Spline = lazy(() => import('@splinetool/react-spline'))

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch { return false }
}

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

/**
 * Renders a published Spline scene only when: a real URL exists, 3D is enabled, WebGL works and the
 * user does not prefer reduced motion. Otherwise (and on any runtime error) shows the fallback.
 * A scene never blocks forms or transactions.
 */
export function SplineScene({ entry, fallback, className }: { entry: SceneEntry; fallback: ReactNode; className?: string }) {
  const can = entry.status === 'published' && !!entry.splineUrl && !readPrefs().disable3d && !prefersReducedMotion()
    && typeof window !== 'undefined' && webglAvailable() && !(entry.mobile === 'static-fallback' && window.innerWidth < 640)
  if (!can) return <>{fallback}</>
  return (
    <SceneBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <div className={className}><Spline scene={entry.splineUrl!} /></div>
      </Suspense>
    </SceneBoundary>
  )
}
