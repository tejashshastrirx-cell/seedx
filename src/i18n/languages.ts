// The ten supported languages. Must match app_private.supported_languages() in the database.
export const LANGUAGES = [
  { code: 'en', native: 'English', english: 'English', script: 'Latin' },
  { code: 'hi', native: 'हिन्दी', english: 'Hindi', script: 'Devanagari' },
  { code: 'bn', native: 'বাংলা', english: 'Bengali', script: 'Bengali' },
  { code: 'te', native: 'తెలుగు', english: 'Telugu', script: 'Telugu' },
  { code: 'mr', native: 'मराठी', english: 'Marathi', script: 'Devanagari' },
  { code: 'ta', native: 'தமிழ்', english: 'Tamil', script: 'Tamil' },
  { code: 'gu', native: 'ગુજરાતી', english: 'Gujarati', script: 'Gujarati' },
  { code: 'kn', native: 'ಕನ್ನಡ', english: 'Kannada', script: 'Kannada' },
  { code: 'ml', native: 'മലയാളം', english: 'Malayalam', script: 'Malayalam' },
  { code: 'pa', native: 'ਪੰਜਾਬੀ', english: 'Punjabi', script: 'Gurmukhi' },
] as const

export type LangCode = (typeof LANGUAGES)[number]['code']
export const LANG_CODES = LANGUAGES.map((l) => l.code) as LangCode[]
export function isLangCode(v: unknown): v is LangCode {
  return typeof v === 'string' && (LANG_CODES as string[]).includes(v)
}
/** Best supported match for a browser language tag list, else English. */
export function matchLanguage(tags: readonly string[] | undefined): LangCode {
  for (const tag of tags ?? []) {
    const base = tag.toLowerCase().split('-')[0]
    if (isLangCode(base)) return base
  }
  return 'en'
}
/** Unicode ranges used to verify that a translation is actually in the expected script. */
export const SCRIPT_RANGES: Record<string, RegExp> = {
  Latin: /[A-Za-z]/, Devanagari: /[ऀ-ॿ]/, Bengali: /[ঀ-৿]/, Gurmukhi: /[਀-੿]/,
  Gujarati: /[઀-૿]/, Tamil: /[஀-௿]/, Telugu: /[ఀ-౿]/, Kannada: /[ಀ-೿]/, Malayalam: /[ഀ-ൿ]/,
}
