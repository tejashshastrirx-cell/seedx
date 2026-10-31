import type { TFunction } from 'i18next'

type PgLike = { code?: string; message?: string; hint?: string | null; details?: string | null }

const HINTS = ['EMAIL_NOT_VERIFIED', 'ROLE_REQUIRED', 'INSUFFICIENT_STOCK', 'BELOW_MIN_PRICE', 'LISTING_NOT_OPEN', 'OFFER_NOT_OPEN',
  'ILLEGAL_TRANSITION', 'IDEMPOTENCY_CONFLICT', 'ADMIN_AAL2_REQUIRED', 'NOT_PARTY', 'WRONG_ACTOR', 'PRODUCT_NOT_AVAILABLE',
  'OUTSIDE_DELIVERY_AREA', 'STALE_RUN', 'LISTING_CLOSED', 'ROLE_NOT_REQUESTABLE'] as const

/** Map a Supabase/Postgres error to a friendly, translated message. Never shows raw SQL to users. */
export function friendlyError(err: unknown, t: TFunction): string {
  const e = (err ?? {}) as PgLike
  if (e.hint && (HINTS as readonly string[]).includes(e.hint)) return t(`errors.${e.hint}`)
  if (e.code === '42501') return t('errors.permission')
  if (e.code === '23514' || e.code === '22023') return e.message ? `${t('errors.validation')} ${e.message}` : t('errors.validation')
  if (e.code === 'P0002') return t('errors.notFound')
  if (e.code === '40001') return t('errors.INSUFFICIENT_STOCK')
  if ((e as { status?: number }).status === 429) return t('errors.rateLimited')
  if (e.message?.match(/fetch|network/i)) return t('errors.network')
  return t('errors.generic')
}
