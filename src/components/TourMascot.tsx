import { useEffect, useState } from 'react'
import type { MascotMood } from '../lib/tour'

interface TourMascotProps {
  mood?: MascotMood
  message?: string
  position?: 'left' | 'right'
  visible?: boolean
}

export default function TourMascot({
  mood = 'wave',
  message,
  position = 'left',
  visible = true
}: TourMascotProps) {
  const [isAnimating, setIsAnimating] = useState(false)
  const [showMessage, setShowMessage] = useState(false)

  useEffect(() => {
    if (visible) {
      setIsAnimating(true)
      const timer = setTimeout(() => setShowMessage(true), 300)
      return () => clearTimeout(timer)
    } else {
      setShowMessage(false)
      setIsAnimating(false)
    }
  }, [visible, mood])

  if (!visible) return null

  return (
    <div
      className={`tour-mascot tour-mascot-${position} ${isAnimating ? 'tour-mascot-enter' : ''}`}
      aria-hidden="true"
    >
      {/* Sparkle Character */}
      <div className="tour-mascot-character">
        <svg
          viewBox="0 0 120 140"
          className="tour-mascot-svg"
          aria-hidden="true"
        >
          {/* Glow effect */}
          <defs>
            <filter id="mascot-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <linearGradient id="sparkle-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="50%" stopColor="#a78bfa" />
              <stop offset="100%" stopColor="#f472b6" />
            </linearGradient>
            <linearGradient id="body-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#93c5fd" />
              <stop offset="100%" stopColor="#60a5fa" />
            </linearGradient>
          </defs>

          {/* Body - Cute drop/bubble shape */}
          <ellipse
            cx="60" cy="70" rx="35" ry="40"
            fill="url(#body-gradient)"
            filter="url(#mascot-glow)"
            className="mascot-body"
          />

          {/* Face highlight */}
          <ellipse
            cx="50" cy="60" rx="15" ry="20"
            fill="rgba(255,255,255,0.3)"
          />

          {/* Eyes */}
          <g className={`mascot-eyes mascot-eyes-${mood}`}>
            {mood === 'celebrate' || mood === 'excited' ? (
              <>
                {/* Happy closed eyes */}
                <path d="M45 62 Q50 58 55 62" stroke="#1e3a5f" strokeWidth="3" fill="none" strokeLinecap="round"/>
                <path d="M65 62 Q70 58 75 62" stroke="#1e3a5f" strokeWidth="3" fill="none" strokeLinecap="round"/>
              </>
            ) : (
              <>
                {/* Open eyes */}
                <ellipse cx="48" cy="65" rx="6" ry="7" fill="#1e3a5f"/>
                <ellipse cx="72" cy="65" rx="6" ry="7" fill="#1e3a5f"/>
                {/* Eye shine */}
                <circle cx="50" cy="63" r="2" fill="white"/>
                <circle cx="74" cy="63" r="2" fill="white"/>
              </>
            )}
          </g>

          {/* Mouth */}
          <g className="mascot-mouth">
            {mood === 'celebrate' || mood === 'wave' ? (
              <path d="M52 78 Q60 86 68 78" stroke="#1e3a5f" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
            ) : mood === 'think' ? (
              <circle cx="60" cy="80" r="3" fill="#1e3a5f"/>
            ) : (
              <path d="M50 78 Q60 84 70 78" stroke="#1e3a5f" strokeWidth="2" fill="none" strokeLinecap="round"/>
            )}
          </g>

          {/* Blush */}
          <ellipse cx="40" cy="75" rx="5" ry="3" fill="rgba(244, 114, 182, 0.4)"/>
          <ellipse cx="80" cy="75" rx="5" ry="3" fill="rgba(244, 114, 182, 0.4)"/>

          {/* Sparkles around character */}
          <g className="mascot-sparkles">
            <polygon points="15,30 18,38 26,38 20,43 22,51 15,46 8,51 10,43 4,38 12,38" fill="url(#sparkle-gradient)" className="sparkle sparkle-1"/>
            <polygon points="100,25 102,30 108,30 104,34 105,40 100,36 95,40 96,34 92,30 98,30" fill="url(#sparkle-gradient)" className="sparkle sparkle-2"/>
            <polygon points="25,100 27,104 32,104 28,107 29,112 25,109 21,112 22,107 18,104 23,104" fill="url(#sparkle-gradient)" className="sparkle sparkle-3"/>
            <polygon points="95,95 97,99 102,99 98,102 99,107 95,104 91,107 92,102 88,99 93,99" fill="url(#sparkle-gradient)" className="sparkle sparkle-4"/>
          </g>

          {/* Arms based on mood */}
          <g className={`mascot-arms mascot-arms-${mood}`}>
            {mood === 'wave' && (
              <>
                <path d="M25 70 Q15 60 20 45" stroke="url(#body-gradient)" strokeWidth="8" fill="none" strokeLinecap="round" className="arm-wave"/>
                <path d="M95 70 Q105 75 100 85" stroke="url(#body-gradient)" strokeWidth="8" fill="none" strokeLinecap="round"/>
              </>
            )}
            {mood === 'point' && (
              <>
                <path d="M25 70 Q15 75 10 80" stroke="url(#body-gradient)" strokeWidth="8" fill="none" strokeLinecap="round"/>
                <path d="M95 70 Q115 65 125 55" stroke="url(#body-gradient)" strokeWidth="8" fill="none" strokeLinecap="round" className="arm-point"/>
              </>
            )}
            {mood === 'celebrate' && (
              <>
                <path d="M25 70 Q10 50 15 35" stroke="url(#body-gradient)" strokeWidth="8" fill="none" strokeLinecap="round" className="arm-celebrate-left"/>
                <path d="M95 70 Q110 50 105 35" stroke="url(#body-gradient)" strokeWidth="8" fill="none" strokeLinecap="round" className="arm-celebrate-right"/>
              </>
            )}
            {(mood === 'think' || mood === 'excited') && (
              <>
                <path d="M25 70 Q15 80 20 90" stroke="url(#body-gradient)" strokeWidth="8" fill="none" strokeLinecap="round"/>
                <path d="M95 70 Q105 80 100 90" stroke="url(#body-gradient)" strokeWidth="8" fill="none" strokeLinecap="round"/>
              </>
            )}
          </g>

          {/* Cleaning bucket hat */}
          <g className="mascot-hat">
            <rect x="40" y="25" width="40" height="12" rx="2" fill="#3b82f6"/>
            <rect x="35" y="32" width="50" height="5" rx="2" fill="#2563eb"/>
            <ellipse cx="60" cy="25" rx="20" ry="4" fill="#60a5fa"/>
          </g>
        </svg>

        {/* Floating particles */}
        <div className="mascot-particles">
          <span className="particle particle-1"></span>
          <span className="particle particle-2"></span>
          <span className="particle particle-3"></span>
        </div>
      </div>

      {/* Speech bubble */}
      {message && showMessage && (
        <div className={`tour-mascot-bubble tour-mascot-bubble-${position}`}>
          <span className="tour-mascot-message">{message}</span>
          <div className="tour-mascot-bubble-tail"></div>
        </div>
      )}
    </div>
  )
}

export type { MascotMood, TourMascotProps }
