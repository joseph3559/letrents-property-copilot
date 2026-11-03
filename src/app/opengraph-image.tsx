import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'LETRENTS Property Copilot — from complaints to action';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px 90px',
          backgroundColor: '#011C47',
          backgroundImage: 'radial-gradient(90% 90% at 85% 15%, rgba(35,162,199,0.35), transparent 60%)',
          color: '#ffffff',
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 34,
            fontWeight: 800,
            letterSpacing: 8,
            color: '#23A2C7',
          }}
        >
          LETRENTS
        </div>
        <div style={{ fontSize: 92, fontWeight: 900, letterSpacing: -2, marginTop: 12 }}>
          Property Copilot
        </div>
        <div style={{ fontSize: 36, marginTop: 16, color: 'rgba(255,255,255,0.82)' }}>
          From complaints to action.
        </div>
        <div style={{ display: 'flex', marginTop: 44 }}>
          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: '#ffffff',
              backgroundColor: '#0264FD',
              borderRadius: 999,
              padding: '12px 30px',
            }}
          >
            Powered by Meta AI · Spark
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
