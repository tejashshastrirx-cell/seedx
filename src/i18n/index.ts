import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { resources } from './resources'
import { LANG_CODES, isLangCode, matchLanguage } from './languages'
import { readPrefs } from '@/lib/prefs'
import { setFormatLanguage } from '@/lib/format'

export { resources }

const stored = readPrefs().lang
const initial = isLangCode(stored) ? stored : matchLanguage(typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [])

void i18n.use(initReactI18next).init({
  resources,
  lng: initial,
  fallbackLng: 'en', // any key missing in a language falls back to English, key by key
  supportedLngs: LANG_CODES,
  interpolation: { escapeValue: false }, // React escapes output
  returnNull: false,
})

const setHtmlLang = (lng: string) => {
  const code = isLangCode(lng) ? lng : 'en'
  setFormatLanguage(code)
  if (typeof document !== 'undefined') document.documentElement.lang = code
}
i18n.on('languageChanged', setHtmlLang)
setHtmlLang(initial)

export default i18n
