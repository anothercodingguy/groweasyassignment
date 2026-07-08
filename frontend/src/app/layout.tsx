import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GrowEasy CRM — AI CSV Lead Importer',
  description: 'Intelligently parse, map, and import lead records from any custom CSV layout into GrowEasy CRM format using AI.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
