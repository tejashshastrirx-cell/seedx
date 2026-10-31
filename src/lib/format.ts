import type { Unit } from '@shared/clustercart'

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

/** Format integer paise as rupees. Money stays integer paise everywhere else. */
export function rupees(paise: number | null | undefined, opts: { whole?: boolean } = {}): string {
  if (paise == null || Number.isNaN(paise)) return '-'
  const r = paise / 100
  return (opts.whole || Number.isInteger(r) ? inr0 : inr).format(r)
}

export function perUnit(paise: number | null | undefined, unit: string): string {
  return paise == null ? '-' : `${rupees(paise)}/${unitShort(unit)}`
}

export function unitShort(unit: string): string {
  return ({ kg: 'kg', quintal: 'q', tonne: 't', g: 'g' } as Record<string, string>)[unit] ?? unit
}

export function qty(n: number | string | null | undefined, unit?: Unit | string): string {
  if (n == null) return '-'
  const v = Number(n)
  const s = v.toLocaleString('en-IN', { maximumFractionDigits: 3 })
  return unit ? `${s} ${unit}` : s
}

export function date(d: string | null | undefined, locale = 'en-IN'): string {
  if (!d) return '-'
  return new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function dateTime(d: string | null | undefined, locale = 'en-IN'): string {
  if (!d) return '-'
  return new Date(d).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function daysAgo(d: string, today = new Date()): number {
  const dt = new Date(d.length === 10 ? `${d}T00:00:00` : d)
  return Math.floor((today.getTime() - dt.getTime()) / 86_400_000)
}

/** Parse a rupee amount typed by a user into integer paise without float drift. */
export function toPaise(input: string | number): number {
  const s = String(input).trim().replace(/[,\s₹]/g, '')
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return NaN
  const [whole, frac = ''] = s.split('.')
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2))
}
