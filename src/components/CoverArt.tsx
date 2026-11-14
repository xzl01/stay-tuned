/* SPDX-License-Identifier: GPL-3.0-only */

import { useEffect, useId, useState } from 'react';
import type { CoverKind } from '../types';
import { proxiedImage } from '../lib/api';

interface CoverArtProps {
  kind?: CoverKind;
  image?: string;
  alt?: string;
  className?: string;
  eager?: boolean;
}

const LEAVES: Array<[number, number, number, number, number]> = [
  [24, 22, 10, 4, -28],
  [41, 31, 12, 4.5, 18],
  [55, 23, 11, 4, -18],
  [34, 51, 12, 4.5, 46],
  [66, 38, 12, 4, -48],
  [78, 55, 11, 4, 24],
  [50, 71, 13, 4.5, -14],
  [96, 47, 12, 4, 38],
  [68, 88, 12, 4.2, -52],
  [28, 91, 11, 4, 26],
  [101, 74, 10, 3.8, 60],
  [84, 104, 10, 3.8, -6],
  [44, 112, 11, 4, 42],
  [112, 96, 9, 3.4, -34],
  [16, 60, 10, 3.8, 70],
  [24, 128, 9, 3.4, -22],
];

function Grain({ id, opacity = 0.2 }: { id: string; opacity?: number }) {
  return (
    <>
      <filter id={id} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="3" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
        <feComponentTransfer>
          <feFuncA type="linear" slope={opacity} />
        </feComponentTransfer>
      </filter>
      <rect width="100%" height="100%" filter={`url(#${id})`} opacity="0.52" style={{ mixBlendMode: 'multiply' }} />
    </>
  );
}

function ArchArt() {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg viewBox="0 0 240 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}sky`} x1="0" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#9aa78d" />
          <stop offset="0.55" stopColor="#84937a" />
          <stop offset="1" stopColor="#6d7d65" />
        </linearGradient>
        <linearGradient id={`${uid}wall`} x1="0.15" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#eee7d6" />
          <stop offset="0.55" stopColor="#e1d7c2" />
          <stop offset="1" stopColor="#c9bca3" />
        </linearGradient>
        <linearGradient id={`${uid}door`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#3f4a39" />
          <stop offset="1" stopColor="#222b1f" />
        </linearGradient>
        <radialGradient id={`${uid}glow`} cx="0.78" cy="0.2" r="0.6">
          <stop offset="0" stopColor="#f3e4bf" stopOpacity="0.55" />
          <stop offset="1" stopColor="#f3e4bf" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="240" height="240" fill={`url(#${uid}sky)`} />
      <rect width="240" height="240" fill={`url(#${uid}glow)`} />
      <path d="M0 204c42-12 91-3 133 3 40 6 76 3 107-6v39H0Z" fill="#c8bca4" />
      <path d="M64 240V101c0-34 25-58 57-58s57 24 57 58v139Z" fill={`url(#${uid}wall)`} />
      <path d="M132 240v-92c0-21 16-36 36-36s36 15 36 36v92Z" fill={`url(#${uid}door)`} />
      <path d="M132 240v-92c0-21 16-36 36-36" fill="none" stroke="#b9784e" strokeWidth="3.2" opacity="0.85" />
      <path d="M197 240v-92c0-12-5-22-13-28" fill="none" stroke="#f0e5cf" strokeWidth="1" opacity="0.28" />
      <path d="M0 199c33-16 72-7 102 11Z" fill="#39452f" opacity="0.16" />
      <g fill="#3d4a36" opacity="0.9">
        {LEAVES.slice(0, 11).map(([x, y, rx, ry, rotate], i) => (
          <ellipse key={`branch-${i}`} cx={x} cy={y - 4} rx={rx} ry={ry} transform={`rotate(${rotate} ${x} ${y})`} />
        ))}
      </g>
      <g stroke="#35412e" fill="none" strokeLinecap="round" opacity="0.95">
        <path d="M8 17c31 15 33 47 59 61" strokeWidth="3.4" />
        <path d="M45 5c15 26 39 34 57 49" strokeWidth="3" />
        <path d="M3 58c30 1 43 24 63 37" strokeWidth="2.6" />
        <path d="M58 14c10 25 35 31 51 42" strokeWidth="2.2" />
        <path d="M16 17c12 3 21 9 26 19" strokeWidth="1.8" />
      </g>
      <g fill="#d9d3be" opacity="0.28">
        {LEAVES.slice(0, 8).map(([x, y, rx, ry, rotate], i) => (
          <ellipse key={`shadow-${i}`} cx={x + 23} cy={y + 43} rx={rx * 1.1} ry={ry * 1.1} transform={`rotate(${rotate} ${x + 23} ${y + 43})`} />
        ))}
      </g>
      <path d="M0 240h240v-5H0Z" fill="#1d2519" opacity="0.18" />
      <Grain id={`${uid}grain`} opacity={0.16} />
    </svg>
  );
}

function RidgeArt() {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg viewBox="0 0 240 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}sky`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#efdfc4" />
          <stop offset="0.52" stopColor="#dcc5a1" />
          <stop offset="1" stopColor="#bda884" />
        </linearGradient>
        <linearGradient id={`${uid}hill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#66735a" />
          <stop offset="1" stopColor="#3d4935" />
        </linearGradient>
      </defs>
      <rect width="240" height="240" fill={`url(#${uid}sky)`} />
      <circle cx="171" cy="72" r="29" fill="#c76b43" opacity="0.92" />
      <circle cx="171" cy="72" r="44" fill="none" stroke="#c76b43" strokeWidth="0.8" opacity="0.25" />
      <path d="M0 157l43-42 25 23 36-44 47 51 34-28 55 47v76H0Z" fill="#8b9178" opacity="0.55" />
      <path d="M0 187l47-53 32 31 41-47 42 45 29-24 49 42v59H0Z" fill={`url(#${uid}hill)`} opacity="0.92" />
      <path d="M0 211l53-37 37 24 49-31 42 27 59-34v80H0Z" fill="#303a2b" />
      <g stroke="#e9dcc3" strokeWidth="0.7" opacity="0.35">
        <path d="M0 176h240M0 190h240M0 205h240" />
      </g>
      <Grain id={`${uid}grain`} opacity={0.18} />
    </svg>
  );
}

function WindowArt() {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg viewBox="0 0 240 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}wall`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ded4bd" />
          <stop offset="1" stopColor="#bdae91" />
        </linearGradient>
        <linearGradient id={`${uid}light`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3e6c8" />
          <stop offset="1" stopColor="#d6b98e" />
        </linearGradient>
      </defs>
      <rect width="240" height="240" fill="#354235" />
      <rect x="23" y="24" width="194" height="216" fill={`url(#${uid}wall)`} />
      <path d="M128 24v216h89V24Z" fill="#d9cdb5" opacity="0.5" />
      <rect x="136" y="47" width="70" height="103" fill={`url(#${uid}light)`} />
      <path d="M170 47v103M136 97h70" stroke="#6e6857" strokeWidth="3" />
      <path d="M206 150h-70L116 240h90Z" fill="#f0e2c4" opacity="0.32" />
      <path d="M39 240v-64c0-16 11-27 24-27s24 11 24 27v64Z" fill="#384535" />
      <g stroke="#475541" strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M63 141c-13-20-11-37 2-56M60 143c-19-11-30-4-36 8M66 141c19-17 30-10 37 2" />
      </g>
      <g fill="#43513d">
        <ellipse cx="58" cy="103" rx="9" ry="16" transform="rotate(26 58 103)" />
        <ellipse cx="83" cy="112" rx="8" ry="14" transform="rotate(-30 83 112)" />
        <ellipse cx="44" cy="128" rx="7" ry="12" transform="rotate(52 44 128)" />
        <ellipse cx="92" cy="136" rx="7" ry="12" transform="rotate(-48 92 136)" />
      </g>
      <Grain id={`${uid}grain`} opacity={0.17} />
    </svg>
  );
}

function FieldArt() {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg viewBox="0 0 240 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9dfc9" />
          <stop offset="1" stopColor="#d4c3a3" />
        </linearGradient>
      </defs>
      <rect width="240" height="240" fill={`url(#${uid}sky)`} />
      <circle cx="166" cy="78" r="33" fill="#c15a32" />
      <path d="M0 146c54-25 105-21 150-1 35 16 66 13 90 1v94H0Z" fill="#89906c" />
      <path d="M0 172c48-18 94-10 141 4 38 11 69 9 99-3v67H0Z" fill="#66714f" />
      <path d="M0 202c63-12 110 2 153 7 33 4 61 3 87-2v33H0Z" fill="#3b462f" />
      <g stroke="#3d4932" fill="none" opacity="0.34">
        <path d="M0 158c56-16 108-5 154 8 33 9 61 7 86 0M0 184c47-9 91 0 132 6 41 7 73 5 108-4M0 214h240" />
      </g>
      <g fill="#2e3927" opacity="0.85">
        <path d="M28 202c2-19 4-36 8-49M36 202c1-14 7-28 13-38M44 204c5-16 12-26 22-34" stroke="#2e3927" strokeWidth="1.5" strokeLinecap="round" />
      </g>
      <Grain id={`${uid}grain`} opacity={0.2} />
    </svg>
  );
}

function SignalArt() {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg viewBox="0 0 240 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="240" height="240" fill="#263024" />
      <g fill="none" stroke="#d8d0bb" opacity="0.2">
        {[36, 62, 88, 114, 140].map((r) => (
          <circle key={r} cx="113" cy="124" r={r} strokeWidth="0.9" />
        ))}
        <path d="M0 124h240M113 0v240" strokeDasharray="1 7" />
        {Array.from({ length: 23 }).map((_, i) => (
          <path key={i} d={`M${12 + i * 9.8} 32v10`} strokeWidth="1" />
        ))}
        {Array.from({ length: 23 }).map((_, i) => (
          <path key={`b${i}`} d={`M${12 + i * 9.8} 206v10`} strokeWidth="1" />
        ))}
      </g>
      <circle cx="113" cy="124" r="4.2" fill="#c65b33" />
      <path d="M113 124 162 78" stroke="#c65b33" strokeWidth="2" strokeLinecap="round" />
      <circle cx="162" cy="78" r="3" fill="#c65b33" />
      <g fill="none" stroke="#d8d0bb" opacity="0.42">
        <path d="M18 184h36M18 190h22M164 190h38" strokeWidth="1.4" />
        <circle cx="208" cy="184" r="2.2" fill="#c65b33" stroke="none" />
      </g>
      <Grain id={`${uid}grain`} opacity={0.15} />
    </svg>
  );
}

function NightArt() {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const stars = [
    [36, 38, 1.2], [71, 24, 0.9], [113, 48, 1.1], [151, 26, 0.8], [196, 57, 1.2],
    [27, 83, 0.8], [95, 92, 1], [177, 103, 0.9], [219, 32, 1.1], [55, 120, 0.7],
  ];
  return (
    <svg viewBox="0 0 240 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}sky`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#18221f" />
          <stop offset="1" stopColor="#2f3b31" />
        </linearGradient>
      </defs>
      <rect width="240" height="240" fill={`url(#${uid}sky)`} />
      <g fill="#ece2c9">
        {stars.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} opacity={0.4 + (i % 4) * 0.14} />
        ))}
        <path d="M175 61a27 27 0 1 0 25 39 22 22 0 0 1-25-39Z" opacity="0.92" />
      </g>
      <path d="M0 179c42-27 69-19 103 2 39 25 79 19 137-12v71H0Z" fill="#1b241d" />
      <path d="M0 204c58-17 102-5 143 8 34 11 64 9 97 0v28H0Z" fill="#111812" />
      <path d="M29 203v-32M36 203v-21M45 203v-12" stroke="#0d130f" strokeWidth="2.4" strokeLinecap="round" />
      <Grain id={`${uid}grain`} opacity={0.16} />
    </svg>
  );
}

function DuneArt() {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg viewBox="0 0 240 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9c4a6" />
          <stop offset="1" stopColor="#b9976e" />
        </linearGradient>
      </defs>
      <rect width="240" height="240" fill={`url(#${uid}sky)`} />
      <circle cx="78" cy="65" r="23" fill="#e9dcc2" opacity="0.8" />
      <path d="M0 152c58-43 104-36 151-9 36 20 65 20 89 11v86H0Z" fill="#9c7d58" />
      <path d="M0 183c64-31 103-20 150 3 38 19 67 17 90 7v47H0Z" fill="#7b603f" />
      <path d="M0 213c51-16 95-5 139 8 36 11 67 10 101 2v17H0Z" fill="#4d3d29" />
      <g stroke="#eadbc1" fill="none" opacity="0.25">
        <path d="M0 165c55-31 99-24 145 0 34 18 66 20 95 12" />
        <path d="M0 192c61-24 102-12 146 4 38 14 66 15 94 9" />
      </g>
      <Grain id={`${uid}grain`} opacity={0.2} />
    </svg>
  );
}

const ART: Record<CoverKind, () => React.JSX.Element> = {
  arch: ArchArt,
  ridge: RidgeArt,
  window: WindowArt,
  field: FieldArt,
  signal: SignalArt,
  night: NightArt,
  dune: DuneArt,
};

export function CoverArt({ kind = 'signal', image, alt = '', className = '', eager = false }: CoverArtProps) {
  const [failed, setFailed] = useState(false);
  const Art = ART[kind] ?? SignalArt;

  useEffect(() => setFailed(false), [image]);

  const proxied = proxiedImage(image);
  return (
    <div className={`cover-art ${className}`} role={alt ? 'img' : undefined} aria-label={alt || undefined}>
      {proxied && !failed ? (
        <img
          src={proxied}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <Art />
      )}
    </div>
  );
}
