import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html, Line, OrbitControls } from '@react-three/drei'
import type { Group } from 'three'
import type { RunResult } from '@shared/clustercart'
import { projectNetwork } from './network'

function Scene({ result, animate }: { result: RunResult; animate: boolean }) {
  const { nodes, pooledOrder } = useMemo(() => projectNetwork(result), [result])
  const group = useRef<Group>(null)
  useFrame((_, dt) => { if (animate && group.current) group.current.rotation.y += dt * 0.08 })
  const at = (id: string) => { const n = nodes.find((x) => x.id === id)!; return [n.x * 4, 0, -n.y * 4] as [number, number, number] }
  const maxKg = Math.max(...nodes.map((n) => n.kg ?? 0)) || 1
  return (
    <group ref={group}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}><circleGeometry args={[5.5, 64]} /><meshStandardMaterial color="#2A6A48" /></mesh>
      {nodes.map((n) => {
        const h = n.kind === 'buyer' ? 0.9 : 0.25 + 1.2 * ((n.kg ?? 0) / maxKg)
        const [x, , z] = at(n.id)
        return (
          <group key={n.id} position={[x, h / 2, z]}>
            <mesh castShadow>
              {n.kind === 'buyer' ? <boxGeometry args={[0.6, h, 0.6]} /> : <cylinderGeometry args={[0.28, 0.28, h, 24]} />}
              <meshStandardMaterial color={n.kind === 'buyer' ? '#F5F0E4' : '#E5A63B'} roughness={0.6} />
            </mesh>
            <Html center distanceFactor={9} position={[0, h / 2 + 0.35, 0]}>
              <span className="whitespace-nowrap rounded-lg bg-white/90 px-2 py-0.5 text-xs font-bold text-forest-800 shadow">{n.label.split(',')[0]}</span>
            </Html>
          </group>
        )
      })}
      {result.recommendation === 'pooled'
        ? <Line points={pooledOrder.map((id) => { const p = at(id); return [p[0], 0.06, p[2]] as [number, number, number] })} color="#E5A63B" lineWidth={4} />
        : nodes.filter((n) => n.kind === 'farm').map((n) => { const p = at(n.id); return <Line key={n.id} points={[[p[0], 0.06, p[2]], [0, 0.06, 0]]} color="#F5F0E4" lineWidth={2} dashed dashSize={0.2} gapSize={0.15} /> })}
    </group>
  )
}

/** Data-driven 3D view of a real ClusterCart result. Lazy-loaded; disposed on unmount by R3F. */
export default function ClusterNetwork3D({ result, animate }: { result: RunResult; animate: boolean }) {
  return (
    <Canvas camera={{ position: [0, 6, 7], fov: 45 }} dpr={[1, 1.75]} frameloop={animate ? 'always' : 'demand'} aria-label="3D ClusterCart network">
      <color attach="background" args={['#FBF8F1']} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[4, 8, 3]} intensity={1.1} color="#FFF3D1" />
      <Scene result={result} animate={animate} />
      <OrbitControls enablePan={false} minDistance={5} maxDistance={14} maxPolarAngle={Math.PI / 2.2} />
    </Canvas>
  )
}
