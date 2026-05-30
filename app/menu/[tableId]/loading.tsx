export default function MenuLoading() {
  return (
    <div style={{ minHeight: '100vh', background: '#13100d', paddingBottom: 80 }}>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -600px 0; }
          100% { background-position: 600px 0; }
        }
        .shimmer {
          background: linear-gradient(
            90deg,
            rgba(200,169,110,0.04) 0%,
            rgba(200,169,110,0.1) 40%,
            rgba(200,169,110,0.04) 80%
          );
          background-size: 600px 100%;
          animation: shimmer 1.6s ease-in-out infinite;
        }
      `}</style>

      {/* Header skeleton */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid rgba(200,169,110,0.08)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div className="shimmer" style={{ width: 80, height: 10, borderRadius: 6, marginBottom: 6 }} />
          <div className="shimmer" style={{ width: 120, height: 22, borderRadius: 8 }} />
        </div>
        <div className="shimmer" style={{ width: 36, height: 36, borderRadius: '50%' }} />
      </div>

      {/* Search skeleton */}
      <div style={{ padding: '16px 20px 0' }}>
        <div className="shimmer" style={{ height: 44, borderRadius: 14 }} />
      </div>

      {/* Filter pills skeleton */}
      <div style={{ padding: '12px 20px', display: 'flex', gap: 8 }}>
        {[60, 80, 56, 100].map((w, i) => (
          <div key={i} className="shimmer" style={{ width: w, height: 32, borderRadius: 100, flexShrink: 0 }} />
        ))}
      </div>

      {/* Hero skeleton */}
      <div style={{ padding: '16px 20px 20px', borderBottom: '1px solid rgba(200,169,110,0.06)' }}>
        <div className="shimmer" style={{ width: 100, height: 10, borderRadius: 6, marginBottom: 10 }} />
        <div className="shimmer" style={{ width: '60%', height: 32, borderRadius: 10, marginBottom: 6 }} />
        <div className="shimmer" style={{ width: '40%', height: 32, borderRadius: 10, marginBottom: 12 }} />
        <div className="shimmer" style={{ width: 100, height: 11, borderRadius: 6, marginBottom: 20 }} />

        {/* Category cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[0,1,2,3].map(i => (
            <div key={i} className="shimmer" style={{ height: 90, borderRadius: 16 }} />
          ))}
        </div>
      </div>

      {/* Category section */}
      <div style={{ padding: '24px 20px 0' }}>
        {/* Section header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div className="shimmer" style={{ width: 28, height: 28, borderRadius: '50%' }} />
          <div>
            <div className="shimmer" style={{ width: 80, height: 16, borderRadius: 6, marginBottom: 4 }} />
            <div className="shimmer" style={{ width: 55, height: 10, borderRadius: 4 }} />
          </div>
        </div>

        {/* Item rows */}
        {[0,1,2,3].map(i => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 0',
            borderBottom: '1px solid rgba(200,169,110,0.05)',
            gap: 12,
          }}>
            {/* Left: text */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div className="shimmer" style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0 }} />
                <div className="shimmer" style={{ width: `${120 + i * 20}px`, height: 14, borderRadius: 6 }} />
              </div>
              <div className="shimmer" style={{ width: '80%', height: 10, borderRadius: 4, marginBottom: 4, marginLeft: 22 }} />
              <div className="shimmer" style={{ width: '55%', height: 10, borderRadius: 4, marginBottom: 10, marginLeft: 22 }} />
              <div className="shimmer" style={{ width: 44, height: 14, borderRadius: 6, marginLeft: 22 }} />
            </div>

            {/* Right: image + button */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <div className="shimmer" style={{ width: 86, height: 86, borderRadius: 16 }} />
              <div className="shimmer" style={{ width: 86, height: 32, borderRadius: 10 }} />
            </div>
          </div>
        ))}
      </div>

      {/* Second category section */}
      <div style={{ padding: '24px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div className="shimmer" style={{ width: 28, height: 28, borderRadius: '50%' }} />
          <div>
            <div className="shimmer" style={{ width: 110, height: 16, borderRadius: 6, marginBottom: 4 }} />
            <div className="shimmer" style={{ width: 55, height: 10, borderRadius: 4 }} />
          </div>
        </div>
        {[0,1,2].map(i => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 0',
            borderBottom: '1px solid rgba(200,169,110,0.05)',
            gap: 12,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div className="shimmer" style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0 }} />
                <div className="shimmer" style={{ width: `${100 + i * 30}px`, height: 14, borderRadius: 6 }} />
              </div>
              <div className="shimmer" style={{ width: '70%', height: 10, borderRadius: 4, marginBottom: 10, marginLeft: 22 }} />
              <div className="shimmer" style={{ width: 44, height: 14, borderRadius: 6, marginLeft: 22 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <div className="shimmer" style={{ width: 86, height: 86, borderRadius: 16 }} />
              <div className="shimmer" style={{ width: 86, height: 32, borderRadius: 10 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
