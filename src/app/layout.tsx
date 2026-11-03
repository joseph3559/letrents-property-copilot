import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LETRENTS Property Copilot',
  description: 'From property complaints to intelligent action.',
  icons: { icon: '/favicon.svg' },
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
