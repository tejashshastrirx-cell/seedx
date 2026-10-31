import { Suspense, useMemo, useRef, type MutableRefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Sky, Sparkles } from '@react-three/drei'
import { Bloom, EffectComposer, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { CatmullRomCurve3, MathUtils, Vector3 } from 'three'
import { World, type Tier } from './World'
import { SUN_DIR } from './terrain'

/** Camera keyframes for the five story chapters: farm, harvest, aggregation, transport, buyers. */
export const CHAPTERS = [
  { pos: [-2.8, 3.1, 25.5], look: [-8, 1.2, 9] },
  { pos: [-25, 7.5, 9], look: [-14, 0.6, -6] },
  { pos: [-6, 30, 34], look: [4, 0, -2] },
  { pos: [44, 9, 6], look: [60, 1.5, -36] },
  { pos: [72, 16, -18], look: [118, 12, -84] },
] as const

function CameraRig({ progress, pointerParallax }: { progress: MutableRefObject<number>; pointerParallax: boolean }) {
  const { camera } = useThree()
  const posCurve = useMemo(() => new CatmullRomCurve3(CHAPTERS.map((c) => new Vector3(...c.pos)), false, 'centripetal'), [])
  const lookCurve = useMemo(() => new CatmullRomCurve3(CHAPTERS.map((c) => new Vector3(...c.look)), false, 'centripetal'), [])
  const look = useRef(new Vector3(...CHAPTERS[0].look))
  const target = useMemo(() => new Vector3(), [])
  const p = useRef(0)
  useFrame(({ clock, pointer }, dt) => {
    p.current = MathUtils.damp(p.current, progress.current, 2.2, dt)
    const t = MathUtils.clamp(p.current, 0, 1)
    posCurve.getPointAt(t, target)
    const drift = clock.elapsedTime * 0.12
    target.x += Math.sin(drift) * 0.6 + (pointerParallax ? pointer.x * 1.4 : 0)
    target.y += Math.cos(drift * 0.8) * 0.25 + (pointerParallax ? pointer.y * 0.6 : 0)
    camera.position.lerp(target, 1 - Math.exp(-dt * 3))
    lookCurve.getPointAt(t, target)
    look.current.lerp(target, 1 - Math.exp(-dt * 3))
    camera.lookAt(look.current)
  })
  return null
}

export default function StoryCanvas({ progress, tier, active, onReady }: { progress: MutableRefObject<number>; tier: Tier; active: boolean; onReady?: () => void }) {
  const sun = useMemo(() => SUN_DIR.clone().multiplyScalar(400), [])
  const light = useMemo(() => SUN_DIR.clone().multiplyScalar(90), [])
  const high = tier === 'high'
  return (
    <Canvas
      frameloop={active ? 'always' : 'never'}
      shadows={high ? 'soft' : false}
      dpr={high ? [1, 1.75] : [1, 1.25]}
      camera={{ position: [...CHAPTERS[0].pos], fov: 42, near: 0.2, far: 900 }}
      gl={{ antialias: !high, powerPreference: 'high-performance' }}
      onCreated={() => onReady?.()}
      aria-hidden
    >
      <fogExp2 attach="fog" args={['#EDC48D', high ? 0.0072 : 0.0085]} />
      <Sky distance={450000} sunPosition={sun} turbidity={7.5} rayleigh={2.6} mieCoefficient={0.0065} mieDirectionalG={0.86} />
      <Suspense fallback={null}>
        <Environment resolution={high ? 256 : 64} frames={1} environmentIntensity={0.85}>
          <Sky distance={450000} sunPosition={sun} turbidity={7.5} rayleigh={2.6} mieCoefficient={0.0065} mieDirectionalG={0.86} />
        </Environment>
      </Suspense>
      <hemisphereLight args={['#FFE2B0', '#40552C', 0.55]} />
      <directionalLight
        castShadow={high}
        position={[light.x, light.y + 18, light.z]}
        intensity={3.2}
        color="#FFC98A"
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-camera-left={-70} shadow-camera-right={70} shadow-camera-top={70} shadow-camera-bottom={-70} shadow-camera-near={10} shadow-camera-far={260}
      />
      <World tier={tier} />
      {high && <Sparkles count={70} scale={[30, 6, 22]} position={[-8, 3, 10]} size={2.2} speed={0.25} color="#FFD98A" opacity={0.75} />}
      <CameraRig progress={progress} pointerParallax={high} />
      {high && (
        <EffectComposer multisampling={0}>
          <Bloom intensity={0.55} luminanceThreshold={0.82} luminanceSmoothing={0.2} mipmapBlur />
          <Vignette offset={0.28} darkness={0.42} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <SMAA />
        </EffectComposer>
      )}
    </Canvas>
  )
}
