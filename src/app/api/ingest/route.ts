// src/app/api/ingest/route.ts
// Admin endpoint to upload and ingest Cambridge PDFs via web UI
// Protected by ADMIN_SECRET env var

import { NextRequest } from 'next/server';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import pdf from 'pdf-parse';

export const runtime = 'nodejs';
export const maxDuration = 120;

const openai   = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

const EMBED_MODEL = 'text-embedding-3-small';
const CHUNK_SIZE  = 500 * 4;
const OVERLAP     = 50  * 4;

function chunkText(text: string): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let i = 0;
  const wpc = Math.floor(CHUNK_SIZE / 5);
  const wpo = Math.floor(OVERLAP / 5);
  while (i < words.length) {
    const slice = words.slice(i, i + wpc).join(' ');
    if (slice.trim().length > 40) chunks.push(slice);
    i += wpc - wpo;
  }
  return chunks;
}

function detectTopic(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('integrat'))  return 'Integration';
  if (t.includes('differentiat')) return 'Differentiation';
  if (t.includes('binomial'))  return 'Binomial Theorem';
  if (t.includes('trigonometr') || t.includes(' sin ') || t.includes(' cos ')) return 'Trigonometry';
  if (t.includes('vector'))    return 'Vectors';
  if (t.includes('statistic') || t.includes('probability') || t.includes('distribution')) return 'Statistics';
  if (t.includes('kinematic') || t.includes('velocity')) return 'Kinematics';
  if (t.includes('complex number')) return 'Complex Numbers';
  if (t.includes('sequence') || t.includes('series')) return 'Sequences & Series';
  return 'General';
}

function detectDocType(filename: string): string {
  const f = filename.toLowerCase();
  if (f.includes('syllabus'))  return 'syllabus';
  if (f.includes('_ms_') || f.includes('mark'))   return 'mark_scheme';
  if (f.includes('specimen'))  return 'specimen';
  if (f.includes('_qp_') || f.includes('paper'))  return 'past_paper';
  return 'other';
}

function extractMeta(filename: string) {
  const m = filename.match(/(\d{4})_(s|w|m)(\d{2})_(?:qp|ms)_(\d+)/i);
  if (!m) return { year: 0, session: '', paper: '' };
  const sess = { s: 'May/June', w: 'Oct/Nov', m: 'Feb/Mar' } as Record<string, string>;
  return { year: 2000 + parseInt(m[3]), session: sess[m[2].toLowerCase()] || '', paper: m[4] };
}

async function ensureIndex(indexName: string) {
  const existing = await pinecone.listIndexes();
  const names = (existing.indexes || []).map((i: { name: string }) => i.name);
  if (!names.includes(indexName)) {
    await pinecone.createIndex({
      name: indexName,
      dimension: 1536,
      metric: 'cosine',
      spec: { serverless: { cloud: 'aws', region: 'us-east-1' } },
    });
    await new Promise(r => setTimeout(r, 8000));
  }
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-admin-secret');
  if (!process.env.ADMIN_SECRET) {
    return Response.json({ ok: false, error: 'ADMIN_SECRET not set on server' }, { status: 500 });
  }
  if (secret !== process.env.ADMIN_SECRET) {
    return Response.json({ ok: false, error: 'Wrong secret' }, { status: 401 });
  }
  return Response.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-admin-secret');
  if (!process.env.ADMIN_SECRET) {
    return Response.json({ error: 'ADMIN_SECRET environment variable is not set on the server' }, { status: 500 });
  }
  if (secret !== process.env.ADMIN_SECRET) {
    return Response.json({ error: 'Wrong admin secret — check the ADMIN_SECRET value in Replit Secrets' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    if (!files.length) {
      return Response.json({ error: 'No files provided' }, { status: 400 });
    }

    const indexName = process.env.PINECONE_INDEX_NAME || 'cambridge-9709';
    await ensureIndex(indexName);
    const index = pinecone.index(indexName);
    const results = [];

    for (const file of files) {
      const filename = file.name;
      const docType  = detectDocType(filename);
      const meta     = extractMeta(filename);

      const buffer = Buffer.from(await file.arrayBuffer());
      let text: string;
      try {
        const parsed = await pdf(buffer);
        text = parsed.text.replace(/\x00/g, '').replace(/\f/g, '\n').trim();
      } catch {
        results.push({ file: filename, status: 'error', reason: 'PDF parse failed' });
        continue;
      }

      if (text.length < 100) {
        results.push({ file: filename, status: 'skip', reason: 'Scanned/image PDF, no text' });
        continue;
      }

      const chunks = chunkText(text);
      let upserted = 0;

      for (let b = 0; b < chunks.length; b += 100) {
        const batch = chunks.slice(b, b + 100);
        const resp  = await openai.embeddings.create({ model: EMBED_MODEL, input: batch });
        const vectors = batch.map((chunk, i) => ({
          id: `${filename.replace('.pdf', '')}_chunk_${b + i}`,
          values: resp.data[i].embedding,
          metadata: {
            text:      chunk.substring(0, 2000),
            source:    filename,
            doc_type:  docType,
            topic:     detectTopic(chunk),
            year:      meta.year,
            session:   meta.session,
            paper:     meta.paper,
            chunk_index: b + i,
          },
        }));
        await index.upsert(vectors);
        upserted += vectors.length;
      }

      results.push({ file: filename, status: 'success', chunks: chunks.length, vectors: upserted });
    }

    return Response.json({ results, totalFiles: files.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
