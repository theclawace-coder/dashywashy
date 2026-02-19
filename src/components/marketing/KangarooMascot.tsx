/**
 * KangarooMascot - Iconic animated kangaroo mascot for CRMroo
 * A friendly, bouncing kangaroo with a pouch full of CRM magic.
 */

interface KangarooMascotProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'hero'
  animate?: boolean
  className?: string
  showLabel?: boolean
}

const SIZES = {
  sm: { w: 80, h: 96 },
  md: { w: 120, h: 144 },
  lg: { w: 160, h: 192 },
  xl: { w: 220, h: 264 },
  hero: { w: 320, h: 384 },
}

export default function KangarooMascot({
  size = 'md',
  animate = true,
  className = '',
  showLabel = false,
}: KangarooMascotProps) {
  const { w, h } = SIZES[size]

  return (
    <div className={`roo-mascot ${animate ? 'roo-mascot-animated' : ''} ${className}`}>
      <svg
        viewBox="0 0 200 240"
        width={w}
        height={h}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="roo-mascot-svg"
        aria-label="Roo the kangaroo mascot"
      >
        <defs>
          <linearGradient id="rooBody" x1="0.2" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor="#2dd4bf" />
            <stop offset="50%" stopColor="#14b8a6" />
            <stop offset="100%" stopColor="#0d9488" />
          </linearGradient>
          <linearGradient id="rooBelly" x1="0.3" y1="0" x2="0.7" y2="1">
            <stop offset="0%" stopColor="#5eead4" />
            <stop offset="100%" stopColor="#2dd4bf" />
          </linearGradient>
          <linearGradient id="rooEar" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#14b8a6" />
            <stop offset="100%" stopColor="#0f766e" />
          </linearGradient>
          <radialGradient id="rooGlow" cx="0.5" cy="0.4" r="0.6">
            <stop offset="0%" stopColor="rgba(45,212,191,0.3)" />
            <stop offset="100%" stopColor="rgba(45,212,191,0)" />
          </radialGradient>
          <filter id="rooShadow" x="-20%" y="-10%" width="140%" height="130%">
            <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="rgba(13,148,136,0.25)" />
          </filter>
        </defs>

        {/* Glow behind mascot */}
        <ellipse cx="100" cy="200" rx="70" ry="20" fill="url(#rooGlow)" className="roo-shadow-ellipse" />

        {/* Tail */}
        <path
          d="M55 185 C30 175, 15 150, 25 130 C30 120, 40 118, 45 125 C50 132, 48 155, 55 170"
          stroke="url(#rooBody)"
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
          className="roo-tail"
        />

        {/* Left leg (back) */}
        <ellipse cx="78" cy="210" rx="18" ry="10" fill="url(#rooBody)" className="roo-foot-left" />
        <path
          d="M75 180 C72 190, 68 200, 72 210 C76 215, 82 215, 84 210"
          fill="url(#rooBody)"
        />

        {/* Right leg (front) */}
        <ellipse cx="115" cy="212" rx="20" ry="11" fill="url(#rooBody)" className="roo-foot-right" />
        <path
          d="M110 180 C108 192, 105 202, 108 212 C112 218, 120 218, 122 212"
          fill="url(#rooBody)"
        />

        {/* Body */}
        <g filter="url(#rooShadow)" className="roo-body-group">
          <path
            d="M65 100 C60 120, 58 150, 62 175 C64 185, 72 190, 85 190
               L115 190 C128 190, 136 185, 138 175 C142 150, 140 120, 135 100
               C130 80, 115 68, 100 68 C85 68, 70 80, 65 100Z"
            fill="url(#rooBody)"
          />

          {/* Belly / pouch area */}
          <path
            d="M78 130 C76 145, 78 165, 85 175 C90 180, 110 180, 115 175
               C122 165, 124 145, 122 130 C120 120, 112 115, 100 115 C88 115, 80 120, 78 130Z"
            fill="url(#rooBelly)"
            opacity="0.5"
          />

          {/* Pouch opening */}
          <path
            d="M85 148 C88 155, 95 160, 100 160 C105 160, 112 155, 115 148"
            stroke="#0d9488"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />

          {/* Tiny CRM icon peeking from pouch */}
          <g className="roo-pouch-item">
            <rect x="94" y="150" width="12" height="9" rx="2" fill="rgba(255,255,255,0.9)" />
            <line x1="96" y1="153" x2="104" y2="153" stroke="#0d9488" strokeWidth="1" />
            <line x1="96" y1="155.5" x2="101" y2="155.5" stroke="#14b8a6" strokeWidth="1" />
          </g>
        </g>

        {/* Arms */}
        <g className="roo-arms">
          {/* Left arm */}
          <path
            d="M68 115 C55 120, 48 130, 52 138 C54 142, 60 142, 62 138 C64 132, 66 125, 70 120"
            fill="url(#rooBody)"
            className="roo-arm-left"
          />
          {/* Right arm - waving */}
          <path
            d="M132 115 C142 108, 150 100, 155 95 C158 92, 160 94, 158 98 C155 105, 145 115, 135 120"
            fill="url(#rooBody)"
            className="roo-arm-right"
          />
          {/* Wave hand */}
          <circle cx="156" cy="94" r="5" fill="url(#rooBelly)" className="roo-hand" />
        </g>

        {/* Head */}
        <g className="roo-head">
          {/* Head shape */}
          <ellipse cx="100" cy="60" rx="30" ry="28" fill="url(#rooBody)" />

          {/* Left ear */}
          <path
            d="M78 42 C74 25, 70 12, 72 6 C74 2, 80 4, 82 10 C85 18, 84 32, 82 42"
            fill="url(#rooEar)"
            className="roo-ear-left"
          />
          <path
            d="M79 38 C77 26, 74 16, 75 10 C76 8, 79 9, 80 14 C82 20, 81 30, 80 38"
            fill="url(#rooBelly)"
            opacity="0.4"
          />

          {/* Right ear */}
          <path
            d="M122 42 C126 25, 130 12, 128 6 C126 2, 120 4, 118 10 C115 18, 116 32, 118 42"
            fill="url(#rooEar)"
            className="roo-ear-right"
          />
          <path
            d="M121 38 C123 26, 126 16, 125 10 C124 8, 121 9, 120 14 C118 20, 119 30, 120 38"
            fill="url(#rooBelly)"
            opacity="0.4"
          />

          {/* Face */}
          <g className="roo-face">
            {/* Eyes */}
            <g className="roo-eyes">
              <ellipse cx="90" cy="56" rx="5" ry="5.5" fill="white" />
              <ellipse cx="110" cy="56" rx="5" ry="5.5" fill="white" />
              <circle cx="91" cy="55" r="3" fill="#0f172a" className="roo-pupil-left" />
              <circle cx="111" cy="55" r="3" fill="#0f172a" className="roo-pupil-right" />
              <circle cx="92.5" cy="53.5" r="1.2" fill="white" />
              <circle cx="112.5" cy="53.5" r="1.2" fill="white" />
            </g>

            {/* Nose */}
            <ellipse cx="100" cy="65" rx="5" ry="3.5" fill="#0d9488" />
            <ellipse cx="100" cy="64.5" rx="2" ry="1.2" fill="rgba(255,255,255,0.3)" />

            {/* Mouth - friendly smile */}
            <path
              d="M93 70 C96 74, 104 74, 107 70"
              stroke="#0d9488"
              strokeWidth="1.8"
              fill="none"
              strokeLinecap="round"
            />

            {/* Cheek blush */}
            <ellipse cx="82" cy="64" rx="5" ry="3" fill="rgba(248,113,113,0.2)" />
            <ellipse cx="118" cy="64" rx="5" ry="3" fill="rgba(248,113,113,0.2)" />
          </g>
        </g>

        {/* Sparkle effects */}
        <g className="roo-sparkles">
          <path
            d="M155 70 L157 66 L159 70 L163 72 L159 74 L157 78 L155 74 L151 72Z"
            fill="#fbbf24"
            className="roo-sparkle roo-sparkle-1"
          />
          <path
            d="M42 90 L44 87 L46 90 L49 91.5 L46 93 L44 96 L42 93 L39 91.5Z"
            fill="#38bdf8"
            className="roo-sparkle roo-sparkle-2"
          />
          <path
            d="M140 40 L141.5 37 L143 40 L146 41.5 L143 43 L141.5 46 L140 43 L137 41.5Z"
            fill="#a78bfa"
            className="roo-sparkle roo-sparkle-3"
          />
        </g>
      </svg>

      {showLabel && (
        <span className="roo-mascot-name">Roo</span>
      )}
    </div>
  )
}
