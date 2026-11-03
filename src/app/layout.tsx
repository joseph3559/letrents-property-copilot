import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://copilot.letrents.com'),
  title: {
    default: 'LETRENTS Property Copilot — From Complaints to Action',
    template: '%s · LETRENTS Property Copilot',
  },
  description:
    'AI operations assistant for property managers. Report maintenance by text, photo, or voice — the Copilot pulls real records, analyzes the problem with Meta AI, and prepares approvals. You stay in control.',
  keywords: [
    'LETRENTS',
    'Property Copilot',
    'property management',
    'maintenance automation',
    'Meta AI',
    'Muse Spark',
    'Nairobi rentals',
  ],
  authors: [{ name: 'LETRENTS' }],
  creator: 'LETRENTS',
  publisher: 'LETRENTS',
  robots: { index: true, follow: true },
  icons: { icon: '/favicon.svg' },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'LETRENTS Property Copilot',
    title: 'LETRENTS Property Copilot — From Complaints to Action',
    description:
      'Describe it, speak it, or photograph it. The Copilot pulls real records, analyzes with Meta AI, and prepares approvals — you approve, it executes.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LETRENTS Property Copilot — From Complaints to Action',
    description:
      'AI operations assistant for property managers, powered by Meta AI. Complaints to action with human approval at every step.',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#011C47' },
  ],
};

const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('copilot-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      {/* suppressHydrationWarning: browser extensions (e.g. Grammarly) inject
          data-* attributes into <body> before React hydrates. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
