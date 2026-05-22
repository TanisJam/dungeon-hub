import type { Metadata } from 'next';
import { Bricolage_Grotesque, Manrope } from 'next/font/google';
import './globals.css';
import { TweaksPanel } from '@/components/dev/tweaks-panel';

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  axes: ['opsz'],
  variable: '--font-bricolage',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Dungeon Hub',
  description: 'D&D campaign manager',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-aesthetic="modern" data-palette="crepusculo">
      <body
        className={`${bricolage.variable} ${manrope.variable} min-h-screen bg-paper text-ink font-sans antialiased`}
      >
        {children}
        {process.env.NODE_ENV !== 'production' && <TweaksPanel />}
      </body>
    </html>
  );
}
