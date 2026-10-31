# SEED X - Languages

SEED X ships ten languages, each in its native script:

| Code | Language | Script | Font (self-hosted, `unicode-range` lazy) |
| --- | --- | --- | --- |
| en | English | Latin | Manrope Variable |
| hi | हिन्दी Hindi | Devanagari | Noto Sans Devanagari |
| bn | বাংলা Bengali | Bengali | Noto Sans Bengali Variable |
| te | తెలుగు Telugu | Telugu | Noto Sans Telugu Variable |
| mr | मराठी Marathi | Devanagari | Noto Sans Devanagari |
| ta | தமிழ் Tamil | Tamil | Noto Sans Tamil Variable |
| gu | ગુજરાતી Gujarati | Gujarati | Noto Sans Gujarati Variable |
| kn | ಕನ್ನಡ Kannada | Kannada | Noto Sans Kannada Variable |
| ml | മലയാളം Malayalam | Malayalam | Noto Sans Malayalam Variable |
| pa | ਪੰਜਾਬੀ Punjabi | Gurmukhi | Noto Sans Gurmukhi Variable |

## How it works
- Strings: `src/i18n/<code>.ts`, collected in `src/i18n/resources.ts`; list and helpers in `src/i18n/languages.ts` (must equal `app_private.supported_languages()` - a unit test enforces the list).
- Fallback: i18next `fallbackLng: 'en'` - any key a language lacks shows English, key by key. Nothing renders as a raw key.
- Choice: header/mobile/Settings language picker shows native names. The choice is stored on the device (`localStorage`, `seedx.prefs.v1`) and, when signed in, in `profiles.preferred_language` (DB check constraint). On a new device the account language is adopted unless the device already has an explicit choice. Signup sends the current language; the server accepts only supported codes.
- First visit: best match from `navigator.languages`, else English. `<html lang>` follows the UI language.
- Formatting: dates use `<lang>-IN` month names with Latin digits (`-u-nu-latn`); money (₹, Indian grouping) and quantities use `en-IN` so numbers read identically in every language.
- Data: crop and category names are translated in the database (`names` jsonb, all ten languages for every active crop - enforced by pgTAP and an E2E REST check). Admins edit them at `/admin/catalogue`.
- Server-generated notification titles are English (stored text); their category chips are translated.

## Coverage (see `docs/i18n-coverage.md` for the generated report)
- English 100%, Hindi ~94% (admin screens remain English).
- bn/te/mr/ta/gu/kn/ml/pa: ~44% of all keys, **100% of the core journeys**: brand, navigation, common UI, errors, home, sign-in/sign-up/verification/reset/MFA, onboarding, dashboard + role command centres, notifications + preferences, My Clients/My Suppliers, marketplace filters/sorting/saved searches, footer, 404, settings language. Remaining screens (listing forms, offers, orders detail, seeds, prices, schemes, help, admin) fall back to English.

## Quality status - human review required
All non-English text (including Hindi) is **machine-assisted** and has **not been reviewed by native speakers**. Before production:
1. Have a native speaker per language review `src/i18n/<code>.ts` and the crop/category `names` in the database.
2. Prioritise legal/money wording (offers, orders, payments notes) and error messages.
3. Re-run `npx tsx scripts/i18n-coverage.ts` and `npm test` after edits; the tests check script, placeholders and core coverage.

## Adding or editing a translation
Edit the language file (typed against English, so unknown keys fail `tsc`), keep `{{placeholders}}` identical, run `npm test`. To add a crop name, use `/admin/catalogue` (MFA admin) - no deploy needed.
