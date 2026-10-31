import type { RunResult } from '@shared/clustercart'

export type NetNode = { id: string; label: string; x: number; y: number; kind: 'farm' | 'buyer'; kg?: number }

/** Project approximate lat/lng to a local km grid centred on the buyer, then normalise to [-1, 1]. */
export function projectNetwork(result: RunResult): { nodes: NetNode[]; pooledOrder: string[] } {
  const b = result.buyer
  if (b.lat == null || b.lng == null) return { nodes: [], pooledOrder: [] }
  const kx = Math.cos((b.lat * Math.PI) / 180) * 111
  const pts = result.allocations.map((a) => ({ id: a.listingId, label: a.area, x: (a.lng - b.lng!) * kx, y: (a.lat - b.lat!) * 111, kind: 'farm' as const, kg: a.quantityKg }))
  const max = Math.max(10, ...pts.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))))
  const nodes: NetNode[] = [{ id: 'buyer', label: b.area, x: 0, y: 0, kind: 'buyer' }, ...pts.map((p) => ({ ...p, x: p.x / max, y: p.y / max }))]
  const stops = result.pooled?.stops ?? []
  const pooledOrder = stops.slice(0, -1).map((name) => pts.find((p) => p.label === name)?.id).filter((x): x is string => !!x)
  return { nodes, pooledOrder: [...pooledOrder, 'buyer'] }
}
