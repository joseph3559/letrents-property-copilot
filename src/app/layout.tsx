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
      <body>{children}</body>
    </html>
  );
}
