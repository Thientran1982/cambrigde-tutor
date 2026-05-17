// src/app/api/extract-text/route.ts
// Extract text from uploaded PDF or text files for chat attachment

import { NextRequest } from 'next/server';
import pdf from 'pdf-parse';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }

    const filename = file.name.toLowerCase();

    // PDF extraction
    if (file.type === 'application/pdf' || filename.endsWith('.pdf')) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const parsed = await pdf(buffer);
      const text = parsed.text
        .replace(/\x00/g, '')
        .replace(/\f/g, '\n')
        .replace(/[ \t]{4,}/g, '  ')
        .replace(/\n{4,}/g, '\n\n')
        .trim();

      if (text.length < 20) {
        return Response.json(
          { error: 'Could not extract text — this may be a scanned (image-only) PDF.' },
          { status: 422 }
        );
      }

      return Response.json({ text, pages: parsed.numpages, filename: file.name });
    }

    // Plain text / code files
    const textTypes = ['text/plain', 'text/markdown', 'text/csv', 'application/json',
                       'text/html', 'text/css', 'text/javascript', 'application/javascript',
                       'text/x-python', 'application/x-python'];
    const textExts = /\.(txt|md|csv|json|py|js|ts|html|css|xml|yaml|yml)$/i;

    if (textTypes.includes(file.type) || textExts.test(filename)) {
      const text = await file.text();
      return Response.json({ text: text.trim(), pages: 1, filename: file.name });
    }

    return Response.json(
      { error: `Unsupported file type: ${file.type || filename.split('.').pop()}` },
      { status: 415 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('extract-text error:', message);
    return Response.json({ error: message }, { status: 500 });
  }
}
