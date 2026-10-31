import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/app/auth'
import { Button, Notice, TextField } from '@/components/ui'
import { Link } from 'react-router'

/** Step-up to AAL2 with an enrolled TOTP factor. The database checks the aal claim itself. */
export function MfaChallenge() {
  const { t } = useTranslation()
  const { refresh } = useAuth()
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [noFactor, setNoFactor] = useState(false)

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const totp = factors?.totp?.find((f) => f.status === 'verified')
    if (!totp) { setNoFactor(true); setBusy(false); return }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: totp.id, code: code.trim() })
    setBusy(false)
    if (error) { setErr(t('errors.validation')); return }
    await refresh()
  }

  return (
    <form onSubmit={verify} className="card mt-4 grid gap-4 p-5">
      <div><h2 className="text-xl font-bold">{t('auth.mfaTitle')}</h2><p className="text-charcoal-700">{t('auth.mfaLead')}</p></div>
      {noFactor && <Notice tone="warn" title={t('settings.mfaLead')}><Link to="/settings">{t('settings.enrol')}</Link></Notice>}
      <TextField label={t('auth.mfaCode')} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} error={err ?? undefined} required />
      <Button type="submit" loading={busy}>{t('auth.mfaVerify')}</Button>
    </form>
  )
}
