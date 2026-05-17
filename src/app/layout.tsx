import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Cambridge 9709 AI Tutor | A* Exam Coach',
  description: 'Elite Cambridge A-Level Mathematics tutor powered by Claude AI + RAG',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}