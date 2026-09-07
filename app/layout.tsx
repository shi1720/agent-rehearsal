import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Agent Rehearsal — The agent failure lab',
  description:
    'Break your agent’s tools before production does. A local-first chaos lab with deterministic policy comparisons and a zero-dependency Python SDK.',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: 'Agent Rehearsal — The agent failure lab',
    description:
      'Break tools. Compare recovery. Make agent failures reproducible.',
    type: 'website',
  },
  metadataBase: new URL('https://agent-rehearsal.sg127977958.chatgpt.site'),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
