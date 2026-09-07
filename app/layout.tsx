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
  title: 'Agent Rehearsal — Tool reliability, examined.',
  description:
    'Compare retry policies against reproducible tool failures. Inspect Python tool-call traces locally, with no accounts or API keys.',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: 'Agent Rehearsal — Tool reliability, examined.',
    description:
      'A retry policy simulator and trace inspector for agent developers.',
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
