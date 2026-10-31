import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Database, ExternalLink, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { date } from '@/lib/format'
import { Badge } from '@/components/ui'
import { Reveal } from '@/components/motion'

/** Real data-source registry with status and the freshest record date - no invented numbers. */
export function TrustSources() {
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: ['trust-sources'],
    queryFn: async () => {
      const { data: sources } = await supabase.from('data_sources').select('id,code,name,publisher,official_url,price_type,status,expected_cadence')
      const latest = await Promise.all((sources ?? []).map(async (s) => {
        const { data } = await supabase.from('market_price_observations').select('observed_on,is_sample,verification_status').eq('source_id', s.id).order('observed_on', { ascending: false }).limit(1)
        return { ...s, latest: data?.[0] ?? null }
      }))
      return latest
    },
  })
  return (
    <section id="trust" aria-labelledby="trust-title" className="mt-20">
      <Reveal>
        <p className="eyebrow">{t('footer.sources')}</p>
        <h2 id="trust-title" className="mt-2 text-3xl font-extrabold sm:text-4xl">{t('hero.trustTitle')}</h2>
        <p className="mt-2 max-w-2xl text-charcoal-700">{t('hero.trustLead')}</p>
      </Reveal>
      <ul className="mt-6 grid gap-4 md:grid-cols-3">
        {(q.data ?? []).map((s) => (
          <li key={s.id} className="card flex flex-col p-5">
            <div className="flex items-center gap-2">
              <Database aria-hidden className="size-5 text-forest-600" />
              <Badge tone={s.status === 'active' ? 'green' : 'blue'}>{t(`hero.status_${s.status}`)}</Badge>
              {s.latest?.is_sample && <Badge tone="amber">SAMPLE</Badge>}
              {s.latest?.verification_status === 'verification_pending' && <Badge tone="blue">{t('common.verificationPending')}</Badge>}
            </div>
            <h3 className="mt-3 font-extrabold text-forest-800">{s.name}</h3>
            <p className="text-sm text-charcoal-700">{s.publisher}</p>
            <p className="mt-2 text-sm"><span className="text-charcoal-500">{t('prices.type')}:</span> {t(`prices.${s.price_type}`, { defaultValue: s.price_type })} · {s.expected_cadence}</p>
            <p className="text-sm"><span className="text-charcoal-500">{t('hero.lastRow')}:</span> {s.latest ? date(s.latest.observed_on) : t('hero.noRows')}</p>
            <a href={s.official_url} target="_blank" rel="noreferrer" className="mt-auto inline-flex items-center gap-1 pt-3 text-sm font-bold">{new URL(s.official_url).hostname}<ExternalLink aria-hidden className="size-3.5" /></a>
          </li>
        ))}
      </ul>
      <p className="mt-4 flex items-center gap-2 text-sm text-charcoal-700"><ShieldCheck aria-hidden className="size-4 text-forest-600" />{t('schemes.disclaimer')}</p>
    </section>
  )
}
