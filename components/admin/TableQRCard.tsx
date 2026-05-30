'use client'
import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

interface Props {
  tableId: string
  tableName: string
  onClose: () => void
}

export default function TableQRCard({ tableId, tableName, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [menuUrl, setMenuUrl] = useState('')

  useEffect(() => {
    // Works for both localhost testing and production
    const base = typeof window !== 'undefined'
      ? window.location.origin          // localhost:3000 in dev, brewandco.vercel.app in prod
      : 'https://brewandco.vercel.app'
    const url = `${base}/menu/${tableId}`
    setMenuUrl(url)

    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, url, {
        width: 200,
        margin: 2,
        color: {
          dark: '#1a0f00',   // dark coffee brown dots
          light: '#fdf6e3',  // warm cream background
        },
      })
    }
  }, [tableId])

  const handleDownload = () => {
    // Build a full print-ready card as PNG using offscreen canvas
    const offscreen = document.createElement('canvas')
    offscreen.width  = 400
    offscreen.height = 520
    const ctx = offscreen.getContext('2d')!

    // Card background
    ctx.fillStyle = '#fdf6e3'
    ctx.fillRect(0, 0, 400, 520)

    // Top amber strip
    const grad = ctx.createLinearGradient(0, 0, 400, 0)
    grad.addColorStop(0, '#c8a96e')
    grad.addColorStop(1, '#e8c584')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 400, 8)

    // Bottom amber strip
    ctx.fillStyle = grad
    ctx.fillRect(0, 512, 400, 8)

    // Coffee cup emoji area
    ctx.font = '48px serif'
    ctx.textAlign = 'center'
    ctx.fillText('☕', 200, 80)

    // Brew & Co
    ctx.fillStyle = '#1a0f00'
    ctx.font = 'bold 32px Georgia, serif'
    ctx.textAlign = 'center'
    ctx.fillText('Brew & Co', 200, 125)

    // Tagline
    ctx.fillStyle = '#c8a96e'
    ctx.font = '14px system-ui, sans-serif'
    ctx.fillText('Scan to order from your seat', 200, 150)

    // Divider line
    ctx.strokeStyle = 'rgba(200,169,110,0.4)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(60, 168)
    ctx.lineTo(340, 168)
    ctx.stroke()

    // Draw QR code from the canvas ref
    if (canvasRef.current) {
      ctx.drawImage(canvasRef.current, 100, 180, 200, 200)
    }

    // QR border
    ctx.strokeStyle = 'rgba(200,169,110,0.5)'
    ctx.lineWidth = 2
    ctx.strokeRect(98, 178, 204, 204)

    // Table name
    ctx.fillStyle = '#1a0f00'
    ctx.font = 'bold 22px Georgia, serif'
    ctx.textAlign = 'center'
    ctx.fillText(tableName, 200, 420)

    // URL hint
    ctx.fillStyle = '#9b8878'
    ctx.font = '10px monospace'
    ctx.fillText(menuUrl, 200, 445)

    // Powered by
    ctx.fillStyle = '#c8a96e'
    ctx.font = '11px system-ui'
    ctx.fillText('brewandco.vercel.app', 200, 500)

    // Download
    const link = document.createElement('a')
    link.download = `qr-${tableName.replace(/\s+/g, '-').toLowerCase()}.png`
    link.href = offscreen.toDataURL('image/png')
    link.click()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.75)',
          zIndex: 100, backdropFilter: 'blur(4px)',
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        zIndex: 101,
        background: '#1a1410',
        border: '1px solid rgba(200,169,110,0.25)',
        borderRadius: 16,
        padding: 32,
        width: 340,
        textAlign: 'center',
      }}>

        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 14, right: 14,
            background: 'rgba(200,169,110,0.1)',
            border: '1px solid rgba(200,169,110,0.2)',
            color: '#c8a96e', borderRadius: 6,
            width: 28, height: 28, cursor: 'pointer', fontSize: 14,
          }}
        >×</button>

        {/* Preview card */}
        <div style={{
          background: '#fdf6e3',
          borderRadius: 12,
          padding: '24px 20px',
          marginBottom: 20,
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
          border: '4px solid',
          borderImage: 'linear-gradient(135deg,#c8a96e,#e8c584) 1',
        }}>
          <div style={{ fontSize: 36, marginBottom: 4 }}>☕</div>
          <div style={{
            fontSize: 22, fontWeight: 700, color: '#1a0f00',
            fontFamily: 'Georgia, serif', marginBottom: 2,
          }}>
            Brew & Co
          </div>
          <div style={{ fontSize: 11, color: '#c8a96e', marginBottom: 14 }}>
            Scan to order from your seat
          </div>

          {/* QR Code */}
          <div style={{
            display: 'inline-block',
            padding: 8,
            background: '#fdf6e3',
            border: '2px solid rgba(200,169,110,0.4)',
            borderRadius: 8,
            marginBottom: 14,
          }}>
            <canvas ref={canvasRef} style={{ display: 'block' }} />
          </div>

          <div style={{
            fontSize: 16, fontWeight: 700,
            color: '#1a0f00', fontFamily: 'Georgia, serif',
            marginBottom: 4,
          }}>
            {tableName}
          </div>
          <div style={{ fontSize: 9, color: '#9b8878', wordBreak: 'break-all' }}>
            {menuUrl}
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleDownload}
            style={{
              flex: 1,
              background: 'linear-gradient(135deg,#c8a96e,#e8c584)',
              color: '#0e0b08', border: 'none', borderRadius: 8,
              padding: '11px 0', cursor: 'pointer',
              fontWeight: 700, fontSize: 14,
            }}
          >
            ⬇ Download PNG
          </button>
          <button
            onClick={() => window.print()}
            style={{
              flex: 1,
              background: 'rgba(200,169,110,0.1)',
              color: '#c8a96e',
              border: '1px solid rgba(200,169,110,0.2)',
              borderRadius: 8, padding: '11px 0',
              cursor: 'pointer', fontSize: 14,
            }}
          >
            🖨 Print
          </button>
        </div>

        <div style={{ fontSize: 11, color: '#6b5c47', marginTop: 12 }}>
          Download → print → cut → stick on table
        </div>
      </div>
    </>
  )
}
