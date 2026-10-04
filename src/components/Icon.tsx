/**
 * Icon — set ikon SVG inline (pengganti emoji).
 * Dipakai di reactions, tombol mute, badge, dan label.
 */
import React from 'react'

const P: Record<string, React.ReactNode> = {
  like: <path d="M4 14V7l4-5 1 1-1 4h5l-1 7H4zm2-1h5l.5-5H7.5L6 6v7z"/>,
  dislike: <path d="M4 2h7l1 7-1 5H6l-.5-5H8L7 3 4 2zm2 11h5l.5-5H7.5L6 9v4z" transform="translate(0,1)"/>,
  smile: (
    <>
      <circle cx="8" cy="8" r="6.2" fill="none" strokeWidth="1.5"/>
      <path d="M5.5 9.5c.6 1.2 1.6 1.8 2.5 1.8s1.9-.6 2.5-1.8" fill="none" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="6" cy="6.5" r=".9"/>
      <circle cx="10" cy="6.5" r=".9"/>
    </>
  ),
  party: (
    <>
      <path d="M2 14l4-11 7 7-11 4z"/>
      <path d="M9 3.5l.5-1.5M12 5.5l1.5-.8M11.5 8.8l1.4.6" fill="none" strokeWidth="1.3" strokeLinecap="round"/>
    </>
  ),
  angry: (
    <>
      <circle cx="8" cy="8" r="6.2" fill="none" strokeWidth="1.5"/>
      <path d="M5.5 11c.6-1.2 1.6-1.8 2.5-1.8s1.9.6 2.5 1.8" fill="none" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M4.8 5.6l2.2.9M11.2 5.6L9 6.5" fill="none" strokeWidth="1.4" strokeLinecap="round"/>
    </>
  ),
  fire: <path d="M8 1c1.5 3-1.5 4-1 6.5C5 7 4.5 5.5 4.5 5.5 3 7 2.5 8.6 2.5 10a5.5 5.5 0 0011 0c0-3.5-2.5-6-5.5-9zm.2 11.5a2 2 0 01-2-2c0-1.2 1-1.8 1.4-2.8.9 1 2.6 1.9 2.6 3.6a2 2 0 01-2 1.2z"/>,
  star: <path d="M8 1.5l1.9 4.1 4.5.5-3.3 3.1.9 4.4L8 11.5l-4 2.1.9-4.4-3.3-3.1 4.5-.5L8 1.5z"/>,
  rocket: <path d="M9.5 1.5c3 1 5 4 4.5 8l-3 3-3-.5-1.5 2.5-2-2 2.5-1.5-.5-3 3-3-2-2 2-1.5 2.5 2zM11 5.5a1 1 0 100 .01z"/>,
  skull: (
    <>
      <path d="M8 1.5a5.5 5.5 0 00-5.5 5.5c0 2 1 3.3 2.3 4.2V14h6.4v-2.8c1.3-.9 2.3-2.2 2.3-4.2A5.5 5.5 0 008 1.5z"/>
      <circle cx="6" cy="7" r="1.2" fill="#fff"/>
      <circle cx="10" cy="7" r="1.2" fill="#fff"/>
    </>
  ),
  heart: <path d="M8 14S1.5 10 1.5 5.5A3.5 3.5 0 018 3.7a3.5 3.5 0 016.5 1.8C14.5 10 8 14 8 14z"/>,
  eyes: (
    <>
      <ellipse cx="5" cy="8" rx="3" ry="3.6" fill="none" strokeWidth="1.5"/>
      <ellipse cx="11" cy="8" rx="3" ry="3.6" fill="none" strokeWidth="1.5"/>
      <circle cx="5.8" cy="8.4" r="1.1"/>
      <circle cx="11.8" cy="8.4" r="1.1"/>
    </>
  ),
  sweat: (
    <>
      <circle cx="8" cy="9" r="5.8" fill="none" strokeWidth="1.5"/>
      <circle cx="6" cy="7.5" r=".9"/>
      <circle cx="10" cy="7.5" r=".9"/>
      <path d="M6.5 11.5c.7.8 2.3.8 3 0" fill="none" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M12.5 3.5c1 1.2 1.6 2 1.6 2.7a1.6 1.6 0 11-3.2 0c0-.7.6-1.5 1.6-2.7z"/>
    </>
  ),
  think: (
    <>
      <circle cx="8" cy="8" r="6.2" fill="none" strokeWidth="1.5"/>
      <circle cx="6" cy="6.5" r=".9"/>
      <circle cx="10" cy="6.5" r=".9"/>
      <path d="M6 10.5h4" fill="none" strokeWidth="1.4" strokeLinecap="round"/>
    </>
  ),
  laugh: (
    <>
      <circle cx="8" cy="8" r="6.2" fill="none" strokeWidth="1.5"/>
      <path d="M4.8 9c.8 1.8 2 2.7 3.2 2.7S10.4 10.8 11.2 9H4.8z"/>
      <path d="M5.5 6l1.8 1M10.5 6L8.7 7" fill="none" strokeWidth="1.3" strokeLinecap="round"/>
    </>
  ),
  bolt: <path d="M9.5 1L3 9h4l-.5 6L13 7H9l.5-6z"/>,
  check: <path d="M6.2 11.3L2.8 7.9l1.2-1.2 2.2 2.2 5-5 1.2 1.2-6.2 6.4z"/>,
  x: <path d="M4 3.2L8 7.2l4-4 1.1 1.1-4 4 4 4L12 13.4 8 9.4l-4 4-1.1-1.1 4-4-4-4L4 3.2z"/>,
  alert: (
    <>
      <path d="M8 1.5l6.5 12h-13L8 1.5z" fill="none" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M8 6v3.5" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="8" cy="11.5" r=".9"/>
    </>
  ),
  wallet: (
    <>
      <rect x="1.5" y="3.5" width="13" height="9.5" rx="1.5" fill="none" strokeWidth="1.5"/>
      <path d="M1.5 6.5h13" strokeWidth="1.3"/>
      <circle cx="11.5" cy="9.8" r="1.1"/>
    </>
  ),
  users: (
    <>
      <circle cx="6" cy="5.5" r="2.5" fill="none" strokeWidth="1.5"/>
      <path d="M1.5 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" fill="none" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M11 4.2a2.3 2.3 0 010 4.4M12 9.8c1.6.5 2.7 1.8 2.7 3.7" fill="none" strokeWidth="1.4" strokeLinecap="round"/>
    </>
  ),
  folder: <path d="M1.5 3.5h4.2l1.4 1.8h7.4v7.2a1 1 0 01-1 1h-11a1 1 0 01-1-1v-9z"/>,
  calendar: (
    <>
      <rect x="1.5" y="3" width="13" height="11" rx="1.5" fill="none" strokeWidth="1.5"/>
      <path d="M1.5 6.5h13M5 1.5v3M11 1.5v3" strokeWidth="1.4" strokeLinecap="round"/>
    </>
  ),
  box: (
    <>
      <path d="M8 1.5l6 2.7v7.6L8 14.5l-6-2.7V4.2L8 1.5z" fill="none" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M2 4.2l6 2.7 6-2.7M8 7v7.5" fill="none" strokeWidth="1.3"/>
    </>
  ),
  megaphone: <path d="M13.5 2.5v8a1.5 1.5 0 01-1.5 1.5H6l-3 3v-3H3a1.5 1.5 0 01-1.5-1.5v-8A1.5 1.5 0 013 2.5h9a1.5 1.5 0 011.5 1.5z"/>,
  archive: (
    <>
      <rect x="1.5" y="2" width="13" height="3.5" rx="1"/>
      <path d="M2.8 5.5h10.4v7a1 1 0 01-1 1H3.8a1 1 0 01-1-1v-7z"/>
      <path d="M6.3 8.3h3.4" stroke="#fff" strokeWidth="1.3" strokeLinecap="round"/>
    </>
  ),
  robot: (
    <>
      <rect x="2.5" y="5" width="11" height="8.5" rx="2" fill="none" strokeWidth="1.5"/>
      <path d="M8 2v3" strokeWidth="1.4" strokeLinecap="round"/>
      <circle cx="8" cy="1.8" r="1"/>
      <circle cx="5.8" cy="8.8" r="1.1"/>
      <circle cx="10.2" cy="8.8" r="1.1"/>
      <path d="M6.3 11.6h3.4" strokeWidth="1.3" strokeLinecap="round"/>
    </>
  ),
  person: (
    <>
      <circle cx="8" cy="5" r="2.7" fill="none" strokeWidth="1.5"/>
      <path d="M2.8 14c0-3 2.3-4.8 5.2-4.8s5.2 1.8 5.2 4.8" fill="none" strokeWidth="1.5" strokeLinecap="round"/>
    </>
  ),
  crown: <path d="M1.5 5l3 3 3.5-5 3.5 5 3-3-1.5 8h-10L1.5 5zm1.7 9.5h9.6v-1.2H3.2v1.2z"/>,
  clipboard: (
    <>
      <rect x="3" y="2.5" width="10" height="12" rx="1.5" fill="none" strokeWidth="1.5"/>
      <rect x="5.5" y="1" width="5" height="3" rx="1" fill="none" strokeWidth="1.4"/>
      <path d="M5.5 7.5h5M5.5 10h5" strokeWidth="1.3" strokeLinecap="round"/>
    </>
  ),
  printer: (
    <>
      <path d="M4 2.5h8v3.5H4z"/>
      <rect x="1.5" y="6" width="13" height="5.5" rx="1.2" fill="none" strokeWidth="1.5"/>
      <path d="M4 9.5h8v4.5H4z" fill="none" strokeWidth="1.4"/>
      <circle cx="12" cy="8" r=".8"/>
    </>
  ),
  doc: (
    <>
      <path d="M3.5 1.5h6L12.5 5v9.5h-9v-13z" fill="none" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M9.5 1.5V5h3" fill="none" strokeWidth="1.4"/>
      <path d="M5.5 8.5h5M5.5 11h5" strokeWidth="1.3" strokeLinecap="round"/>
    </>
  ),
  search: (
    <>
      <circle cx="7" cy="7" r="4.8" fill="none" strokeWidth="1.6"/>
      <path d="M10.5 10.5L14.5 14.5" strokeWidth="1.7" strokeLinecap="round"/>
    </>
  ),
  volumeHigh: (
    <>
      <path d="M2 6.5h3L9 3v10L5 9.5H2v-3z"/>
      <path d="M11 5.5a3.5 3.5 0 010 5M13 3.5a6.5 6.5 0 010 9" fill="none" strokeWidth="1.4" strokeLinecap="round"/>
    </>
  ),
  volumeLow: (
    <>
      <path d="M2 6.5h3L9 3v10L5 9.5H2v-3z"/>
      <path d="M11 5.5a3.5 3.5 0 010 5" fill="none" strokeWidth="1.4" strokeLinecap="round"/>
    </>
  ),
  volumeMute: (
    <>
      <path d="M2 6.5h3L9 3v10L5 9.5H2v-3z"/>
      <path d="M11 6l4 4M15 6l-4 4" fill="none" strokeWidth="1.5" strokeLinecap="round"/>
    </>
  ),
  sun: (
    <>
      <circle cx="8" cy="8" r="3.2" fill="none" strokeWidth="1.5"/>
      <path d="M8 1v1.8M8 13.2V15M1 8h1.8M13.2 8H15M3 3l1.3 1.3M11.7 11.7L13 13M13 3l-1.3 1.3M4.3 11.7L3 13" strokeWidth="1.4" strokeLinecap="round"/>
    </>
  ),
  moon: <path d="M13.5 9.5A6 6 0 016.5 2.5a6.2 6.2 0 107 7z"/>,
  sunrise: (
    <>
      <path d="M1.5 12.5h13" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M4.5 9.5a3.5 3.5 0 017 0" fill="none" strokeWidth="1.5"/>
      <path d="M8 1.5v3M3 4l1.2 1.2M13 4l-1.2 1.2" strokeWidth="1.3" strokeLinecap="round"/>
    </>
  ),
  sunset: (
    <>
      <path d="M1.5 12.5h13" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M4.5 9.5a3.5 3.5 0 017 0" fill="none" strokeWidth="1.5"/>
      <path d="M8 4.5v-3M3 4l1.2 1.2M13 4l-1.2 1.2M5.5 14.5l1-1M10.5 14.5l-1-1" strokeWidth="1.3" strokeLinecap="round"/>
    </>
  ),
  coffee: (
    <>
      <path d="M2.5 5.5h8v5a3 3 0 01-3 3h-2a3 3 0 01-3-3v-5z" fill="none" strokeWidth="1.5"/>
      <path d="M10.5 6.5h1.8a1.7 1.7 0 010 3.4h-1.8" fill="none" strokeWidth="1.4"/>
      <path d="M4.5 2.5v1.5M7 2.5v1.5M9.5 2.5v1.5" strokeWidth="1.3" strokeLinecap="round"/>
    </>
  ),
  water: <path d="M8 1.5s5 5.4 5 8.6a5 5 0 01-10 0C3 6.9 8 1.5 8 1.5z"/>,
  gift: (
    <>
      <rect x="1.5" y="5.5" width="13" height="3"/>
      <path d="M2.8 8.5v6h10.4v-6M8 5.5v9" fill="none" strokeWidth="1.4"/>
      <path d="M8 5.5C6.5 3 4 2.5 4 4.2c0 1.2 1.8 1.3 4 1.3zM8 5.5c1.5-2.5 4-3 4-1.3 0 1.2-1.8 1.3-4 1.3z" fill="none" strokeWidth="1.3"/>
    </>
  ),
  bell: (
    <>
      <path d="M4 11V7a4 4 0 018 0v4l1.2 1.8H2.8L4 11z" fill="none" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M6.5 13.5a1.5 1.5 0 003 0" fill="none" strokeWidth="1.4" strokeLinecap="round"/>
    </>
  ),
  shield: <path d="M8 1.5l5.5 2v4.5c0 3.3-2.3 5.7-5.5 6.5-3.2-.8-5.5-3.2-5.5-6.5V3.5L8 1.5z" fill="none" strokeWidth="1.5" strokeLinejoin="round"/>,
  chart: (
    <>
      <path d="M2 14h12" strokeWidth="1.4" strokeLinecap="round"/>
      <rect x="3" y="8" width="2.5" height="4.5"/>
      <rect x="7" y="5" width="2.5" height="7.5"/>
      <rect x="11" y="9.5" width="2.5" height="3"/>
    </>
  ),
}

export type IconName = keyof typeof P

interface IconProps {
  name: string
  size?: number
  className?: string
  color?: string
}

const Icon: React.FC<IconProps> = ({ name, size = 14, className, color }) => {
  const glyph = P[name]
  if (!glyph) return null
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      className={className}
      fill={color ?? 'currentColor' }
      stroke={color ?? 'currentColor' }
      strokeWidth="0"
      aria-hidden="true"
      style={{ flexShrink: 0, display: 'inline-block', verticalAlign: '-0.15em' }}
    >
      {glyph}
    </svg>
  )
}

export default Icon
