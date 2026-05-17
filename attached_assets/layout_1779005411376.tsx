import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cambridge 9709 AI Tutor | A* Exam Coach',
  description: 'Elite Cambridge International AS & A Level Mathematics (9709) AI Tutor powered by RAG — official syllabus, past papers, and mark schemes.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
