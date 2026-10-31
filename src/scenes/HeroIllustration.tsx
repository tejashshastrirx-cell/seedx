import { useTranslation } from 'react-i18next'

/**
 * Golden-hour farm -> collection hub -> town buyer illustration (art direction brief, Reference A).
 * Pure SVG: no text, no fake metrics, restrained gold routes. Left third kept calm for headline copy.
 */
export function HeroIllustration({ className }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <svg viewBox="0 0 1200 720" className={className} role="img" aria-label={t('scene.fallback')} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F5F0E4" />
          <stop offset="0.55" stopColor="#F7DDA6" />
          <stop offset="1" stopColor="#EFB967" />
        </linearGradient>
        <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FFF6DA" />
          <stop offset="0.5" stopColor="#FBE3A6" stopOpacity="0.9" />
          <stop offset="1" stopColor="#F2C46F" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hillFar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8FBB9D" /><stop offset="1" stopColor="#6E9F80" /></linearGradient>
        <linearGradient id="hillMid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4F8D66" /><stop offset="1" stopColor="#2A6A48" /></linearGradient>
        <linearGradient id="field" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2A6A48" /><stop offset="1" stopColor="#113A29" /></linearGradient>
        <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F5F0E4" stopOpacity="0" /><stop offset="1" stopColor="#F5F0E4" stopOpacity="0.55" /></linearGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" /></filter>
      </defs>

      <rect width="1200" height="720" fill="url(#sky)" />
      <circle cx="880" cy="300" r="190" fill="url(#sun)" className="seedx-sun" />
      <circle cx="880" cy="300" r="46" fill="#FFF3D1" />

      {/* distant town / buyer destination */}
      <g fill="#B9A27A" opacity="0.75">
        {[[980, 330, 18, 52], [1002, 312, 14, 70], [1020, 340, 22, 42], [1046, 320, 16, 62], [1066, 346, 26, 36], [1096, 326, 14, 56], [1114, 350, 30, 32], [955, 350, 20, 32]].map(([x, y, w, h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} rx="2" />
        ))}
      </g>
      <path d="M0 400 C 180 340 330 360 470 372 C 640 386 760 330 920 352 C 1040 368 1120 350 1200 356 L1200 720 L0 720 Z" fill="url(#hillFar)" />
      <rect y="330" width="1200" height="90" fill="url(#haze)" />
      <path d="M0 470 C 160 430 300 452 470 440 C 650 428 800 470 960 450 C 1060 438 1140 446 1200 452 L1200 720 L0 720 Z" fill="url(#hillMid)" />

      {/* collection hub */}
      <g transform="translate(640 400)">
        <rect x="-8" y="40" width="200" height="16" fill="#113A29" opacity="0.25" rx="6" />
        <rect x="0" y="0" width="180" height="48" fill="#F5F0E4" />
        <path d="M-14 4 L90 -34 L194 4 Z" fill="#174B35" />
        <rect x="18" y="16" width="42" height="32" fill="#2A6A48" />
        <rect x="74" y="16" width="42" height="32" fill="#2A6A48" />
        <rect x="128" y="20" width="36" height="20" fill="#E6F1E7" />
        {[0, 1, 2, 3].map((i) => <rect key={i} x={196 + i * 14} y={30 - (i % 2) * 12} width="12" height="12" fill="#CF8D22" stroke="#A86D16" strokeWidth="1.5" />)}
      </g>

      {/* farmstead left-centre */}
      <g transform="translate(470 452)">
        <rect x="0" y="0" width="64" height="34" fill="#EBE2CD" />
        <path d="M-8 2 L32 -22 L72 2 Z" fill="#A86D16" />
        <rect x="24" y="14" width="16" height="20" fill="#174B35" />
      </g>
      <g transform="translate(300 472)"><rect x="0" y="0" width="46" height="26" fill="#EBE2CD" /><path d="M-6 2 L23 -16 L52 2 Z" fill="#174B35" /></g>

      {/* route network: farm -> hub -> town (restrained gold) */}
      <g fill="none" stroke="#E5A63B" strokeLinecap="round">
        <path d="M330 470 C 420 440 520 440 600 432 S 690 420 730 400" strokeWidth="5" opacity="0.35" filter="url(#glow)" />
        <path d="M330 470 C 420 440 520 440 600 432 S 690 420 730 400" strokeWidth="3" strokeDasharray="2 10" className="seedx-flow" />
        <path d="M500 452 C 560 446 610 440 650 420" strokeWidth="3" strokeDasharray="2 10" className="seedx-flow" />
        <path d="M830 400 C 900 380 960 372 1020 362" strokeWidth="5" opacity="0.35" filter="url(#glow)" />
        <path d="M830 400 C 900 380 960 372 1020 362" strokeWidth="3" strokeDasharray="2 10" className="seedx-flow" />
        <path d="M760 560 C 720 520 740 470 760 448" strokeWidth="3" strokeDasharray="2 10" className="seedx-flow" />
      </g>
      {[[330, 470], [500, 452], [730, 400], [1020, 362], [760, 560]].map(([x, y], i) => (
        <g key={i}><circle cx={x} cy={y} r="11" fill="#E5A63B" opacity="0.25" className="seedx-node" style={{ animationDelay: `${i * 0.4}s` }} /><circle cx={x} cy={y} r="5.5" fill="#FFF3D1" stroke="#CF8D22" strokeWidth="2" /></g>
      ))}

      {/* truck on the road to town */}
      <g transform="translate(880 384)"><g className="seedx-truck">
        <rect x="0" y="0" width="54" height="26" rx="3" fill="#F5F0E4" stroke="#174B35" strokeWidth="2" />
        <path d="M54 8 H70 L78 18 V26 H54 Z" fill="#174B35" />
        <circle cx="14" cy="29" r="6" fill="#1C2420" /><circle cx="64" cy="29" r="6" fill="#1C2420" />
      </g></g>

      {/* crop rows foreground */}
      <path d="M0 560 C 260 520 520 540 760 548 C 960 556 1100 536 1200 540 L1200 720 L0 720 Z" fill="url(#field)" />
      <g stroke="#4F8D66" strokeWidth="3" opacity="0.65">
        {Array.from({ length: 16 }).map((_, i) => <path key={i} d={`M${-200 + i * 110} 720 L${380 + i * 48} 560`} />)}
      </g>
      <g fill="#E5A63B" opacity="0.9" className="seedx-sway seedx-sway-2">
        {Array.from({ length: 46 }).map((_, i) => {
          const x = (i * 97) % 1200
          const y = 600 + ((i * 53) % 110)
          return <path key={i} d={`M${x} ${y} q 4 -18 0 -30 q -4 12 0 30`} />
        })}
      </g>
      <g fill="#8FBB9D" className="seedx-sway">
        {Array.from({ length: 30 }).map((_, i) => {
          const x = (i * 131 + 40) % 1200
          const y = 640 + ((i * 37) % 80)
          return <path key={i} d={`M${x} ${y} c -10 -6 -14 -18 -12 -28 c 8 6 12 16 12 28 c 2 -12 8 -22 18 -26 c 0 12 -6 22 -18 26`} />
        })}
      </g>
      {/* farmer silhouette, respectful and capable, looking towards the hub */}
      <g transform="translate(250 560)" fill="#0B281C">
        <circle cx="0" cy="-74" r="11" />
        <path d="M-12 -82 q 12 -12 24 0 q -12 -4 -24 0 Z" fill="#F5F0E4" />
        <path d="M-15 -62 q 15 -6 30 0 l 6 44 q -21 6 -42 0 Z" />
        <path d="M-12 -18 l -4 40 h 10 l 6 -36 l 6 36 h 10 l -4 -40 Z" />
        <rect x="22" y="-70" width="4" height="92" rx="2" />
      </g>
    </svg>
  )
}
