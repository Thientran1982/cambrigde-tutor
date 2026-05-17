#!/usr/bin/env node
/**
 * Cambridge 9709 RAG — Ingestion Script
 * =======================================
 * Run once (or whenever you add new documents):
 *   npm run ingest
 *
 * Place your Cambridge PDFs in: ./cambridge-docs/
 *   cambridge-docs/
 *     syllabus/       9709_syllabus_2025-2027.pdf
 *     past-papers/    9709_s22_qp_11.pdf, 9709_w23_qp_12.pdf ...
 *     mark-schemes/   9709_s22_ms_11.pdf ...
 *     specimen/       9709_specimen_qp_1.pdf ...
 */
require('dotenv').config({ path: '.env.local' });
const fs   = require('fs');
const path = require('path');
const pdf  = require('pdf-parse');
const { Pinecone } = require('@pinecone-database/pinecone');
const OpenAI = require('openai');
const openai   = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
// ── Config ────────────────────────────────────────────────────────────────────
const DOCS_DIR        = path.join(__dirname, '..', 'cambridge-docs');
const CHUNK_TOKENS    = 500;   // target tokens per chunk
const CHUNK_OVERLAP   = 50;    // overlap tokens between chunks
const EMBED_MODEL     = 'text-embedding-3-small';
const EMBED_DIMS      = 1536;
const BATCH_SIZE      = 100;   // upsert batch size (Pinecone limit = 100)
const INDEX_NAME      = process.env.PINECONE_INDEX_NAME || 'cambridge-9709';
// ── Helpers ───────────────────────────────────────────────────────────────────
/** Rough token estimator: ~4 chars per token */
const estimateTokens = (text) => Math.ceil(text.length / 4);

/** Split text into overlapping chunks of ~CHUNK_TOKENS tokens */
function chunkText(text, source) {
  const words = text.split(/\s+/);
  const chunks = [];
  const wordsPerChunk = CHUNK_TOKENS * 4;   // ~4 chars/token, ~5 chars/word → ~words
  const wordsOverlap  = CHUNK_OVERLAP  * 4;
  let i = 0;

  while (i < words.length) {
    const slice = words.slice(i, i + wordsPerChunk).join(' ');
    if (slice.trim().length > 40) {          // skip tiny trailing slices
      chunks.push({ text: slice, start: i });
    }
    i += wordsPerChunk - wordsOverlap;
  }
  return chunks;
}
/** Detect doc type from filename / path */
function detectDocType(filePath) {
  const p = filePath.toLowerCase();
  if (p.includes('syllabus'))                  return 'syllabus';
  if (p.includes('mark-scheme') || p.includes('_ms_')) return 'mark_scheme';
  if (p.includes('specimen'))                  return 'specimen';
  if (p.includes('past-paper') || p.includes('_qp_')) return 'past_paper';
  return 'other';
}
/** Extract year + session from filename like 9709_s22_qp_11.pdf */
function extractMeta(filename) {
  const m = filename.match(/(\d{4})_(s|w|m)(\d{2})_(?:qp|ms)_(\d+)/i);
  if (!m) return { year: null, session: null, paper: null };
  const sessionMap = { s: 'May/June', w: 'Oct/Nov', m: 'Feb/Mar' };
  return {
    year:    2000 + parseInt(m[3]),
    session: sessionMap[m[2].toLowerCase()] || m[2],
    paper:   m[4],
  };
}
/** Detect topic from chunk text (simple keyword heuristic) */
function detectTopic(text) {
  const t = text.toLowerCase();
  if (t.includes('integrat'))              return 'Integration';
  if (t.includes('differentiat'))         return 'Differentiation';
  if (t.includes('binomial'))             return 'Binomial Theorem';
  if (t.includes('trigonometr') || t.includes('sin') || t.includes('cos')) return 'Trigonometry';
  if (t.includes('vector'))               return 'Vectors';
  if (t.includes('statistic') || t.includes('probability') || t.includes('distribution')) return 'Statistics';
  if (t.includes('kinematic') || t.includes('velocity') || t.includes('acceleration')) return 'Kinematics';
  if (t.includes('complex number'))       return 'Complex Numbers';
  if (t.includes('sequence') || t.includes('series')) return 'Sequences & Series';
  if (t.includes('coordinate') || t.includes('circle') || t.includes('parabola')) return 'Coordinate Geometry';
  if (t.includes('logarithm') || t.includes('exponential')) return 'Logarithms & Exponentials';
  return 'General';
}
/** Embed an array of strings, returns float32 vectors */
async function embedBatch(texts) {
  const resp = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: texts,
  });
  return resp.data.map(d => d.embedding);
}
/** Walk a directory recursively, return all PDF paths */
function walkPDFs(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkPDFs(full));
    else if (entry.name.toLowerCase().endsWith('.pdf')) results.push(full);
  }
  return results;
}
// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n Cambridge 9709 RAG — Ingestion Pipeline');
  console.log('==========================================\n');
  // 1. Ensure Pinecone index exists
  console.log('Connecting to Pinecone...');
  const existingIndexes = await pinecone.listIndexes();
  const indexExists = existingIndexes.indexes?.some(i => i.name === INDEX_NAME);
  if (!indexExists) {
    console.log(`  Creating index "${INDEX_NAME}" (dim=${EMBED_DIMS}, metric=cosine)...`);
    await pinecone.createIndex({
      name: INDEX_NAME,
      dimension: EMBED_DIMS,
      metric: 'cosine',
      spec: { serverless: { cloud: 'aws', region: 'us-east-1' } },
    });
    // Wait for index to be ready
    console.log('   Waiting for index to initialise (~30s)...');
    await new Promise(r => setTimeout(r, 35000));
  } else {
    console.log(`   Index "${INDEX_NAME}" already exists ✓`);
  }
  const index = pinecone.index(INDEX_NAME);
  // 2. Find all PDFs
  const pdfPaths = walkPDFs(DOCS_DIR);
  if (!pdfPaths.length) {
    console.error(`\n No PDFs found in ${DOCS_DIR}`);
    console.error('   Create the folder and add your Cambridge PDFs:\n');
    console.error('   cambridge-docs/');
    console.error('     syllabus/       ← 9709 Syllabus 2025-2027');
    console.error('     past-papers/    ← 9709_s22_qp_11.pdf etc.');
    console.error('     mark-schemes/   ← 9709_s22_ms_11.pdf etc.');
    console.error('     specimen/       ← Specimen papers\n');
    process.exit(1);
  }
  console.log(` Found ${pdfPaths.length} PDF(s) to process\n`);
  let totalChunks = 0;
  let totalVectors = 0;
  // 3. Process each PDF
  for (const pdfPath of pdfPaths) {
    const filename = path.basename(pdfPath);
    const docType  = detectDocType(pdfPath);
    const meta     = extractMeta(filename);
    console.log(` Processing: ${filename}`);
    console.log(`   Type: ${docType} | Year: ${meta.year || 'n/a'} | Session: ${meta.session || 'n/a'}`);
    // Parse PDF
    let dataBuffer;
    try {
      dataBuffer = fs.readFileSync(pdfPath);
    } catch (e) {
      console.error(`    Cannot read file: ${e.message}`);
      continue;
    }
    let text;
    try {
      const parsed = await pdf(dataBuffer);
      text = parsed.text;
    } catch (e) {
      console.error(`    PDF parse failed: ${e.message}`);
      continue;
    }
    // Clean up common PDF artefacts
    text = text
      .replace(/\x00/g, '')
      .replace(/\f/g, '\n')
      .replace(/[ \t]{3,}/g, '  ')
      .replace(/\n{4,}/g, '\n\n')
      .trim();
    if (text.length < 100) {
      console.log('    Extracted text too short — may be a scanned PDF. Skipping.');
      continue;
    }
    // Chunk
    const chunks = chunkText(text, filename);
    console.log(`   Chunks: ${chunks.length} (~${CHUNK_TOKENS} tokens each)`);
    totalChunks += chunks.length;
    // Embed + upsert in batches
    for (let b = 0; b < chunks.length; b += BATCH_SIZE) {
      const batch = chunks.slice(b, b + BATCH_SIZE);
      const texts = batch.map(c => c.text);
      let embeddings;
      try {
        embeddings = await embedBatch(texts);
      } catch (e) {
        console.error(`    Embedding failed for batch ${b}: ${e.message}`);
        continue;
      }
      const vectors = batch.map((chunk, i) => ({
        id: `${filename.replace('.pdf', '')}_chunk_${b + i}`,
        values: embeddings[i],
        metadata: {
          text:     chunk.text.substring(0, 2000), // Pinecone metadata limit
          source:   filename,
          doc_type: docType,
          topic:    detectTopic(chunk.text),
          year:     meta.year    || 0,
          session:  meta.session || '',
          paper:    meta.paper   || '',
          chunk_index: b + i,
        },
      }));
      await index.upsert(vectors);
      totalVectors += vectors.length;
      process.stdout.write(`\r   Upserted: ${Math.min(b + BATCH_SIZE, chunks.length)}/${chunks.length} chunks`);
    }
    console.log(`\n   Done\n`);
  }
  // 4. Summary
  console.log('==========================================');
  console.log(` Ingestion complete!`);
  console.log(` PDFs processed : ${pdfPaths.length}`);
  console.log(` Total chunks   : ${totalChunks}`);
  console.log(` Vectors upserted: ${totalVectors}`);
  console.log(` Index name     : ${INDEX_NAME}`);
  console.log('\nYour Cambridge RAG is ready. Start the dev server:');
  console.log('  npm run dev\n');
}
main().catch(err => {
  console.error('\n Fatal error:', err.message);
  process.exit(1);
});