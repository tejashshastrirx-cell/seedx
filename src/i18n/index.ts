import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en'
import hi from './hi'
import { readPrefs } from '@/lib/prefs'

const initial = readPrefs().lang ?? (typeof navigator !== 'undefined' && navigator.language?.startsWith('hi') ? 'hi' : 'en')

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi } },
  lng: initial,
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React escapes output
  returnNull: false,
})

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng === 'hi' ? 'hi' : 'en'
})
document.documentElement.lang = initial

export default i18n
