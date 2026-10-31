import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from './auth'
import { PageLoader } from '@/components/ui'
import { Notice } from '@/components/ui'
import { MfaChallenge } from '@/features/auth/MfaChallenge'

/** UX guard only. Every protected operation is enforced again by RLS / RPC checks in Postgres. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { ready, user } = useAuth()
  const loc = useLocation()
  if (!ready) return <PageLoader />
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  return <>{children}</>
}

export function RequireRole({ role, children }: { role: string; children: ReactNode }) {
  const { hasRole } = useAuth()
  const { t } = useTranslation()
  if (!hasRole(role)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Notice tone="warn" icon={<ShieldAlert aria-hidden className="size-5" />} title={t('errors.ROLE_REQUIRED')}>
          <a href="/dashboard" className="font-semibold">{t('onboarding.title')}</a>
        </Notice>
      </div>
    )
  }
  return <>{children}</>
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { hasRole, aal } = useAuth()
  const { t } = useTranslation()
  if (!hasRole('admin') && !hasRole('support')) {
    return <div className="mx-auto max-w-2xl px-4 py-10"><Notice tone="danger" title={t('errors.permission')} /></div>
  }
  if (aal !== 'aal2') return <div className="mx-auto max-w-md px-4 py-10"><Notice tone="info" title={t('admin.mfaRequired')} /><MfaChallenge /></div>
  return <>{children}</>
}
