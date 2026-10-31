import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { readPrefs, prefersReducedMotion } from '@/lib/prefs'
import { HeroIllustration } from './HeroIllustration'
import { SplineScene, webglAvailable } from './SplineScene'
import { scene } from './manifest'

const FarmHero3D = lazy(() => import('./FarmHero3D'))

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

/**
 * Hero priority: published Spline scene (env URL) -> code-built R3F 3D scene (desktop, WebGL,
 * motion allowed, 3D not disabled) -> animated SVG illustration. Rendering pauses off-screen.
 */
export function HeroScene() {
  const svg = <HeroIllustration className="h-full w-full" />
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(true)
  const [want3d] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024 && !readPrefs().disable3d && !prefersReducedMotion() && webglAvailable())
  useEffect(() => {
    if (!ref.current) return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting && document.visibilityState === 'visible'))
    io.observe(ref.current)
    const onVis = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVis)
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', onVis) }
  }, [])
  const hero = scene('SEEDX_HERO_FARM')
  return (
    <div ref={ref} className="h-full w-full">
      {hero.status === 'published' ? <SplineScene entry={hero} fallback={svg} className="h-full w-full" />
        : want3d ? <Boundary fallback={svg}><Suspense fallback={svg}><FarmHero3D active={visible} /></Suspense></Boundary>
        : svg}
    </div>
  )
}
