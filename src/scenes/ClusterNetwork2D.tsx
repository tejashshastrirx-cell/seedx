import type { RunResult } from '@shared/clustercart'
import { motion } from 'motion/react'
import { projectNetwork } from './network'

/** Accessible 2D network of the actual allocation (approximate public locations only). */
export function ClusterNetwork2D({ result }: { result: RunResult }) {
  const { nodes, pooledOrder } = projectNetwork(result)
  if (nodes.length < 2) return null
  const S = 150, C = 180
  const pos = (id: string) => { const n = nodes.find((x) => x.id === id)!; return [C + n.x * S, C - n.y * S] as const }
  const pooled = result.recommendation === 'pooled'
  const maxKg = Math.max(...nodes.map((n) => n.kg ?? 0))
  return (
    <svg viewBox="0 0 360 360" className="h-auto w-full" role="img" aria-label={`ClusterCart network: ${nodes.length - 1} farms to ${result.buyer.area}, ${pooled ? 'pooled route' : 'separate trips'}`}>
      <rect width="360" height="360" rx="24" fill="#FBF8F1" />
      {[60, 120, 170].map((r) => <circle key={r} cx={C} cy={C} r={r} fill="none" stroke="#E6F1E7" strokeDasharray="3 6" />)}
      {pooled
        ? <motion.path d={'M' + pooledOrder.map((id) => pos(id).join(' ')).join(' L')} fill="none" stroke="#E5A63B" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, ease: 'easeInOut' }} />
        : nodes.filter((n) => n.kind === 'farm').map((n, i) => { const [x, y] = pos(n.id); return <motion.path key={n.id} d={`M${x} ${y} L${C} ${C}`} stroke="#4F8D66" strokeWidth="3" strokeLinecap="round"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, delay: i * 0.2 }} /> })}
      {nodes.map((n) => {
        const [x, y] = pos(n.id)
        const r = n.kind === 'buyer' ? 14 : 8 + 8 * ((n.kg ?? 0) / (maxKg || 1))
        return (
          <motion.g key={n.id} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 18, delay: n.kind === 'buyer' ? 0 : 0.15 }} style={{ transformOrigin: `${x}px ${y}px` }}>
            <circle cx={x} cy={y} r={r} fill={n.kind === 'buyer' ? '#174B35' : '#F5F0E4'} stroke={n.kind === 'buyer' ? '#E5A63B' : '#174B35'} strokeWidth="3" />
            <text x={x} y={y + r + 15} textAnchor="middle" fontSize="12" fontWeight="700" fill="#1C2420">{n.label.split(',')[0]}</text>
          </motion.g>
        )
      })}
    </svg>
  )
}
