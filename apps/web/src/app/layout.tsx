import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Saskatoon Tee Times',
  description:
    'Saskatoon Tee Times aggregates all the tee times in Saskatoon and displays them in one place.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
