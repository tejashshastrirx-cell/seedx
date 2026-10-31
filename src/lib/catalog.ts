import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from './supabase'
import type { Tables } from '@/types/database'

type NameMap = Partial<Record<string, string>>
/** Localised name from a DB translation map, falling back to English. */
export function localName(names: unknown, lang: string, fallback = ''): string {
  const m = (names && typeof names === 'object' ? names : {}) as NameMap
  return m[lang] || m[lang.split('-')[0]] || m.en || fallback
}
export function commodityName(c: Pick<Tables<'commodities'>, 'names' | 'name_en'>, lang: string) {
  return localName(c.names, lang, c.name_en)
}

export function useCropCategories() {
  return useQuery({
    queryKey: ['catalog', 'categories'],
    staleTime: 3_600_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('crop_categories').select('*').order('sort_order')
      if (error) throw error
      return data
    },
  })
}

export function useCommodities() {
  return useQuery({
    queryKey: ['catalog', 'commodities'],
    staleTime: 3_600_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('commodities').select('*').order('sort_order').order('name_en')
      if (error) throw error
      return data
    },
  })
}

export function useVarieties() {
  return useQuery({
    queryKey: ['catalog', 'varieties'],
    staleTime: 3_600_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('crop_varieties').select('*').order('name_en')
      if (error) throw error
      return data
    },
  })
}

export function useCommodityName() {
  const { i18n } = useTranslation()
  const { data } = useCommodities()
  return (id: number | null | undefined) => {
    const c = data?.find((x) => x.id === id)
    if (!c) return ''
    return commodityName(c, i18n.language)
  }
}

export function commodityLabel(c: Tables<'commodities'>, lang: string) {
  const local = commodityName(c, lang)
  const en = localName(c.names, 'en', c.name_en)
  return lang === 'en' || local === en ? en : `${local} (${en})`
}

export const INDIAN_STATES = ['Andhra Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Odisha', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal']

/** Approximate district centroids for demo-region geocoding (public, coarse). Extend or replace with a geocoder. */
export const DISTRICT_CENTROIDS: Record<string, [number, number]> = {
  Bhopal: [23.26, 77.41], Sehore: [23.2, 77.08], Vidisha: [23.52, 77.81], Raisen: [23.33, 77.79], Indore: [22.72, 75.86],
  Hoshangabad: [22.75, 77.72], Narmadapuram: [22.75, 77.72], Ujjain: [23.18, 75.78], Dewas: [22.97, 76.05], Rajgarh: [24.0, 76.73],
  Jabalpur: [23.18, 79.95], Gwalior: [26.22, 78.18], Sagar: [23.84, 78.74], Nagpur: [21.15, 79.09], Pune: [18.52, 73.86], Nashik: [20.0, 73.79],
  Jaipur: [26.91, 75.79], Lucknow: [26.85, 80.95], Ludhiana: [30.9, 75.85], Patna: [25.59, 85.14],
}
