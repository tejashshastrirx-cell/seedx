import { describe, expect, it } from 'vitest'
import i18next from 'i18next'
import { resources } from '@/i18n/resources'
import { LANGUAGES, LANG_CODES, SCRIPT_RANGES, matchLanguage } from '@/i18n/languages'

type Tree = { [k: string]: string | Tree }
const flatten = (o: Tree, p = ''): Record<string, string> =>
  Object.entries(o).reduce<Record<string, string>>((acc, [k, v]) => {
    const key = p ? `${p}.${k}` : k
    return typeof v === 'string' ? { ...acc, [key]: v } : { ...acc, ...flatten(v, key) }
  }, {})
const en = flatten(resources.en.translation as unknown as Tree)
const res = resources as unknown as Record<string, { translation: Tree }>
// Core journeys every language must fully cover (the rest may fall back to English).
const CORE = ['brand', 'nav', 'common', 'home', 'auth', 'onboarding', 'dashboard', 'notifications', 'notFound', 'lang', 'centre', 'contacts', 'notif', 'market']
const placeholders = (s: string) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort()

describe('ten languages', () => {
  it('ships exactly the ten supported languages, matching the database list', () => {
    // Must equal app_private.supported_languages() in supabase/migrations/20261031130000_*.sql
    expect(LANG_CODES).toEqual(['en', 'hi', 'bn', 'te', 'mr', 'ta', 'gu', 'kn', 'ml', 'pa'])
    expect(Object.keys(resources).sort()).toEqual([...LANG_CODES].sort())
  })

  for (const l of LANGUAGES) {
    describe(`${l.english} (${l.code})`, () => {
      const flat = flatten(res[l.code].translation)
      it('fully covers the core journeys', () => {
        const missing = Object.keys(en).filter((k) => CORE.includes(k.split('.')[0]) && en[k] !== '' && !flat[k]?.trim())
        expect(missing).toEqual([])
      })
      it('has no keys that English lacks and no empty strings', () => {
        expect(Object.keys(flat).filter((k) => !(k in en))).toEqual([])
        expect(Object.entries(flat).filter(([k, v]) => !v.trim() && en[k] !== '').map(([k]) => k)).toEqual([])
      })
      it('keeps every interpolation placeholder', () => {
        const broken = Object.entries(flat).filter(([k, v]) => JSON.stringify(placeholders(v)) !== JSON.stringify(placeholders(en[k])))
        expect(broken.map(([k]) => k)).toEqual([])
      })
      it(`is written in ${l.script} script`, () => {
        const re = SCRIPT_RANGES[l.script]
        for (const k of ['nav.marketplace', 'home.title', 'auth.loginCta', 'common.save', 'notif.preferences', 'contacts.clientsTitle']) {
          expect(re.test(flat[k]), `${l.code}:${k} = ${flat[k]}`).toBe(true)
        }
      })
    })
  }

  it('falls back to English for a key a language does not define', async () => {
    const inst = i18next.createInstance()
    await inst.init({ resources, lng: 'ta', fallbackLng: 'en', interpolation: { escapeValue: false } })
    expect(inst.t('admin.audit')).toBe(en['admin.audit'])
    expect(inst.t('nav.marketplace')).toBe(flatten(res.ta.translation)['nav.marketplace'])
    await inst.changeLanguage('xx')
    expect(inst.t('nav.home')).toBe(en['nav.home'])
  })

  it('matches browser languages to a supported language', () => {
    expect(matchLanguage(['ta-IN', 'en'])).toBe('ta')
    expect(matchLanguage(['pa-Guru-IN'])).toBe('pa')
    expect(matchLanguage(['fr-FR', 'de'])).toBe('en')
    expect(matchLanguage(undefined)).toBe('en')
  })
})
