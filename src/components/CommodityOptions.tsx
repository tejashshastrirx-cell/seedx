import { useTranslation } from 'react-i18next'
import { commodityLabel, localName, useCommodities, useCropCategories } from '@/lib/catalog'

/** <option>s for crop pickers, grouped by category, localised, active crops only (plus the current value). */
export function CommodityOptions({ current, bilingual = false }: { current?: number | string | null; bilingual?: boolean }) {
  const { i18n } = useTranslation()
  const lang = i18n.language
  const commodities = useCommodities()
  const categories = useCropCategories()
  const rows = (commodities.data ?? []).filter((c) => c.is_active || String(c.id) === String(current ?? ''))
  const cats = categories.data ?? []
  const label = (c: (typeof rows)[number]) => (bilingual ? commodityLabel(c, lang) : localName(c.names, lang, c.name_en))
  if (!cats.length) return <>{rows.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}</>
  return (
    <>
      {cats.map((cat) => {
        const items = rows.filter((c) => c.category === cat.code)
        if (!items.length) return null
        return (
          <optgroup key={cat.code} label={localName(cat.names, lang, cat.code)}>
            {items.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}
          </optgroup>
        )
      })}
    </>
  )
}
