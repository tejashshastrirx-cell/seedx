// On-device recent searches (never sent to the server). Bounded, de-duplicated, storage-failure tolerant.
const KEY = 'seedx.recentSearches.v1'
export const MAX_RECENT = 10

export function readRecent(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): string[] {
  try {
    const v = JSON.parse(storage?.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENT) : []
  } catch { return [] }
}

export function pushRecent(term: string, storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = globalThis.localStorage): string[] {
  const clean = term.trim().slice(0, 80)
  if (!clean) return readRecent(storage)
  const next = [clean, ...readRecent(storage).filter((x) => x.toLowerCase() !== clean.toLowerCase())].slice(0, MAX_RECENT)
  try { storage?.setItem(KEY, JSON.stringify(next)) } catch { /* storage unavailable */ }
  return next
}

export function clearRecent(storage: Pick<Storage, 'removeItem'> | undefined = globalThis.localStorage) {
  try { storage?.removeItem(KEY) } catch { /* storage unavailable */ }
}
