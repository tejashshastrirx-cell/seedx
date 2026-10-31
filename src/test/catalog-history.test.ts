import { describe, expect, it } from 'vitest'
import { commodityLabel, commodityName, localName } from '@/lib/catalog'
import { MAX_RECENT, clearRecent, pushRecent, readRecent } from '@/lib/searchHistory'

describe('catalogue names', () => {
  const tomato = { names: { en: 'Tomato', hi: 'टमाटर', ta: 'தக்காளி' }, name_en: 'Tomato' } as never
  it('uses the requested language, then English, then the legacy column', () => {
    expect(commodityName(tomato, 'ta')).toBe('தக்காளி')
    expect(commodityName(tomato, 'ml')).toBe('Tomato')
    expect(localName(null, 'hi', 'Fallback')).toBe('Fallback')
    expect(localName({ en: 'Wheat' }, 'en-IN')).toBe('Wheat')
  })
  it('bilingual label adds English only when it differs', () => {
    expect(commodityLabel(tomato, 'hi')).toBe('टमाटर (Tomato)')
    expect(commodityLabel(tomato, 'en')).toBe('Tomato')
  })
})

describe('on-device search history', () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } }
  it('dedupes case-insensitively, keeps newest first and caps the list', () => {
    const s = mem()
    pushRecent('wheat', s); pushRecent('Tomato', s); pushRecent('WHEAT', s)
    expect(readRecent(s)).toEqual(['WHEAT', 'Tomato'])
    for (let i = 0; i < 20; i++) pushRecent(`q${i}`, s)
    expect(readRecent(s)).toHaveLength(MAX_RECENT)
    clearRecent(s)
    expect(readRecent(s)).toEqual([])
  })
  it('survives corrupt or unavailable storage', () => {
    expect(readRecent({ getItem: () => '{not json' })).toEqual([])
    expect(readRecent({ getItem: () => { throw new Error('blocked') } })).toEqual([])
    expect(pushRecent('x', { getItem: () => null, setItem: () => { throw new Error('quota') } })).toEqual(['x']) // list still returned; persistence skipped
    expect(pushRecent('   ', mem())).toEqual([])
  })
})
