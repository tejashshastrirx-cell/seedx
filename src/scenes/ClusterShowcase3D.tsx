import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Html, OrbitControls, Sky } from '@react-three/drei'
import { CatmullRomCurve3, Color, InstancedMesh, Object3D, ShaderMaterial, TubeGeometry, Vector3 } from 'three'
import type { Exclusion, RunResult } from '@shared/clustercart'

export type ShowcaseRun = { key: string; result: RunResult; buyer: string; color: string; excludedCoords: { exclusion: Exclusion; lat: number; lng: number; area: string }[] }

const R = 11
const dummy = new Object3D()

/** Project approximate lat/lng (km grid) into the table, shared by all runs so they align. */
function useProjection(runs: ShowcaseRun[]) {
  return useMemo(() => {
    const pts: [number, number][] = []
    for (const r of runs) {
      if (r.result.buyer.lat != null) pts.push([r.result.buyer.lat, r.result.buyer.lng!])
      r.result.allocations.forEach((a) => pts.push([a.lat, a.lng]))
      r.excludedCoords.forEach((e) => pts.push([e.lat, e.lng]))
    }
    const lat0 = pts.reduce((s, p) => s + p[0], 0) / Math.max(1, pts.length), lng0 = pts.reduce((s, p) => s + p[1], 0) / Math.max(1, pts.length)
    const kx = Math.cos((lat0 * Math.PI) / 180) * 111
    const raw = pts.map(([la, ln]) => [(ln - lng0) * kx, (la - lat0) * 111])
    const max = Math.max(10, ...raw.map(([x, z]) => Math.hypot(x, z)))
    return (lat: number, lng: number, nudge = 0) => new Vector3(((lng - lng0) * kx / max) * R + nudge, 0, -((lat - lat0) * 111 / max) * R + nudge * 0.6)
  }, [runs])
}

function FlowRoute({ points, color, speed = 0.35, crates = 6 }: { points: Vector3[]; color: string; speed?: number; crates?: number }) {
  const curve = useMemo(() => {
    const lifted: Vector3[] = []
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1]
      lifted.push(a.clone().setY(0.25), a.clone().lerp(b, 0.5).setY(0.25 + a.distanceTo(b) * 0.18))
    }
    lifted.push(points[points.length - 1].clone().setY(0.25))
    return new CatmullRomCurve3(lifted)
  }, [points])
  const geo = useMemo(() => new TubeGeometry(curve, 160, 0.06, 8, false), [curve])
  const mat = useMemo(() => new ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uTime: { value: 0 }, uColor: { value: new Color(color) }, uRep: { value: curve.getLength() / 1.4 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float uTime; uniform vec3 uColor; uniform float uRep; varying vec2 vUv; void main(){ float d = fract(vUv.x * uRep - uTime); float g = smoothstep(0.0,0.1,d)*smoothstep(0.6,0.3,d); gl_FragColor = vec4(uColor * (1.0 + g * 1.4), 0.35 + g * 0.65); }',
  }), [color, curve])
  const crateRef = useRef<InstancedMesh>(null)
  useFrame(({ clock }, dt) => {
    mat.uniforms.uTime.value += dt * speed
    const m = crateRef.current
    if (!m) return
    for (let i = 0; i < crates; i++) {
      const t = (clock.elapsedTime * 0.06 + i / crates) % 1
      const p = curve.getPointAt(t)
      dummy.position.set(p.x, p.y + 0.12, p.z); dummy.rotation.set(0, t * 6, 0); dummy.scale.setScalar(Math.sin(t * Math.PI) * 0.9 + 0.1); dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })
  return (
    <>
      <mesh geometry={geo} material={mat} />
      <instancedMesh ref={crateRef} args={[undefined, undefined, crates]} castShadow>
        <boxGeometry args={[0.32, 0.22, 0.24]} />
        <meshStandardMaterial color="#C99A5B" roughness={0.7} />
      </instancedMesh>
    </>
  )
}

function Farm({ position, kg, maxKg, label, sub, active, tone }: { position: Vector3; kg: number; maxKg: number; label: string; sub: string; active: boolean; tone: string }) {
  const rows = useMemo(() => Array.from({ length: 6 }, (_, i) => i), [])
  const stack = Math.max(1, Math.round((kg / Math.max(1, maxKg)) * 7))
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow><planeGeometry args={[2.2, 1.7]} /><meshStandardMaterial color={active ? '#6A4B30' : '#4A4A40'} roughness={1} /></mesh>
      {rows.map((i) => (
        <mesh key={i} position={[0, 0.16, -0.7 + i * 0.28]} castShadow><boxGeometry args={[2, 0.28, 0.12]} /><meshStandardMaterial color={active ? tone : '#7A7F70'} roughness={0.8} /></mesh>
      ))}
      {active && Array.from({ length: stack }).map((_, i) => (
        <mesh key={i} castShadow position={[1.45, 0.14 + i * 0.26, 0]}><boxGeometry args={[0.5, 0.24, 0.4]} /><meshStandardMaterial color="#C99A5B" roughness={0.75} /></mesh>
      ))}
      <Html position={[0, 1.2 + (active ? stack * 0.26 : 0), 0]} center distanceFactor={14} zIndexRange={[20, 0]}>
        <div className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-center shadow-lg ${active ? 'bg-white text-forest-900' : 'bg-forest-900/80 text-cream-200'}`}>
          <p className="text-[13px] font-extrabold leading-tight">{label}</p><p className="text-[11px] font-semibold opacity-80">{sub}</p>
        </div>
      </Html>
    </group>
  )
}

function Buyer({ position, label, sub }: { position: Vector3; label: string; sub: string }) {
  const towers = useMemo(() => [[0, 1.6, 0], [0.55, 1.1, 0.3], [-0.5, 0.8, 0.35], [0.2, 2.1, -0.45], [-0.35, 1.3, -0.4]] as const, [])
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}><circleGeometry args={[1.25, 40]} /><meshStandardMaterial color="#174B35" emissive="#E5A63B" emissiveIntensity={0.15} /></mesh>
      {towers.map(([x, h, z], i) => <mesh key={i} castShadow position={[x, h / 2, z]}><boxGeometry args={[0.38, h, 0.38]} /><meshStandardMaterial color="#2C3A42" emissive="#FFB24F" emissiveIntensity={0.35} metalness={0.7} roughness={0.2} /></mesh>)}
      <Html position={[0, 3, 0]} center distanceFactor={14} zIndexRange={[20, 0]}>
        <div className="whitespace-nowrap rounded-xl bg-gold-400 px-3 py-1.5 text-center text-forest-900 shadow-lg"><p className="text-[13px] font-extrabold leading-tight">{label}</p><p className="text-[11px] font-semibold">{sub}</p></div>
      </Html>
    </group>
  )
}

export default function ClusterShowcase3D({ runs, focus, animate }: { runs: ShowcaseRun[]; focus: string; animate: boolean }) {
  const project = useProjection(runs)
  return (
    <Canvas shadows dpr={[1, 1.75]} camera={{ position: [0, 21, 25], fov: 42 }} frameloop={animate ? 'always' : 'demand'}>
      <color attach="background" args={['#0E2C1F']} />
      <fog attach="fog" args={['#0E2C1F', 26, 52]} />
      <Environment resolution={64} frames={1}><Sky sunPosition={[60, 18, -40]} turbidity={6} rayleigh={2} /></Environment>
      <ambientLight intensity={0.25} />
      <directionalLight castShadow position={[12, 18, 8]} intensity={2.2} color="#FFD9A0" shadow-mapSize={[1024, 1024]} shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={16} shadow-camera-bottom={-16} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><circleGeometry args={[16, 96]} /><meshStandardMaterial color="#163D2B" roughness={0.95} /></mesh>
      {[4, 8, 12, 15.5].map((r) => <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}><ringGeometry args={[r, r + 0.03, 128]} /><meshBasicMaterial color="#E5A63B" transparent opacity={0.18} /></mesh>)}
      {runs.map((run, ri) => {
        const r = run.result
        if (r.buyer.lat == null) return null
        const nudge = (ri - (runs.length - 1) / 2) * 1.6
        const buyer = project(r.buyer.lat, r.buyer.lng!, nudge)
        const farms = r.allocations.map((a) => ({ a, p: project(a.lat, a.lng) }))
        const maxKg = Math.max(...runs.flatMap((x) => x.result.allocations.map((a) => a.quantityKg)), 1)
        const isFocus = run.key === focus
        const order = r.recommendation === 'pooled' && r.pooled
          ? r.pooled.stops.slice(0, -1).map((name) => farms.find((f) => f.a.area === name)?.p).filter((p): p is Vector3 => !!p)
          : null
        return (
          <group key={run.key}>
            {farms.map(({ a, p }) => <Farm key={a.listingId} position={p} kg={a.quantityKg} maxKg={maxKg} label={a.area.split(',')[0]} sub={`${a.quantity} ${a.unit === 'quintal' ? 'q' : a.unit} → ${run.buyer.split(' (')[0]}`} active tone={run.color} />)}
            {run.excludedCoords.map((e) => <Farm key={e.exclusion.listingId} position={project(e.lat, e.lng)} kg={0} maxKg={1} label={e.area.split(',')[0]} sub={e.exclusion.code.replace(/_/g, ' ').toLowerCase()} active={false} tone="#777" />)}
            <Buyer position={buyer} label={run.buyer} sub={`${(r.allocatedKg / 100).toLocaleString('en-IN')} q · ${r.recommendation}`} />
            {order ? <FlowRoute points={[...order, buyer]} color={isFocus ? '#FFC864' : '#B88A3C'} crates={8} />
              : farms.map(({ a, p }) => <FlowRoute key={a.listingId} points={[p, buyer]} color={isFocus ? '#8FE0A8' : '#4F8D66'} crates={4} speed={0.5} />)}
          </group>
        )
      })}
      <OrbitControls enablePan={false} minDistance={12} maxDistance={34} maxPolarAngle={Math.PI / 2.4} autoRotate={animate} autoRotateSpeed={0.35} />
    </Canvas>
  )
}
