import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import {
  BufferAttribute, CanvasTexture, Color, DoubleSide, Float32BufferAttribute, InstancedMesh, Matrix4, MeshStandardMaterial, Object3D, PlaneGeometry,
  RepeatWrapping, SRGBColorSpace, ShaderMaterial, TubeGeometry, Vector3, type CatmullRomCurve3, type Group, type Mesh,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { CITY, HUB, MARKET_ROUTE, PICKUPS, PLOTS, ROUTE_POINTS, groundCurve, heightAt, inPlot, rng } from './terrain'

export type Tier = 'high' | 'low'
const dummy = new Object3D()
const tmpColor = new Color()

// ------------------------------------------------------------------ terrain
function Terrain({ tier }: { tier: Tier }) {
  const geo = useMemo(() => {
    const seg = tier === 'high' ? 260 : 150
    const g = new PlaneGeometry(420, 420, seg, seg)
    g.rotateX(-Math.PI / 2)
    g.translate(30, 0, -30)
    const pos = g.attributes.position as BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const grass = new Color('#6E8A45'), grassDry = new Color('#A49253'), soil = new Color('#6A4B30'), soilDark = new Color('#4E3622'), far = new Color('#7C8E5A')
    const r = rng(7)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i)
      pos.setY(i, heightAt(x, z))
      const plot = inPlot(x, z)
      if (plot) {
        const furrow = Math.sin((z * Math.cos(plot.rot) - x * Math.sin(plot.rot)) * 6.5) > 0
        tmpColor.copy(furrow ? soil : soilDark)
      } else {
        const dist = Math.hypot(x - 10, z + 10)
        tmpColor.copy(grass).lerp(grassDry, 0.35 + 0.35 * Math.sin(x * 0.11) * Math.cos(z * 0.09)).lerp(far, Math.min(1, dist / 160))
      }
      tmpColor.offsetHSL(0, 0, (r() - 0.5) * 0.04)
      colors.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3)
    }
    g.setAttribute('color', new BufferAttribute(colors, 3))
    g.computeVertexNormals()
    return g
  }, [tier])
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.96} metalness={0} />
    </mesh>
  )
}

// ------------------------------------------------------------------ crops (instanced, wind shader)
function plantGeometry(height: number, width: number) {
  const parts = [0, Math.PI / 3, (2 * Math.PI) / 3].map((a, k) => {
    const p = new PlaneGeometry(width, height, 1, 5)
    const pos = p.attributes.position as BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) + height / 2
      const t = y / height
      pos.setX(i, pos.getX(i) * (1 - t * 0.85))
      pos.setZ(i, t * t * 0.12 * (k % 2 ? 1 : -1))
      pos.setY(i, y)
    }
    p.rotateY(a)
    const cols = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) { const t = pos.getY(i) / height; cols.set([0.55 + t * 0.45, 0.55 + t * 0.45, 0.55 + t * 0.45], i * 3) }
    p.setAttribute('color', new Float32BufferAttribute(cols, 3))
    return p
  })
  return mergeGeometries(parts)!
}

const windUniforms = { uTime: { value: 0 } }
function windMaterial() {
  const m = new MeshStandardMaterial({ vertexColors: true, side: DoubleSide, roughness: 0.78, metalness: 0 })
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = windUniforms.uTime
    s.vertexShader = 'uniform float uTime;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float hh = clamp(position.y, 0.0, 1.4);
      vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
      float w = sin(uTime * 1.5 + ip.x * 0.32 + ip.y * 0.21) * 0.6 + sin(uTime * 2.9 + ip.x * 1.1 - ip.y * 0.7) * 0.2;
      transformed.x += w * hh * hh * 0.16;
      transformed.z += w * hh * hh * 0.08;`)
  }
  return m
}

const CROP: Record<string, { h: number; w: number; colors: string[]; spacing: number }> = {
  wheat: { h: 1.0, w: 0.16, colors: ['#D8A84A', '#E5B95C', '#C99A3E', '#E9C36D'], spacing: 0.42 },
  young: { h: 0.55, w: 0.2, colors: ['#4E8A3A', '#5E9B44', '#3F7A33'], spacing: 0.4 },
  mustard: { h: 0.9, w: 0.2, colors: ['#B8C23F', '#D8C93A', '#9FB43C', '#E3CF48'], spacing: 0.44 },
  paddy: { h: 0.7, w: 0.14, colors: ['#7FAE47', '#8DBB52', '#6E9E3F'], spacing: 0.36 },
}

function Crops({ tier }: { tier: Tier }) {
  const groups = useMemo(() => {
    const r = rng(42)
    const byCrop: Record<string, Matrix4[]> = {}
    const colByCrop: Record<string, Color[]> = {}
    for (const p of PLOTS) {
      const spec = CROP[p.crop]
      const sp = spec.spacing * (tier === 'high' ? 1 : 1.7)
      const c = Math.cos(p.rot), s = Math.sin(p.rot)
      for (let lz = -p.d / 2 + 0.3; lz < p.d / 2; lz += sp * 1.6) {
        for (let lx = -p.w / 2 + 0.2; lx < p.w / 2; lx += sp) {
          const jx = lx + (r() - 0.5) * sp * 0.6, jz = lz + (r() - 0.5) * sp * 0.4
          const x = p.x + jx * c + jz * s, z = p.z - jx * s + jz * c
          dummy.position.set(x, heightAt(x, z) - 0.02, z)
          dummy.rotation.set(0, r() * Math.PI, 0)
          const sc = 0.75 + r() * 0.5
          dummy.scale.set(sc, sc * (0.85 + r() * 0.3), sc)
          dummy.updateMatrix()
          ;(byCrop[p.crop] ??= []).push(dummy.matrix.clone())
          ;(colByCrop[p.crop] ??= []).push(new Color(spec.colors[Math.floor(r() * spec.colors.length)]))
        }
      }
    }
    return Object.keys(byCrop).map((k) => ({ crop: k, mats: byCrop[k], cols: colByCrop[k], geo: plantGeometry(CROP[k].h, CROP[k].w) }))
  }, [tier])
  const material = useMemo(windMaterial, [])
  useFrame(({ clock }) => { windUniforms.uTime.value = clock.elapsedTime })
  return <>{groups.map((g) => <InstancedGroup key={g.crop} geo={g.geo} mats={g.mats} cols={g.cols} material={material} />)}</>
}

function InstancedGroup({ geo, mats, cols, material, cast = false }: { geo: THREE.BufferGeometry; mats: Matrix4[]; cols?: Color[]; material: THREE.Material; cast?: boolean }) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = ref.current!
    mats.forEach((mat, i) => { m.setMatrixAt(i, mat); if (cols) m.setColorAt(i, cols[i]) })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.computeBoundingSphere()
  }, [mats, cols])
  return <instancedMesh ref={ref} args={[geo, material, mats.length]} receiveShadow castShadow={cast} frustumCulled={false} />
}

// ------------------------------------------------------------------ trees
function Trees({ tier }: { tier: Tier }) {
  const { trunks, crowns, crownCols } = useMemo(() => {
    const r = rng(9)
    const trunks: Matrix4[] = [], crowns: Matrix4[] = [], crownCols: Color[] = []
    const palette = ['#2F5A2E', '#3B6B36', '#25492A', '#4A7A3C', '#557F3A']
    const place = (x: number, z: number, s: number) => {
      if (inPlot(x, z)) return
      const y = heightAt(x, z)
      dummy.position.set(x, y + 1.2 * s, z); dummy.rotation.set(0, r() * 6, 0); dummy.scale.set(s, s, s); dummy.updateMatrix(); trunks.push(dummy.matrix.clone())
      dummy.position.set(x, y + 3.1 * s, z); dummy.scale.set(s * (1 + r() * 0.4), s * (0.85 + r() * 0.3), s * (1 + r() * 0.4)); dummy.updateMatrix(); crowns.push(dummy.matrix.clone())
      crownCols.push(new Color(palette[Math.floor(r() * palette.length)]))
    }
    // field-border trees, a mango grove near the farm, scattered trees and far ridge forests
    for (let i = 0; i < 26; i++) place(-40 + r() * 50, 30 + r() * 10, 0.9 + r() * 0.6)
    for (let i = 0; i < 14; i++) place(-44 + r() * 8, -24 + r() * 40, 1 + r() * 0.5)
    for (let i = 0; i < 18; i++) place(-2 + r() * 14, 26 + r() * 12, 0.8 + r() * 0.5)
    const n = tier === 'high' ? 220 : 90
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = 55 + r() * 110
      const x = 10 + Math.cos(a) * d, z = -10 + Math.sin(a) * d
      if (Math.hypot(x - CITY.x, z - CITY.z) < 30) continue
      place(x, z, 1 + r() * 1.2)
    }
    return { trunks, crowns, crownCols }
  }, [tier])
  const trunkGeo = useMemo(() => { const g = new THREE.CylinderGeometry(0.16, 0.24, 2.4, 6); return g }, [])
  const crownGeo = useMemo(() => new THREE.IcosahedronGeometry(1.6, 1), [])
  const trunkMat = useMemo(() => new MeshStandardMaterial({ color: '#5A4330', roughness: 1 }), [])
  const crownMat = useMemo(() => new MeshStandardMaterial({ roughness: 0.9, flatShading: true }), [])
  return (
    <>
      <InstancedGroup geo={trunkGeo} mats={trunks} material={trunkMat} cast />
      <InstancedGroup geo={crownGeo} mats={crowns} cols={crownCols} material={crownMat} cast />
    </>
  )
}

// ------------------------------------------------------------------ water (irrigation canal, reflective)
function Canal() {
  const geo = useMemo(() => {
    const pts = [new Vector3(-48, 0, 30), new Vector3(-36, 0, 14.5), new Vector3(-19, 0, 14.6), new Vector3(-3, 0, 15.4), new Vector3(12, 0, 12), new Vector3(30, 0, 18)]
    const curve = new THREE.CatmullRomCurve3(pts)
    const samples = curve.getSpacedPoints(120)
    const verts: number[] = []
    const idx: number[] = []
    samples.forEach((p, i) => {
      const t = curve.getTangentAt(i / 120)
      const n = new Vector3(-t.z, 0, t.x).multiplyScalar(0.9)
      const y = heightAt(p.x, p.z) - 0.05
      verts.push(p.x + n.x, y, p.z + n.z, p.x - n.x, y, p.z - n.z)
      if (i < samples.length - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(verts, 3)); g.setIndex(idx); g.computeVertexNormals()
    return g
  }, [])
  return <mesh geometry={geo} receiveShadow><meshStandardMaterial color="#6E8E8C" metalness={0.85} roughness={0.08} envMapIntensity={1.4} /></mesh>
}

// ------------------------------------------------------------------ road towards the city
function Road() {
  const geo = useMemo(() => {
    const curve = groundCurve(MARKET_ROUTE, 0.05, 160)
    const s = curve.getSpacedPoints(160)
    const v: number[] = [], idx: number[] = []
    s.forEach((p, i) => {
      const t = curve.getTangentAt(Math.min(1, i / 160)); const n = new Vector3(-t.z, 0, t.x).normalize().multiplyScalar(1.6)
      v.push(p.x + n.x, heightAt(p.x + n.x, p.z + n.z) + 0.06, p.z + n.z, p.x - n.x, heightAt(p.x - n.x, p.z - n.z) + 0.06, p.z - n.z)
      if (i < s.length - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
    })
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(v, 3)); g.setIndex(idx); g.computeVertexNormals()
    return g
  }, [])
  return <mesh geometry={geo} receiveShadow><meshStandardMaterial color="#8A7A63" roughness={0.95} /></mesh>
}

// ------------------------------------------------------------------ golden routes (flowing shader)
function RouteTube({ curve, speed = 0.35, radius = 0.09, opacity = 1 }: { curve: CatmullRomCurve3; speed?: number; radius?: number; opacity?: number }) {
  const geo = useMemo(() => new TubeGeometry(curve, 200, radius, 6, false), [curve, radius])
  const len = useMemo(() => curve.getLength(), [curve])
  const mat = useMemo(() => new ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uTime: { value: 0 }, uRepeat: { value: len / 3.2 }, uColor: { value: new Color('#FFC864') }, uOpacity: { value: opacity } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime; uniform float uRepeat; uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
      void main(){ float d = fract(vUv.x * uRepeat - uTime); float dash = smoothstep(0.0, 0.08, d) * smoothstep(0.55, 0.3, d);
        float base = 0.28; gl_FragColor = vec4(uColor * (1.0 + dash * 1.8), (base + dash * 0.72) * uOpacity); }`,
  }), [len, opacity])
  useFrame((_, dt) => { mat.uniforms.uTime.value += dt * speed })
  return <mesh geometry={geo} material={mat} renderOrder={2} />
}

function Beacon({ position, delay = 0 }: { position: Vector3; delay?: number }) {
  const ring = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    const t = (clock.elapsedTime * 0.6 + delay) % 1
    if (ring.current) { ring.current.scale.setScalar(0.4 + t * 2.2); (ring.current.material as MeshStandardMaterial).opacity = 1 - t }
  })
  const y = heightAt(position.x, position.z)
  return (
    <group position={[position.x, y, position.z]}>
      <mesh position={[0, 0.45, 0]}><sphereGeometry args={[0.28, 20, 20]} /><meshStandardMaterial color="#FFE7B0" emissive="#FFB547" emissiveIntensity={3} toneMapped={false} /></mesh>
      <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.03, 0.03, 0.45]} /><meshStandardMaterial color="#E5A63B" /></mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]}><ringGeometry args={[0.55, 0.7, 40]} /><meshStandardMaterial color="#FFC864" emissive="#FFB547" emissiveIntensity={2} transparent toneMapped={false} /></mesh>
    </group>
  )
}

// ------------------------------------------------------------------ vehicles
const paint = { red: new MeshStandardMaterial({ color: '#B2361F', metalness: 0.55, roughness: 0.35 }), dark: new MeshStandardMaterial({ color: '#1C2420', roughness: 0.7 }),
  cream: new MeshStandardMaterial({ color: '#F1E9D6', metalness: 0.2, roughness: 0.45 }), forest: new MeshStandardMaterial({ color: '#174B35', metalness: 0.45, roughness: 0.35 }),
  glass: new MeshStandardMaterial({ color: '#2A3B3F', metalness: 0.9, roughness: 0.08 }), steel: new MeshStandardMaterial({ color: '#A9A9A2', metalness: 0.9, roughness: 0.3 }),
  wood: new MeshStandardMaterial({ color: '#B07D46', roughness: 0.85 }), gold: new MeshStandardMaterial({ color: '#E5A63B', metalness: 0.35, roughness: 0.4 }) }

function Wheel({ r, w, position }: { r: number; w: number; position: [number, number, number] }) {
  return (
    <group position={position} rotation={[0, 0, Math.PI / 2]}>
      <mesh castShadow material={paint.dark}><cylinderGeometry args={[r, r, w, 22]} /></mesh>
      <mesh material={paint.gold}><cylinderGeometry args={[r * 0.55, r * 0.55, w * 1.02, 16]} /></mesh>
    </group>
  )
}

function Tractor() {
  const ref = useRef<Group>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.05
    const x = -16 + Math.sin(t) * 5.5, z = -6.4
    if (ref.current) { ref.current.position.set(x, heightAt(x, z) + 0.05, z); ref.current.rotation.y = Math.cos(t) > 0 ? Math.PI / 2 : -Math.PI / 2 }
  })
  return (
    <group ref={ref} scale={0.95}>
      <mesh castShadow material={paint.red} position={[0, 1.05, 0.35]}><boxGeometry args={[0.9, 0.75, 2.1]} /></mesh>
      <mesh castShadow material={paint.red} position={[0, 1.3, -0.9]}><boxGeometry args={[1.05, 0.5, 1.0]} /></mesh>
      <mesh castShadow material={paint.dark} position={[0, 1.75, -0.95]}><boxGeometry args={[1.1, 0.06, 1.2]} /></mesh>
      {[[-0.5, -0.45], [0.5, -0.45], [-0.5, -1.35], [0.5, -1.35]].map(([x, z], i) => <mesh key={i} material={paint.steel} position={[x, 2.15, z + 0.45]}><cylinderGeometry args={[0.03, 0.03, 0.85]} /></mesh>)}
      <mesh material={paint.glass} position={[0, 2.6, -0.95]}><boxGeometry args={[1.1, 0.04, 1.25]} /></mesh>
      <mesh material={paint.steel} position={[0.3, 1.8, 1.1]}><cylinderGeometry args={[0.05, 0.05, 0.8]} /></mesh>
      <Wheel r={0.78} w={0.42} position={[-0.72, 0.78, -0.95]} /><Wheel r={0.78} w={0.42} position={[0.72, 0.78, -0.95]} />
      <Wheel r={0.42} w={0.26} position={[-0.56, 0.42, 1.15]} /><Wheel r={0.42} w={0.26} position={[0.56, 0.42, 1.15]} />
      {/* trailer with harvest */}
      <group position={[0, 0, -3.1]}>
        <mesh castShadow material={paint.forest} position={[0, 0.85, 0]}><boxGeometry args={[1.5, 0.5, 2.4]} /></mesh>
        <mesh castShadow position={[0, 1.25, 0]}><boxGeometry args={[1.35, 0.4, 2.2]} /><meshStandardMaterial color="#D9AE55" roughness={0.9} /></mesh>
        <Wheel r={0.4} w={0.24} position={[-0.82, 0.4, 0]} /><Wheel r={0.4} w={0.24} position={[0.82, 0.4, 0]} />
      </group>
    </group>
  )
}

function Truck({ curve, offset, speed, loaded = true }: { curve: CatmullRomCurve3; offset: number; speed: number; loaded?: boolean }) {
  const ref = useRef<Group>(null)
  const ahead = useMemo(() => new Vector3(), [])
  useFrame(({ clock }) => {
    const t = (clock.elapsedTime * speed + offset) % 1
    const p = curve.getPointAt(t)
    curve.getPointAt(Math.min(0.999, t + 0.004), ahead)
    if (ref.current) { ref.current.position.copy(p); ref.current.position.y -= 0.12; ref.current.lookAt(ahead.x, p.y - 0.12, ahead.z) }
  })
  return (
    <group ref={ref}>
      <mesh castShadow material={paint.cream} position={[0, 1.3, -0.6]}><boxGeometry args={[1.7, 1.7, 3.6]} /></mesh>
      <mesh material={paint.forest} position={[0, 1.31, -0.6]}><boxGeometry args={[1.72, 0.32, 3.62]} /></mesh>
      {loaded && <mesh castShadow material={paint.wood} position={[0, 2.25, -0.6]}><boxGeometry args={[1.4, 0.2, 3.2]} /></mesh>}
      <mesh castShadow material={paint.forest} position={[0, 1.05, 1.7]}><boxGeometry args={[1.7, 1.3, 1.2]} /></mesh>
      <mesh material={paint.glass} position={[0, 1.45, 2.28]}><boxGeometry args={[1.5, 0.5, 0.04]} /></mesh>
      <mesh position={[0.62, 0.85, 2.32]}><boxGeometry args={[0.18, 0.1, 0.02]} /><meshStandardMaterial color="#FFF3D1" emissive="#FFD27A" emissiveIntensity={4} toneMapped={false} /></mesh>
      <mesh position={[-0.62, 0.85, 2.32]}><boxGeometry args={[0.18, 0.1, 0.02]} /><meshStandardMaterial color="#FFF3D1" emissive="#FFD27A" emissiveIntensity={4} toneMapped={false} /></mesh>
      {[[-0.85, 1.6], [0.85, 1.6], [-0.85, -1.4], [0.85, -1.4], [-0.85, -0.3], [0.85, -0.3]].map(([x, z], i) => <Wheel key={i} r={0.38} w={0.26} position={[x, 0.38, z]} />)}
    </group>
  )
}

// ------------------------------------------------------------------ farmer (seen from behind, facing the fields: no invented face)
function Farmer() {
  const ref = useRef<Group>(null)
  useFrame(({ clock }) => { if (ref.current) ref.current.rotation.y = Math.PI + 0.35 + Math.sin(clock.elapsedTime * 0.35) * 0.04 })
  const x = -5.2, z = 16.6
  const skin = '#9C6B48'
  return (
    <group ref={ref} position={[x, heightAt(x, z), z]} scale={1.05}>
      <mesh castShadow position={[0, 0.52, 0]}><cylinderGeometry args={[0.2, 0.3, 1.05, 14]} /><meshStandardMaterial color="#F2EEE3" roughness={0.9} /></mesh>
      <mesh castShadow position={[0, 1.32, 0]}><capsuleGeometry args={[0.24, 0.5, 6, 14]} /><meshStandardMaterial color="#E8DCC2" roughness={0.85} /></mesh>
      <mesh castShadow position={[0, 1.05, 0.02]}><torusGeometry args={[0.25, 0.04, 8, 20]} /><meshStandardMaterial color="#C7A15E" /></mesh>
      <mesh castShadow position={[0.33, 1.25, 0.05]} rotation={[0.15, 0, 0.18]}><capsuleGeometry args={[0.07, 0.55, 4, 8]} /><meshStandardMaterial color="#E8DCC2" /></mesh>
      <mesh castShadow position={[-0.33, 1.3, 0.12]} rotation={[0.55, 0, -0.1]}><capsuleGeometry args={[0.07, 0.5, 4, 8]} /><meshStandardMaterial color="#E8DCC2" /></mesh>
      <mesh position={[-0.37, 1.06, 0.36]}><sphereGeometry args={[0.07, 10, 10]} /><meshStandardMaterial color={skin} /></mesh>
      <mesh castShadow position={[-0.38, 0.95, 0.4]} rotation={[0.05, 0, 0]}><cylinderGeometry args={[0.025, 0.025, 1.9]} /><meshStandardMaterial color="#6B4A2E" /></mesh>
      <mesh castShadow position={[0, 1.78, 0]}><cylinderGeometry args={[0.07, 0.09, 0.14]} /><meshStandardMaterial color={skin} /></mesh>
      <mesh castShadow position={[0, 1.95, 0]}><sphereGeometry args={[0.15, 18, 18]} /><meshStandardMaterial color={skin} roughness={0.7} /></mesh>
      <mesh castShadow position={[0, 2.06, 0]} scale={[1.05, 0.62, 1.05]}><sphereGeometry args={[0.2, 18, 14]} /><meshStandardMaterial color="#F3E7CC" roughness={0.9} /></mesh>
      <mesh castShadow position={[0, 2.0, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.16, 0.06, 10, 22]} /><meshStandardMaterial color="#E5A63B" roughness={0.8} /></mesh>
      <mesh castShadow position={[0.18, 1.5, -0.12]} rotation={[0.2, 0, -0.25]}><boxGeometry args={[0.1, 0.9, 0.04]} /><meshStandardMaterial color="#C9B28A" roughness={1} side={DoubleSide} /></mesh>
    </group>
  )
}

// ------------------------------------------------------------------ crates & produce
function Crates({ tier }: { tier: Tier }) {
  const { boxes, produce, pcols } = useMemo(() => {
    const r = rng(3)
    const boxes: Matrix4[] = [], produce: Matrix4[] = [], pcols: Color[] = []
    const prodColors = ['#C4381F', '#D9572A', '#E5A63B', '#7FA548', '#C9902F']
    const stack = (cx: number, cz: number, cols: number, rows: number, layers: number, rot: number, color: string) => {
      for (let l = 0; l < layers; l++) for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        if (l === layers - 1 && r() < 0.3) continue
        const lx = (i - cols / 2) * 0.62, lz = (j - rows / 2) * 0.46
        const x = cx + lx * Math.cos(rot) - lz * Math.sin(rot), z = cz + lx * Math.sin(rot) + lz * Math.cos(rot)
        const y = heightAt(cx, cz) + 0.17 + l * 0.34
        dummy.position.set(x, y, z); dummy.rotation.set(0, rot + (r() - 0.5) * 0.08, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); boxes.push(dummy.matrix.clone())
        if (l === layers - 1 || r() < 0.2) for (let k = 0; k < 5; k++) {
          dummy.position.set(x + (r() - 0.5) * 0.4, y + 0.17 + r() * 0.05, z + (r() - 0.5) * 0.28); dummy.scale.setScalar(0.85 + r() * 0.4); dummy.updateMatrix(); produce.push(dummy.matrix.clone())
          pcols.push(new Color(color === 'mix' ? prodColors[Math.floor(r() * prodColors.length)] : color))
        }
      }
    }
    stack(-1.5, 12.2, 4, 3, 3, 0.3, '#C4381F')
    stack(1.6, 13.0, 3, 2, 2, -0.2, '#E5A63B')
    stack(HUB.x - 5.2, HUB.z + 4.6, 5, 3, 4, 0, 'mix')
    stack(HUB.x - 5.2, HUB.z - 1.2, 4, 3, 3, 0, 'mix')
    if (tier === 'high') stack(HUB.x + 7.5, HUB.z + 5, 4, 2, 3, 0.1, 'mix')
    return { boxes, produce, pcols }
  }, [tier])
  const boxGeo = useMemo(() => new THREE.BoxGeometry(0.58, 0.32, 0.42), [])
  const boxMat = useMemo(() => new MeshStandardMaterial({ color: '#B98A55', roughness: 0.85 }), [])
  const pGeo = useMemo(() => new THREE.SphereGeometry(0.06, 8, 8), [])
  const pMat = useMemo(() => new MeshStandardMaterial({ roughness: 0.45 }), [])
  return (<><InstancedGroup geo={boxGeo} mats={boxes} material={boxMat} cast /><InstancedGroup geo={pGeo} mats={produce} cols={pcols} material={pMat} /></>)
}

// ------------------------------------------------------------------ collection centre (modern, solar roof)
function CollectionCentre() {
  const y = heightAt(HUB.x, HUB.z)
  const panels = useMemo(() => {
    const m: Matrix4[] = []
    for (let i = 0; i < 9; i++) for (let j = 0; j < 4; j++) {
      dummy.position.set(-6.4 + i * 1.6, 0, -2.5 + j * 1.25); dummy.rotation.set(-0.12, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); m.push(dummy.matrix.clone())
    }
    return m
  }, [])
  const panelGeo = useMemo(() => new THREE.BoxGeometry(1.45, 0.05, 1.1), [])
  const panelMat = useMemo(() => new MeshStandardMaterial({ color: '#1C2E4A', metalness: 0.85, roughness: 0.18 }), [])
  return (
    <group position={[HUB.x, y, HUB.z]} rotation={[0, -0.35, 0]}>
      <mesh receiveShadow position={[0, 0.06, 0]}><boxGeometry args={[22, 0.12, 14]} /><meshStandardMaterial color="#B7AE9C" roughness={0.9} /></mesh>
      <mesh castShadow receiveShadow position={[0, 2.4, -1.5]}><boxGeometry args={[16, 4.8, 8]} /><meshStandardMaterial color="#F2EDE2" roughness={0.6} /></mesh>
      <mesh castShadow position={[0, 4.95, -1.5]}><boxGeometry args={[16.8, 0.3, 8.8]} /><meshStandardMaterial color="#2E3B36" metalness={0.6} roughness={0.4} /></mesh>
      <group position={[0, 5.25, -1.5]}><InstancedGroup geo={panelGeo} mats={panels} material={panelMat} /></group>
      <mesh position={[0, 3.6, 2.52]}><boxGeometry args={[16.02, 0.7, 0.05]} /><meshStandardMaterial color="#174B35" metalness={0.3} roughness={0.5} /></mesh>
      <mesh position={[-5.4, 3.6, 2.56]}><boxGeometry args={[1.8, 0.36, 0.03]} /><meshStandardMaterial color="#E5A63B" emissive="#E5A63B" emissiveIntensity={0.6} /></mesh>
      {[-4.5, 0, 4.5].map((x) => (
        <group key={x} position={[x, 0, 2.5]}>
          <mesh position={[0, 1.5, 0.02]}><boxGeometry args={[3.2, 3, 0.05]} /><meshStandardMaterial color="#3A3F3A" metalness={0.6} roughness={0.35} /></mesh>
          <mesh position={[0, 2.95, 0.6]}><boxGeometry args={[3.6, 0.08, 1.2]} /><meshStandardMaterial color="#174B35" /></mesh>
          <mesh position={[0, 1.4, 0.06]}><boxGeometry args={[3.0, 2.6, 0.02]} /><meshStandardMaterial color="#FFE4A8" emissive="#FFC864" emissiveIntensity={0.55} /></mesh>
        </group>
      ))}
      <mesh castShadow position={[9.2, 2.6, -1.5]}><cylinderGeometry args={[1.4, 1.4, 5.2, 24]} /><meshStandardMaterial color="#C9CCC6" metalness={0.8} roughness={0.25} /></mesh>
      <mesh castShadow position={[9.2, 5.4, -1.5]}><coneGeometry args={[1.45, 0.8, 24]} /><meshStandardMaterial color="#A9ADA6" metalness={0.8} roughness={0.25} /></mesh>
    </group>
  )
}

// ------------------------------------------------------------------ distant city (buyer market)
function windowTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#B9AE9A'; g.fillRect(0, 0, 64, 128)
  const r = rng(11)
  for (let y = 4; y < 128; y += 8) for (let x = 4; x < 64; x += 8) { g.fillStyle = r() < 0.38 ? '#FFD991' : '#6F7A7C'; g.fillRect(x, y, 5, 5) }
  const t = new CanvasTexture(c); t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = SRGBColorSpace; return t
}
function City({ tier }: { tier: Tier }) {
  const tex = useMemo(windowTexture, [])
  const mats = useMemo(() => {
    const r = rng(5)
    const m: Matrix4[] = []
    const n = tier === 'high' ? 110 : 60
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = Math.pow(r(), 0.6) * 26
      const x = CITY.x + Math.cos(a) * d * 1.3, z = CITY.z + Math.sin(a) * d
      const h = 6 + Math.pow(r(), 2.2) * 42 * (1 - d / 40)
      const w = 2.4 + r() * 2.8
      dummy.position.set(x, heightAt(x, z) + h / 2, z); dummy.rotation.set(0, r() * 0.4, 0); dummy.scale.set(w, h, w * (0.7 + r() * 0.6)); dummy.updateMatrix(); m.push(dummy.matrix.clone())
    }
    return m
  }, [tier])
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  const mat = useMemo(() => new MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new Color('#FFB55C'), emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.5 }), [tex])
  return <InstancedGroup geo={geo} mats={mats} material={mat} cast />
}

// ------------------------------------------------------------------ birds (subtle environmental motion)
function Birds() {
  const ref = useRef<Group>(null)
  const birds = useMemo(() => Array.from({ length: 9 }, (_, i) => ({ o: i * 0.9, r: 6 + (i % 3) * 1.4, h: 20 + (i % 4) })), [])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    ref.current?.children.forEach((b, i) => {
      const s = birds[i]
      b.position.set(-4 + Math.cos(t * 0.18 + s.o) * s.r * 2.2, s.h + Math.sin(t * 0.5 + s.o) * 0.8, -6 + Math.sin(t * 0.18 + s.o) * s.r)
      b.rotation.y = -(t * 0.18 + s.o)
      const flap = Math.sin(t * 7 + s.o * 3) * 0.6
      ;(b.children[0] as Mesh).rotation.z = flap; (b.children[1] as Mesh).rotation.z = -flap
    })
  })
  return (
    <group ref={ref}>
      {birds.map((_, i) => (
        <group key={i}>
          <mesh position={[0.25, 0, 0]}><planeGeometry args={[0.5, 0.12]} /><meshBasicMaterial color="#2B2A24" side={DoubleSide} /></mesh>
          <mesh position={[-0.25, 0, 0]}><planeGeometry args={[0.5, 0.12]} /><meshBasicMaterial color="#2B2A24" side={DoubleSide} /></mesh>
        </group>
      ))}
    </group>
  )
}

export function World({ tier }: { tier: Tier }) {
  const farmRoutes = useMemo(() => ROUTE_POINTS.map((p) => groundCurve(p, 0.22)), [])
  const market = useMemo(() => groundCurve(MARKET_ROUTE, 0.28, 160), [])
  const truckLoop = useMemo(() => groundCurve(MARKET_ROUTE, 0.18, 160), [])
  const pickupRun = useMemo(() => groundCurve([PICKUPS[1], new Vector3(-20, 0, 0), new Vector3(2, 0, -2), HUB], 0.1), [])
  return (
    <>
      <Terrain tier={tier} />
      <Canal />
      <Road />
      <Crops tier={tier} />
      <Trees tier={tier} />
      <Crates tier={tier} />
      <CollectionCentre />
      <City tier={tier} />
      <Farmer />
      <Tractor />
      {farmRoutes.map((c, i) => <RouteTube key={i} curve={c} speed={0.32 + i * 0.05} />)}
      <RouteTube curve={market} speed={0.5} radius={0.16} />
      {PICKUPS.map((p, i) => <Beacon key={i} position={p} delay={i * 0.33} />)}
      <Beacon position={HUB.clone().add(new Vector3(-6, 0, 6))} delay={0.5} />
      <Truck curve={truckLoop} offset={0} speed={0.018} />
      <Truck curve={truckLoop} offset={0.52} speed={0.018} />
      <Truck curve={pickupRun} offset={0.2} speed={0.035} loaded={false} />
      {tier === 'high' && <Birds />}
    </>
  )
}

