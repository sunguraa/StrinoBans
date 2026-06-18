import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter, Fraunces } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'StrinoBans',
  description: 'Serverless P2P map pick-ban veto tool for Strinova',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          // Prevent FOUC: apply theme before paint. Default to dark.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('strinobans-theme');if(!t)t='dark';document.documentElement.className=t;}catch(e){document.documentElement.className='dark';}})()`,
          }}
        />
      </head>
      <body
        className={`${inter.variable} ${fraunces.variable} font-sans h-screen overflow-hidden bg-background text-foreground antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
