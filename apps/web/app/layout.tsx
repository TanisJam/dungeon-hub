import type { Metadata } from 'next';
import {
  Inter,
  JetBrains_Mono,
  M_PLUS_Rounded_1c,
  Noto_Serif_Georgian,
} from 'next/font/google';
import { Suspense } from 'react';
import './globals.css';
import { NavProgress } from '@/components/layout/nav-progress';

const notoSerifGeorgian = Noto_Serif_Georgian({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-serif-georgian',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const mplusRounded = M_PLUS_Rounded_1c({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-mplus-rounded',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Dungeon Hub',
  description: 'D&D campaign manager',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-aesthetic="obsidian" data-palette="obsidian">
      <body
        className={`${notoSerifGeorgian.variable} ${inter.variable} ${mplusRounded.variable} ${jetbrainsMono.variable} min-h-screen bg-paper text-ink font-sans antialiased`}
      >
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
