/* SPDX-License-Identifier: GPL-3.0-only */

import type { SVGProps } from 'react';

export type IconName =
  | 'play'
  | 'pause'
  | 'skipBack'
  | 'skipForward'
  | 'rewind15'
  | 'forward30'
  | 'heart'
  | 'library'
  | 'queue'
  | 'sun'
  | 'moon'
  | 'close'
  | 'plus'
  | 'minus'
  | 'check'
  | 'chevronDown'
  | 'chevronRight'
  | 'chevronLeft'
  | 'search'
  | 'trash'
  | 'more'
  | 'volume'
  | 'volumeOff'
  | 'timer'
  | 'rss'
  | 'radio'
  | 'external'
  | 'refresh'
  | 'pencil'
  | 'image'
  | 'arrowUp'
  | 'arrowDown'
  | 'grip'
  | 'signal'
  | 'haptics'
  | 'spark'
  | 'headphones'
  | 'list'
  | 'download'
  | 'downloadDone'
  | 'settings';

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  filled?: boolean;
}

const paths: Record<IconName, React.ReactNode> = {
  settings: (
    <>
      <path d="M4 7h4.6M15.4 7H20" />
      <circle cx="12" cy="7" r="2.2" />
      <path d="M4 12h9.6M18.4 12H20" />
      <circle cx="16" cy="12" r="2.2" />
      <path d="M4 17h1.6M10.4 17H20" />
      <circle cx="7.6" cy="17" r="2.2" />
    </>
  ),
  download: (
    <>
      <path d="M12 3.5v10.2" />
      <path d="m7.8 9.8 4.2 4.2 4.2-4.2" />
      <path d="M5 17.5v1.2A1.8 1.8 0 0 0 6.8 20.5h10.4a1.8 1.8 0 0 0 1.8-1.8v-1.2" />
    </>
  ),
  downloadDone: (
    <>
      <path d="M12 3.5v9" />
      <path d="m7.8 8.6 4.2 4.2 4.2-4.2" />
      <path d="M5 16.5v2A1.8 1.8 0 0 0 6.8 20.3h10.4a1.8 1.8 0 0 0 1.8-1.8v-2" />
      <path d="m9 14.8 2 2 4-4" />
    </>
  ),
  play: <path d="M8 5.2c0-1.1 1.2-1.8 2.2-1.2l9.6 6.1c1 .6 1 2 0 2.6l-9.6 6.1c-1 .6-2.2-.1-2.2-1.2V5.2Z" fill="currentColor" stroke="none" />,
  pause: (
    <g fill="currentColor" stroke="none">
      <rect x="6.2" y="4.8" width="3.8" height="14.4" rx="1.5" />
      <rect x="14" y="4.8" width="3.8" height="14.4" rx="1.5" />
    </g>
  ),
  skipBack: (
    <>
      <path d="M18 6.1c0-.9-1-1.4-1.7-.9l-6.8 5.1c-.6.4-.6 1.3 0 1.7l6.8 5.1c.7.5 1.7 0 1.7-.9V6.1Z" fill="currentColor" stroke="none" />
      <path d="M4 5.5v13" />
    </>
  ),
  skipForward: (
    <>
      <path d="M6 6.1c0-.9 1-1.4 1.7-.9l6.8 5.1c.6.4.6 1.3 0 1.7l-6.8 5.1c-.7.5-1.7 0-1.7-.9V6.1Z" fill="currentColor" stroke="none" />
      <path d="M20 5.5v13" />
    </>
  ),
  rewind15: (
    <>
      <path d="M10.7 5.7A7.4 7.4 0 1 1 5.2 10.3" />
      <path d="M10.9 3.5 7.4 5.9 11.3 7.9Z" fill="currentColor" stroke="none" />
      <text x="12.2" y="15.7" fontSize="7.15" fontWeight="700" fill="currentColor" stroke="none" textAnchor="middle">15</text>
    </>
  ),
  forward30: (
    <>
      <path d="M13.3 5.7A7.4 7.4 0 1 0 18.8 10.3" />
      <path d="M13.1 3.5 16.6 5.9 12.7 7.9Z" fill="currentColor" stroke="none" />
      <text x="12.2" y="15.7" fontSize="7.15" fontWeight="700" fill="currentColor" stroke="none" textAnchor="middle">30</text>
    </>
  ),
  heart: (
    <path
      d="M12 20.1c-.3 0-.6-.1-.8-.3C6.9 16.2 3 13 3 8.9 3 6.2 5.1 4 7.7 4c1.7 0 3.2.8 4.3 2.2C13.1 4.8 14.6 4 16.3 4 18.9 4 21 6.2 21 8.9c0 4.1-3.9 7.3-8.2 10.9-.2.2-.5.3-.8.3Z"
    />
  ),
  library: (
    <>
      <rect x="4" y="5.2" width="11.6" height="13.6" rx="1.2" />
      <path d="M7.2 9.2h5.2M7.2 12.2h5.2M7.2 15.2h3" />
      <path d="M18.1 7.8l1.9.7v9.6a1.4 1.4 0 0 1-1 1.4l-3.2.7" opacity=".8" />
    </>
  ),
  queue: (
    <>
      <path d="M4 6h11M4 11h8M4 16h6" />
      <path d="M17 10.5v8.2M17 10.5l3 2M17 10.5l-3 2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="3.8" />
      <path d="M12 2.8v2.1M12 19.1v2.1M2.8 12h2.1M19.1 12h2.1M5.5 5.5l1.5 1.5M17 17l1.5 1.5M18.5 5.5 17 7M7 17l-1.5 1.5" />
    </>
  ),
  moon: <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.3 8.3 0 1 0 10.2 10.2Z" />,
  close: <path d="m5.5 5.5 13 13M18.5 5.5l-13 13" />,
  plus: <path d="M12 4.5v15M4.5 12h15" />,
  minus: <path d="M4.5 12h15" />,
  check: <path d="m4.5 12.2 4.8 4.8 10.2-10" />,
  chevronDown: <path d="m5.5 9 6.5 6.5L18.5 9" />,
  chevronRight: <path d="m9 5.5 6.5 6.5L9 18.5" />,
  chevronLeft: <path d="M15 5.5 8.5 12l6.5 6.5" />,
  search: (
    <>
      <circle cx="10.7" cy="10.7" r="6.2" />
      <path d="m15.5 15.5 4.3 4.3" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 6.5h15M9 6.5V4.2h6v2.3M6.5 6.5l.8 13h9.4l.8-13" />
      <path d="M10 10.5v5.5M14 10.5v5.5" opacity=".6" />
    </>
  ),
  more: (
    <g fill="currentColor" stroke="none">
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </g>
  ),
  volume: (
    <>
      <path d="M4 9.2h3.2L12.5 5v14L7.2 14.8H4z" />
      <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.6 7.6 0 0 1 0 11" opacity=".8" />
    </>
  ),
  volumeOff: (
    <>
      <path d="M4 9.2h3.2L12.5 5v14L7.2 14.8H4z" />
      <path d="m15.5 9.5 5 5M20.5 9.5l-5 5" />
    </>
  ),
  timer: (
    <>
      <path d="M12 3.2a8.5 8.5 0 1 0 8.5 8.5A8.5 8.5 0 0 0 12 3.2Z" />
      <path d="M12 7.2v4.8l3.2 1.9" />
    </>
  ),
  rss: (
    <>
      <path d="M5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" fill="currentColor" stroke="none" />
      <path d="M4.5 4.5A15 15 0 0 1 19.5 19.5M4.5 10a9.5 9.5 0 0 1 9.5 9.5" />
    </>
  ),
  radio: (
    <>
      <rect x="3.5" y="7.5" width="17" height="12" rx="2" />
      <path d="m7.5 7.5 8.8-3.7M8 13.5h3.5M8 16.5h7" />
      <circle cx="17" cy="15" r="1.8" />
    </>
  ),
  external: (
    <>
      <path d="M13.5 4.5h6v6M19.5 4.5 11 13" />
      <path d="M18.5 14v4.5a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 18.5V7a1.5 1.5 0 0 1 1.5-1.5H10" />
    </>
  ),
  refresh: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.8 4v4.8h-4.7" />
    </>
  ),
  pencil: (
    <>
      <path d="m4.5 19.5.9-4.2L16.1 4.6a2.1 2.1 0 0 1 3 3L8.4 18.3l-3.9 1.2Z" />
      <path d="m14.8 6.2 3 3" opacity=".65" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="8.5" cy="9.2" r="1.7" />
      <path d="m4.5 17 4.8-4.5 3.2 3 2.7-2.5 4.3 4" />
    </>
  ),
  arrowUp: <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />,
  arrowDown: <path d="M12 5v14M18.5 12.5 12 19l-6.5-6.5" />,
  grip: (
    <g fill="currentColor" stroke="none">
      <circle cx="9" cy="6.5" r="1.2" />
      <circle cx="15" cy="6.5" r="1.2" />
      <circle cx="9" cy="12" r="1.2" />
      <circle cx="15" cy="12" r="1.2" />
      <circle cx="9" cy="17.5" r="1.2" />
      <circle cx="15" cy="17.5" r="1.2" />
    </g>
  ),
  signal: (
    <>
      <path d="M4 18.5v-2M8 18.5v-5M12 18.5v-8M16 18.5v-11M20 18.5v-14" />
    </>
  ),
  haptics: (
    <>
      <rect x="9.1" y="5" width="5.8" height="14" rx="1.5" />
      <path d="M6.1 8.4c-1.1.9-1.8 2.2-1.8 3.6s.7 2.7 1.8 3.6" />
      <path d="M17.9 8.4c1.1.9 1.8 2.2 1.8 3.6s-.7 2.7-1.8 3.6" />
    </>
  ),
  spark: <path d="M12 3.5c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7Z" />,
  headphones: (
    <>
      <path d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2" />
      <rect x="3.5" y="13.5" width="3.5" height="6.5" rx="1.7" />
      <rect x="17" y="13.5" width="3.5" height="6.5" rx="1.7" />
    </>
  ),
  list: (
    <>
      <path d="M4 6.5h1.5M8.5 6.5H20M4 12h1.5M8.5 12H20M4 17.5h1.5M8.5 17.5H20" />
    </>
  ),
};

export function Icon({ name, size = 20, filled = false, strokeWidth = 1.6, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}

export function BrandMark({ size = 38 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className="brand-mark"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="36" height="36" rx="7.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.5 14.5v11M15 12.5v15M19.5 17v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".62" />
      <path d="M25 9.5v21M29.5 14v12" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
