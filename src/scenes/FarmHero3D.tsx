import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float, Instance, Instances, Line } from '@react-three/drei'
import { CatmullRomCurve3, Vector3, type Group, type Mesh } from 'three'

/**
 * SEED X interactive 3D hero: farms -> collection hub -> town buyer at golden hour.
 * Built in code with React Three Fiber (no external assets). Trucks travel along the gold
 * connection routes. Lazy-loaded, desktop-only, paused when hidden; SVG fallback elsewhere.
 */
const ROUTES: [number, number, number][][] = [
  [[-6.2, 0.05, 2.6], [-4.4, 0.05, 1.4], [-2.2, 0.05, 0.9], [0, 0.05, 0.2]],
  [[-5.4, 0.05, -2.4], [-3.6, 0.05, -1.6], [-1.8, 0.05, -0.6], [0, 0.05, 0.2]],
  [[-2.6, 0.05, 3.8], [-1.6, 0.05, 2.4], [-0.6, 0.05, 1.2], [0, 0.05, 0.2]],
  [[0.9, 0.05, 0.1], [2.6, 0.05, -0.4], [4.4, 0.05, -1.3], [6.2, 0.05, -2.2]],
]

function Field({ x, z, w, d, color }: { x: number; z: number; w: number; d: number; color: string }) {
  const rows = Math.floor(d / 0.32)
  return (
    <group position={[x, 0, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[w, d]} /><meshStandardMaterial color="#5B4632" roughness={1} /></mesh>
      <Instances limit={rows}>
        <boxGeometry args={[w * 0.92, 0.16, 0.14]} />
        <meshStandardMaterial color={color} roughness={0.85} />
        {Array.from({ length: rows }).map((_, i) => <Instance key={i} position={[0, 0.08, -d / 2 + 0.2 + i * 0.32]} />)}
      </Instances>
    </group>
  )
}

function Truck({ curve, offset, speed }: { curve: CatmullRomCurve3; offset: number; speed: number }) {
  const ref = useRef<Group>(null)
  const tmp = useMemo(() => new Vector3(), [])
  useFrame(({ clock }) => {
    const t = (clock.elapsedTime * speed + offset) % 1
    const p = curve.getPointAt(t)
    const ahead = curve.getPointAt(Math.min(0.999, t + 0.01), tmp)
    if (ref.current) { ref.current.position.set(p.x, 0.16, p.z); ref.current.lookAt(ahead.x, 0.16, ahead.z) }
  })
  return (
    <group ref={ref}>
      <mesh castShadow position={[0, 0, -0.08]}><boxGeometry args={[0.28, 0.24, 0.42]} /><meshStandardMaterial color="#F5F0E4" /></mesh>
      <mesh castShadow position={[0, -0.02, 0.2]}><boxGeometry args={[0.26, 0.2, 0.16]} /><meshStandardMaterial color="#174B35" /></mesh>
    </group>
  )
}

function Pulse({ position }: { position: [number, number, number] }) {
  const ref = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    const s = 1 + 0.25 * Math.sin(clock.elapsedTime * 2.2 + position[0])
    ref.current?.scale.set(s, s, s)
  })
  return <mesh ref={ref} position={position}><sphereGeometry args={[0.11, 16, 16]} /><meshStandardMaterial color="#FFF3D1" emissive="#E5A63B" emissiveIntensity={0.9} /></mesh>
}

function Scene() {
  const curves = useMemo(() => ROUTES.map((pts) => new CatmullRomCurve3(pts.map((p) => new Vector3(...p)))), [])
  const rig = useRef<Group>(null)
  useFrame(({ clock, pointer }) => {
    if (!rig.current) return
    rig.current.rotation.y = -0.35 + Math.sin(clock.elapsedTime * 0.12) * 0.05 + pointer.x * 0.06
    rig.current.rotation.x = pointer.y * -0.025
  })
  return (
    <group position={[4.4, 0, 0.6]}><group ref={rig}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow><circleGeometry args={[9, 64]} /><meshStandardMaterial color="#4F8D66" roughness={1} /></mesh>
      <Field x={-5.3} z={1.6} w={2.2} d={2.4} color="#8FBB9D" />
      <Field x={-4.6} z={-2.8} w={2.4} d={2} color="#E5A63B" />
      <Field x={-2.2} z={3.4} w={2} d={1.6} color="#2A6A48" />
      <Field x={-6.4} z={-0.6} w={1.4} d={1.6} color="#C4DCCB" />
      {/* collection hub */}
      <group position={[0.2, 0, 0.2]}>
        <mesh castShadow position={[0, 0.32, 0]}><boxGeometry args={[1.4, 0.64, 0.9]} /><meshStandardMaterial color="#F5F0E4" /></mesh>
        <mesh castShadow position={[0, 0.78, 0]} rotation={[0, 0, Math.PI / 4]}><boxGeometry args={[0.72, 0.72, 0.98]} /><meshStandardMaterial color="#174B35" /></mesh>
        {[[-0.95, 0.12, 0.35], [-0.95, 0.12, 0.05], [-0.95, 0.36, 0.2]].map((p, i) => <mesh key={i} castShadow position={p as [number, number, number]}><boxGeometry args={[0.24, 0.24, 0.24]} /><meshStandardMaterial color="#CF8D22" /></mesh>)}
      </group>
      {/* town buyer */}
      <group position={[6.6, 0, -2.6]}>
        {[[0, 0.6, 0, 1.2], [0.5, 0.9, 0.3, 1.8], [-0.5, 0.45, 0.4, 0.9], [0.2, 0.7, -0.5, 1.4], [0.9, 0.35, -0.2, 0.7]].map(([x, , z, h], i) => (
          <mesh key={i} castShadow position={[x, h / 2, z]}><boxGeometry args={[0.38, h, 0.38]} /><meshStandardMaterial color={i % 2 ? '#EBE2CD' : '#D9C9A4'} /></mesh>
        ))}
      </group>
      {curves.map((c, i) => <Line key={i} points={c.getPoints(40)} color="#E5A63B" lineWidth={3} transparent opacity={0.9} />)}
      {ROUTES.map((r, i) => <Pulse key={i} position={[r[0][0], 0.18, r[0][2]]} />)}
      <Pulse position={[6.2, 0.18, -2.2]} />
      {curves.map((c, i) => <Truck key={i} curve={c} offset={i * 0.27} speed={0.045 + i * 0.006} />)}
      {/* trees */}
      {[[-3.2, -0.2], [-1, -2.4], [2.6, 2.4], [3.6, 1.2], [-7, 2.8], [1.6, -3], [4.8, 2.6]].map(([x, z], i) => (
        <Float key={i} speed={1.2} rotationIntensity={0} floatIntensity={0.15}>
          <group position={[x, 0, z]}>
            <mesh position={[0, 0.25, 0]}><cylinderGeometry args={[0.05, 0.07, 0.5]} /><meshStandardMaterial color="#5B4632" /></mesh>
            <mesh castShadow position={[0, 0.7, 0]}><icosahedronGeometry args={[0.38, 0]} /><meshStandardMaterial color={i % 2 ? '#2A6A48' : '#1F5A3D'} flatShading /></mesh>
          </group>
        </Float>
      ))}
    </group></group>
  )
}

export default function FarmHero3D({ active = true }: { active?: boolean }) {
  return (
    <Canvas frameloop={active ? 'always' : 'never'} shadows dpr={[1, 1.6]} camera={{ position: [5.5, 9.5, 14], fov: 36 }} onCreated={({ camera }) => camera.lookAt(3.2, 0, 0)} aria-label="Interactive 3D illustration of farms connected to a collection hub and town buyer">
      <color attach="background" args={['#F7E3B5']} />
      <fog attach="fog" args={['#F7E3B5', 16, 30]} />
      <hemisphereLight args={['#FFF3D1', '#2A6A48', 0.75]} />
      <directionalLight castShadow position={[8, 9, 4]} intensity={1.6} color="#FFE2A8" shadow-mapSize={[1024, 1024]} />
      <Scene />
    </Canvas>
  )
}
