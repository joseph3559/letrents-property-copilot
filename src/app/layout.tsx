import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LETRENTS Property Copilot',
  description: 'From property complaints to intelligent action.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* suppressHydrationWarning: browser extensions (e.g. Grammarly) inject
          data-* attributes into <body> before React hydrates. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
