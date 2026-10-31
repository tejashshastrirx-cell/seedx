import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MailCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/app/auth'
import { Button, Notice, PageLoader, TextField } from '@/components/ui'
import { LogoMark } from '@/components/Logo'

const redirectTo = (path: string) => `${window.location.origin}${path}`

/** Only allow same-site relative redirects after login (prevents open redirects). */
function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'
}

function AuthCard({ title, lead, children, footer }: { title: string; lead?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="card p-6 sm:p-8">
        <LogoMark className="mb-5 size-12" />
        <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
        {lead && <p className="mt-2 text-charcoal-700">{lead}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <p className="mt-5 text-center text-sm text-charcoal-700">{footer}</p>}
    </div>
  )
}

export function LoginPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to={safeNext(params.get('next'))} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) {
      // Same message for unknown email and wrong password (no account enumeration).
      setErr(error.status === 429 ? t('errors.rateLimited') : error.message.match(/not confirmed/i) ? t('errors.EMAIL_NOT_VERIFIED') : t('auth.invalidCredentials'))
      return
    }
    nav(safeNext(params.get('next')), { replace: true })
  }

  return (
    <AuthCard title={t('auth.loginTitle')} lead={t('auth.loginLead')}
      footer={<>{t('auth.noAccount')} <Link to="/signup" className="font-bold">{t('nav.signup')}</Link></>}>
      <form onSubmit={submit} className="grid gap-4" noValidate>
        {err && <Notice tone="danger" title={err} />}
        <TextField label={t('auth.email')} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <TextField label={t('auth.password')} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Button type="submit" loading={busy}>{t('auth.loginCta')}</Button>
        <Link to="/forgot-password" className="text-center text-sm font-semibold">{t('auth.forgot')}</Link>
      </form>
    </AuthCard>
  )
}

export function SignupPage() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [serverErr, setServerErr] = useState<string | null>(null)
  const schema = z.object({
    displayName: z.string().trim().min(2).max(80),
    email: z.string().trim().email(),
    password: z.string().min(10).max(72),
    confirm: z.string(),
  }).refine((v) => v.password === v.confirm, { path: ['confirm'], message: t('auth.passwordsDiffer') })
  type F = z.infer<typeof schema>
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<F>({ resolver: zodResolver(schema) })
  if (user && !sentTo) return <Navigate to="/dashboard" replace />
  if (sentTo) return <CheckEmail email={sentTo} />

  const onSubmit = async (v: F) => {
    setServerErr(null)
    const { error } = await supabase.auth.signUp({
      email: v.email,
      password: v.password,
      // Only cosmetic metadata. Roles are NEVER taken from signup metadata.
      options: { emailRedirectTo: redirectTo('/auth/callback?next=/dashboard'), data: { display_name: v.displayName, preferred_language: i18n.language === 'hi' ? 'hi' : 'en' } },
    })
    if (error) { setServerErr(error.status === 429 ? t('errors.rateLimited') : error.message); return }
    setSentTo(v.email)
  }

  return (
    <AuthCard title={t('auth.signupTitle')} lead={t('auth.signupLead')}
      footer={<>{t('auth.haveAccount')} <Link to="/login" className="font-bold">{t('nav.login')}</Link></>}>
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        {serverErr && <Notice tone="danger" title={serverErr} />}
        <TextField label={t('auth.name')} hint={t('auth.nameHint')} autoComplete="name" {...register('displayName')} error={errors.displayName && t('errors.validation')} />
        <TextField label={t('auth.email')} type="email" autoComplete="email" {...register('email')} error={errors.email && t('errors.validation')} />
        <TextField label={t('auth.password')} type="password" autoComplete="new-password" hint={t('auth.passwordHint')} {...register('password')} error={errors.password && t('auth.passwordHint')} />
        <TextField label={t('auth.confirmPassword')} type="password" autoComplete="new-password" {...register('confirm')} error={errors.confirm?.message} />
        <Button type="submit" loading={isSubmitting}>{t('auth.signupCta')}</Button>
      </form>
    </AuthCard>
  )
}

function ResendButton({ email }: { email: string }) {
  const { t } = useTranslation()
  const [wait, setWait] = useState(0)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    if (!wait) return
    const id = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(id)
  }, [wait])
  return (
    <div className="grid gap-2">
      <Button variant="secondary" disabled={wait > 0} onClick={async () => {
        const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo('/auth/callback?next=/dashboard') } })
        setMsg(error?.status === 429 ? t('errors.rateLimited') : t('auth.resent'))
        setWait(60)
      }}>{wait > 0 ? t('auth.resendWait', { s: wait }) : t('auth.resend')}</Button>
      {msg && <p className="text-sm text-charcoal-700" role="status">{msg}</p>}
    </div>
  )
}

function CheckEmail({ email }: { email: string }) {
  const { t } = useTranslation()
  return (
    <AuthCard title={t('auth.checkEmailTitle')}>
      <div className="grid gap-4">
        <div className="flex gap-3 rounded-2xl bg-forest-50 p-4"><MailCheck aria-hidden className="size-6 shrink-0 text-forest-700" /><p>{t('auth.checkEmail', { email })}</p></div>
        <ResendButton email={email} />
      </div>
    </AuthCard>
  )
}

export function VerifyEmailPage() {
  const { t } = useTranslation()
  const { user, emailVerified, refresh } = useAuth()
  if (!user) return <Navigate to="/login?next=/verify-email" replace />
  return (
    <AuthCard title={t('auth.verifyTitle')} lead={t('auth.verifyLead')}>
      {emailVerified ? (
        <div className="grid gap-4"><Notice tone="success" title={t('auth.verified')} /><Link to="/dashboard" className="font-bold">{t('nav.dashboard')}</Link></div>
      ) : (
        <div className="grid gap-4">
          <p>{t('auth.checkEmail', { email: user.email })}</p>
          <ResendButton email={user.email ?? ''} />
          <Button variant="ghost" onClick={() => refresh()}>{t('common.retry')}</Button>
        </div>
      )}
    </AuthCard>
  )
}

export function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <AuthCard title={t('auth.forgotTitle')} lead={t('auth.forgotLead')}>
      {done ? <Notice tone="success" title={t('auth.resetSent')} /> : (
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true)
          await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectTo('/auth/callback?next=/reset-password') })
          setBusy(false); setDone(true) // same response whether or not the account exists
        }}>
          <TextField label={t('auth.email')} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Button type="submit" loading={busy}>{t('auth.sendReset')}</Button>
        </form>
      )}
    </AuthCard>
  )
}

export function ResetPasswordPage() {
  const { t } = useTranslation()
  const { user, ready } = useAuth()
  const nav = useNavigate()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!ready) return <PageLoader />
  if (!user) return <AuthCard title={t('auth.resetTitle')}><Notice tone="danger" title={t('auth.callbackFailed')} /><Link to="/forgot-password" className="mt-4 block font-bold">{t('auth.forgotTitle')}</Link></AuthCard>
  return (
    <AuthCard title={t('auth.resetTitle')}>
      <form className="grid gap-4" onSubmit={async (e) => {
        e.preventDefault()
        if (pw.length < 10) { setErr(t('auth.passwordHint')); return }
        if (pw !== pw2) { setErr(t('auth.passwordsDiffer')); return }
        setBusy(true)
        const { error } = await supabase.auth.updateUser({ password: pw })
        setBusy(false)
        if (error) { setErr(error.message); return }
        nav('/dashboard', { replace: true })
      }}>
        {err && <Notice tone="danger" title={err} />}
        <TextField label={t('auth.password')} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} hint={t('auth.passwordHint')} />
        <TextField label={t('auth.confirmPassword')} type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        <Button type="submit" loading={busy}>{t('auth.resetCta')}</Button>
      </form>
    </AuthCard>
  )
}

/** PKCE callback for email confirmation and password recovery links. */
export function AuthCallbackPage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { refresh } = useAuth()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const code = params.get('code')
    const next = safeNext(params.get('next'))
    if (params.get('error')) { setFailed(true); return }
    if (!code) { nav(next, { replace: true }); return }
    supabase.auth.exchangeCodeForSession(code).then(async ({ error }) => {
      if (error) { setFailed(true); return }
      await refresh()
      nav(next, { replace: true })
    })
  }, [params, nav, refresh])
  if (failed) return <AuthCard title={t('auth.verifyTitle')}><Notice tone="danger" title={t('auth.callbackFailed')} /><Link to="/login" className="mt-4 block font-bold">{t('nav.login')}</Link></AuthCard>
  return <PageLoader label={t('auth.callbackWorking')} />
}
