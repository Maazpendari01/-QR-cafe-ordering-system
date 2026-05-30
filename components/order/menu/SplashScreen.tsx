'use client'

import { useEffect, useState } from 'react'

interface Props {
  tableName: string
  onComplete: () => void
}

export default function SplashScreen({ tableName, onComplete }: Props) {
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in')

  useEffect(() => {
    // After 4 seconds, start fade-out
    const timer = setTimeout(() => {
      setPhase('out')
      setTimeout(onComplete, 600)
    }, 4000)
    return () => clearTimeout(timer)
  }, [onComplete])

  const handleExplore = () => {
    setPhase('out')
    setTimeout(onComplete, 600)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#13100d',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: phase === 'out' ? 0 : 1,
        transition: phase === 'out' ? 'opacity 0.6s ease' : 'none',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes splashGlowPulse {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.08); }
        }
        @keyframes splashRiseIn {
          from { opacity: 0; transform: translateY(28px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes splashFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes steamRise1 {
          0% { transform: translateY(0) scaleX(1); opacity: 0.5; }
          50% { transform: translateY(-18px) scaleX(1.3); opacity: 0.25; }
          100% { transform: translateY(-36px) scaleX(0.9); opacity: 0; }
        }
        @keyframes steamRise2 {
          0% { transform: translateY(0) scaleX(1); opacity: 0.4; }
          50% { transform: translateY(-22px) scaleX(0.8); opacity: 0.2; }
          100% { transform: translateY(-44px) scaleX(1.1); opacity: 0; }
        }
        @keyframes steamRise3 {
          0% { transform: translateY(0) scaleX(1); opacity: 0.45; }
          50% { transform: translateY(-16px) scaleX(1.2); opacity: 0.22; }
          100% { transform: translateY(-32px) scaleX(0.85); opacity: 0; }
        }
        @keyframes dividerExpand {
          from { width: 0; opacity: 0; }
          to { width: 48px; opacity: 1; }
        }
        @keyframes tableTagSlide {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes ctaPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(200,169,110,0.28); }
          50% { box-shadow: 0 0 0 10px rgba(200,169,110,0); }
        }
        .splash-brand {
          animation: splashRiseIn 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.3s both;
        }
        .splash-tagline {
          animation: splashFadeIn 0.8s ease 1.1s both;
        }
        .splash-divider {
          animation: dividerExpand 0.7s ease 1.5s both;
        }
        .splash-table {
          animation: tableTagSlide 0.7s cubic-bezier(0.22, 1, 0.36, 1) 1.8s both;
        }
        .splash-cta {
          animation: splashFadeIn 0.8s ease 2.4s both;
        }
      `}</style>

      {/* Ambient radial glow — main */}
      <div
        style={{
          position: 'absolute',
          top: '38%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 380,
          height: 380,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(200,169,110,0.18) 0%, rgba(200,169,110,0.05) 50%, transparent 70%)',
          animation: 'splashGlowPulse 3.5s ease-in-out infinite',
        }}
      />
      {/* Glow secondary — bottom warm */}
      <div
        style={{
          position: 'absolute',
          bottom: '-60px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 300,
          height: 200,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(200,169,110,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Content */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>

        {/* Coffee Cup SVG with Steam */}
        <div
          className="splash-brand"
          style={{ marginBottom: 28, position: 'relative', width: 72, height: 80 }}
        >
          {/* Steam paths */}
          <svg
            style={{ position: 'absolute', top: -30, left: '50%', transform: 'translateX(-50%)', overflow: 'visible' }}
            width="50"
            height="32"
            viewBox="0 0 50 32"
          >
            <path
              d="M12 28 C12 20, 18 18, 14 10"
              stroke="rgba(200,169,110,0.6)"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              style={{ animation: 'steamRise1 2.2s ease-in-out infinite' }}
            />
            <path
              d="M25 28 C22 18, 30 14, 26 6"
              stroke="rgba(200,169,110,0.5)"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              style={{ animation: 'steamRise2 2.6s ease-in-out 0.4s infinite' }}
            />
            <path
              d="M38 28 C40 20, 34 16, 38 8"
              stroke="rgba(200,169,110,0.55)"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              style={{ animation: 'steamRise3 2.4s ease-in-out 0.8s infinite' }}
            />
          </svg>

          {/* Cup SVG */}
          <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
            {/* Cup body */}
            <path
              d="M12 22 L16 60 Q16 64 20 64 L52 64 Q56 64 56 60 L60 22 Z"
              fill="rgba(200,169,110,0.1)"
              stroke="rgba(200,169,110,0.35)"
              strokeWidth="1.5"
            />
            {/* Handle */}
            <path
              d="M56 32 Q68 32 68 44 Q68 56 56 56"
              fill="none"
              stroke="rgba(200,169,110,0.3)"
              strokeWidth="1.5"
            />
            {/* Coffee surface */}
            <ellipse cx="36" cy="22" rx="24" ry="5" fill="rgba(200,169,110,0.12)" stroke="rgba(200,169,110,0.25)" strokeWidth="1" />
            {/* Saucer */}
            <ellipse cx="36" cy="66" rx="26" ry="4" fill="rgba(200,169,110,0.08)" stroke="rgba(200,169,110,0.2)" strokeWidth="1" />
          </svg>
        </div>

        {/* Brew & Co */}
        <h1
          className="splash-brand"
          style={{
            fontFamily: 'Georgia, serif',
            fontSize: 42,
            fontWeight: 400,
            color: '#c8a96e',
            letterSpacing: '0.08em',
            lineHeight: 1,
            marginBottom: 10,
          }}
        >
          Brew & Co
        </h1>

        {/* Tagline */}
        <p
          className="splash-tagline"
          style={{
            fontFamily: 'Georgia, serif',
            fontSize: 13,
            fontStyle: 'italic',
            color: 'rgba(240,235,227,0.45)',
            letterSpacing: '0.12em',
            marginBottom: 20,
          }}
        >
          crafted with care, served with soul
        </p>

        {/* Divider */}
        <div
          className="splash-divider"
          style={{
            height: 1,
            width: 48,
            background: 'linear-gradient(90deg, transparent, rgba(200,169,110,0.5), transparent)',
            marginBottom: 20,
          }}
        />

        {/* Table badge */}
        <div
          className="splash-table"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '7px 16px',
            borderRadius: 100,
            background: 'rgba(200,169,110,0.06)',
            border: '1px solid rgba(200,169,110,0.15)',
            marginBottom: 40,
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#c8a96e',
              opacity: 0.7,
            }}
          />
          <span
            style={{
              fontSize: 12,
              color: 'rgba(240,235,227,0.6)',
              letterSpacing: '0.06em',
              fontFamily: 'Georgia, serif',
            }}
          >
            You&apos;re at{' '}
            <span style={{ color: '#c8a96e', fontWeight: 600 }}>{tableName}</span>
          </span>
        </div>

        {/* CTA Button */}
        <button
          className="splash-cta"
          onClick={handleExplore}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 32px',
            borderRadius: 100,
            background: 'linear-gradient(135deg, #c8a96e 0%, #e8c584 50%, #c8a96e 100%)',
            border: 'none',
            cursor: 'pointer',
            animation: 'splashFadeIn 0.8s ease 2.4s both, ctaPulse 2.5s ease 3s infinite',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#13100d',
              letterSpacing: '0.06em',
              fontFamily: 'Georgia, serif',
            }}
          >
            Explore Menu
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#13100d" strokeWidth="2.5">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Bottom text */}
      <p
        className="splash-tagline"
        style={{
          position: 'absolute',
          bottom: 32,
          fontSize: 11,
          color: 'rgba(240,235,227,0.18)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        Scan · Order · Enjoy
      </p>
    </div>
  )
}
