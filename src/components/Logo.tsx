import { cx } from './ui'

/** SEED X mark: a seed with a sprout at the centre of an X of four connected route nodes. */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <rect width="64" height="64" rx="16" fill="#174B35" />
      <path d="M15 15 L49 49 M49 15 L15 49" stroke="#E5A63B" strokeWidth="4.5" strokeLinecap="round" />
      <g fill="#F5F0E4" stroke="#E5A63B" strokeWidth="2.5">
        <circle cx="15" cy="15" r="4.5" /><circle cx="49" cy="15" r="4.5" /><circle cx="15" cy="49" r="4.5" /><circle cx="49" cy="49" r="4.5" />
      </g>
      <path d="M32 17 C40.5 25 43 31.5 43 37.5 A11 11 0 0 1 21 37.5 C21 31.5 23.5 25 32 17 Z" fill="#F5F0E4" stroke="#174B35" strokeWidth="2" />
      <path d="M32 45 V31" stroke="#174B35" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M32 37.5 C27.6 37.5 25 34.8 25 31 C29.2 31 32 33.6 32 37.5 Z M32 34 C32 29.8 34.8 27 39 27 C39 31 36.2 34 32 34 Z" fill="#2A6A48" />
    </svg>
  )
}

export function Logo({ className, inverted = false, showTagline = false }: { className?: string; inverted?: boolean; showTagline?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-2.5', className)}>
      <LogoMark className="size-9 shrink-0" />
      <span className="flex flex-col leading-none">
        <span className={cx('whitespace-nowrap text-xl font-extrabold tracking-[0.06em]', inverted ? 'text-cream-100' : 'text-forest-800')}>
          SEED <span className="text-gold-400">X</span>
        </span>
        {showTagline && <span className={cx('mt-1 text-[11px] font-semibold', inverted ? 'text-cream-200' : 'text-charcoal-500')}>From Farm to Future</span>}
      </span>
    </span>
  )
}
