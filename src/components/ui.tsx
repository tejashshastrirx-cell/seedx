import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold'
const variants: Record<Variant, string> = {
  primary: 'bg-forest-700 text-white hover:bg-forest-800 shadow-sm',
  secondary: 'bg-white text-forest-800 border border-forest-200 hover:border-forest-400 hover:bg-forest-50',
  ghost: 'text-forest-800 hover:bg-forest-100',
  danger: 'bg-white text-danger-600 border border-danger-600/30 hover:bg-danger-50',
  gold: 'bg-gold-400 text-forest-900 hover:bg-gold-300 shadow-sm',
}
const base = 'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.97] disabled:opacity-55 disabled:cursor-not-allowed no-underline'
const sizes = { md: 'min-h-12 px-5 text-base', sm: 'min-h-10 px-3.5 text-sm', lg: 'min-h-14 px-7 text-lg' }

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof sizes; loading?: boolean }>(
  function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }, ref) {
    return (
      <button ref={ref} className={cx(base, variants[variant], sizes[size], className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
        {loading && <Loader2 aria-hidden className="size-4 animate-spin" />}
        {children}
      </button>
    )
  },
)

export function LinkButton({ variant = 'primary', size = 'md', className, ...rest }: LinkProps & { variant?: Variant; size?: keyof typeof sizes }) {
  return <Link className={cx(base, variants[variant], sizes[size], className)} {...rest} />
}

export function Card({ className, children, as: As = 'div' }: { className?: string; children: ReactNode; as?: 'div' | 'section' | 'article' | 'li' }) {
  return <As className={cx('card', className)}>{children}</As>
}

const badgeTones = {
  green: 'bg-forest-100 text-forest-800', gold: 'bg-gold-100 text-gold-600', grey: 'bg-cream-200 text-charcoal-700',
  red: 'bg-danger-50 text-danger-600', blue: 'bg-info-50 text-info-700', amber: 'bg-warn-50 text-warn-700',
}
export function Badge({ tone = 'grey', children, className }: { tone?: keyof typeof badgeTones; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold', badgeTones[tone], className)}>{children}</span>
}

export function DemoBadge({ show = true }: { show?: boolean | null }) {
  const { t } = useTranslation()
  if (!show) return null
  return <Badge tone="amber">{t('common.demo')}</Badge>
}

const statusTone: Record<string, keyof typeof badgeTones> = {
  published: 'green', partially_reserved: 'gold', reserved: 'gold', sold: 'grey', paused: 'amber', draft: 'grey', withdrawn: 'red', expired: 'red',
  submitted: 'blue', countered: 'gold', accepted: 'green', rejected: 'red',
  confirmed: 'blue', pickup_scheduled: 'gold', in_transit: 'gold', delivered: 'green', completed: 'green', cancelled: 'red', disputed: 'red',
  open: 'green', partially_filled: 'gold', filled: 'grey', pending: 'blue', packed: 'gold', dispatched: 'gold', active: 'green', requested: 'blue', revoked: 'red',
}
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={statusTone[status] ?? 'grey'}>{label ?? status.replace(/_/g, ' ')}</Badge>
}

const noticeTones = {
  info: { c: 'bg-info-50 border-info-700/20 text-info-700', I: Info },
  warn: { c: 'bg-warn-50 border-warn-700/25 text-warn-700', I: AlertTriangle },
  danger: { c: 'bg-danger-50 border-danger-600/25 text-danger-600', I: XCircle },
  success: { c: 'bg-forest-100 border-forest-400/30 text-forest-800', I: CheckCircle2 },
}
export function Notice({ tone = 'info', title, children, icon }: { tone?: keyof typeof noticeTones; title: ReactNode; children?: ReactNode; icon?: ReactNode }) {
  const T = noticeTones[tone]
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('flex gap-3 rounded-2xl border p-4', T.c)}>
      <span className="mt-0.5 shrink-0">{icon ?? <T.I aria-hidden className="size-5" />}</span>
      <div className="min-w-0 text-sm"><p className="font-bold">{title}</p>{children && <div className="mt-1 text-charcoal-700">{children}</div>}</div>
    </div>
  )
}

export function PageHeader({ eyebrow, title, lead, actions }: { eyebrow?: string; title: string; lead?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-3xl font-extrabold sm:text-4xl">{title}</h1>
        {lead && <p className="mt-2 text-base text-charcoal-700 sm:text-lg">{lead}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-forest-100 text-forest-700">{icon}</div>}
      <h2 className="text-xl font-bold">{title}</h2>
      {body && <p className="mt-2 max-w-md text-charcoal-700">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation()
  return (
    <Notice tone="danger" title={message}>
      {onRetry && <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry}>{t('common.retry')}</Button>}
    </Notice>
  )
}

export function PageLoader({ label }: { label?: string }) {
  const { t } = useTranslation()
  return (
    <div className="grid min-h-[40vh] place-items-center" role="status" aria-live="polite">
      <div className="flex items-center gap-3 text-forest-700"><Loader2 aria-hidden className="size-6 animate-spin" /><span className="font-semibold">{label ?? t('common.loading')}</span></div>
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx('animate-pulse rounded-xl bg-forest-100/70', className)} />
}

type FieldProps = { label: string; hint?: string; error?: string; optional?: boolean; className?: string }
function useFieldIds() {
  const id = useId()
  return { id, hintId: `${id}-hint`, errId: `${id}-err` }
}
function FieldShell({ id, hintId, errId, label, hint, error, optional, className, children }: FieldProps & { id: string; hintId: string; errId: string; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">{label}{optional && <span className="ml-1 font-normal text-charcoal-500">({t('common.optional')})</span>}</label>
      {children}
      {hint && !error && <p id={hintId} className="field-hint">{hint}</p>}
      {error && <p id={errId} className="field-error" role="alert">{error}</p>}
    </div>
  )
}

export const TextField = forwardRef<HTMLInputElement, FieldProps & InputHTMLAttributes<HTMLInputElement>>(function TextField({ label, hint, error, optional, className, ...rest }, ref) {
  const ids = useFieldIds()
  return (
    <FieldShell {...ids} label={label} hint={hint} error={error} optional={optional} className={className}>
      <input ref={ref} id={ids.id} className="field-input" aria-invalid={!!error || undefined} aria-describedby={error ? ids.errId : hint ? ids.hintId : undefined} {...rest} />
    </FieldShell>
  )
})

export const SelectField = forwardRef<HTMLSelectElement, FieldProps & SelectHTMLAttributes<HTMLSelectElement>>(function SelectField({ label, hint, error, optional, className, children, ...rest }, ref) {
  const ids = useFieldIds()
  return (
    <FieldShell {...ids} label={label} hint={hint} error={error} optional={optional} className={className}>
      <select ref={ref} id={ids.id} className="field-input appearance-none bg-[length:1rem] bg-[right_0.9rem_center] bg-no-repeat pr-10"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23174B35' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
        aria-invalid={!!error || undefined} aria-describedby={error ? ids.errId : hint ? ids.hintId : undefined} {...rest}>
        {children}
      </select>
    </FieldShell>
  )
})

export const TextAreaField = forwardRef<HTMLTextAreaElement, FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextAreaField({ label, hint, error, optional, className, ...rest }, ref) {
  const ids = useFieldIds()
  return (
    <FieldShell {...ids} label={label} hint={hint} error={error} optional={optional} className={className}>
      <textarea ref={ref} id={ids.id} rows={3} className="field-input py-3" aria-invalid={!!error || undefined} aria-describedby={error ? ids.errId : hint ? ids.hintId : undefined} {...rest} />
    </FieldShell>
  )
})

/** Accessible bottom sheet on phones, centred dialog on larger screens (native <dialog>). */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const { t } = useTranslation()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose} aria-label={title}
      className="m-0 mt-auto w-full max-w-none rounded-t-3xl bg-white p-0 text-charcoal-900 backdrop:bg-forest-900/45 sm:m-auto sm:max-w-lg sm:rounded-3xl">
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-center justify-between border-b border-forest-100 px-5 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-xl hover:bg-forest-50" aria-label={t('common.close')}><X aria-hidden className="size-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex gap-3 border-t border-forest-100 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </dialog>
  )
}

export function Stat({ label, value, hint, tone = 'default' }: { label: string; value: ReactNode; hint?: string; tone?: 'default' | 'gold' }) {
  return (
    <div className={cx('rounded-2xl p-4', tone === 'gold' ? 'bg-gold-100' : 'bg-forest-50')}>
      <p className="text-sm font-semibold text-charcoal-700">{label}</p>
      <p className="tabular mt-1 text-2xl font-extrabold text-forest-800">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-charcoal-500">{hint}</p>}
    </div>
  )
}

export function Pager({ page, hasMore, onPage }: { page: number; hasMore: boolean; onPage: (p: number) => void }) {
  const { t } = useTranslation()
  if (page === 0 && !hasMore) return null
  return (
    <nav className="mt-6 flex items-center justify-center gap-3" aria-label="pagination">
      <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => onPage(page - 1)}>{t('common.previous')}</Button>
      <span className="text-sm font-semibold">{t('common.page', { n: page + 1 })}</span>
      <Button variant="secondary" size="sm" disabled={!hasMore} onClick={() => onPage(page + 1)}>{t('common.next')}</Button>
    </nav>
  )
}
