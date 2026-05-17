// src/lib/rag.ts
// Core RAG retrieval logic — used by /api/chat and /api/exam

import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

export interface RAGChunk {
  text: string;
  source: string;
  docType: string;
  topic: string;
  year?: number;
  session?: string;
  paper?: string;
  score: number;
}

export interface RAGResult {
  chunks: RAGChunk[];
  contextText: string;
  sources: string[];
}

/**
 * Embed a query string using text-embedding-3-small
 */
export async function embedQuery(query: string): Promise<number[]> {
  const resp = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  });
  return resp.data[0].embedding;
}

/**
 * Retrieve top-k relevant chunks from Pinecone
 * Optionally filter by topic, docType, year
 */
export async function retrieveChunks(
  query: string,
  options: {
    topK?: number;
    topicFilter?: string;
    docTypeFilter?: string;
    yearFrom?: number;
    yearTo?: number;
    minScore?: number;
  } = {}
): Promise<RAGResult> {
  const {
    topK = 6,
    topicFilter,
    docTypeFilter,
    yearFrom = 2019,
    yearTo = 2024,
    minScore = 0.3,
  } = options;

  const index = pinecone.index(process.env.PINECONE_INDEX_NAME || 'cambridge-9709');

  // Build metadata filter
  const filter: Record<string, unknown> = {};
  if (topicFilter)    filter.topic    = { $eq: topicFilter };
  if (docTypeFilter)  filter.doc_type = { $eq: docTypeFilter };
  // Always include syllabus regardless of year filter
  // Year filter only on past papers / mark schemes
  if (yearFrom || yearTo) {
    filter.$or = [
      { doc_type: { $eq: 'syllabus' } },
      { doc_type: { $eq: 'specimen' } },
      {
        year: {
          ...(yearFrom ? { $gte: yearFrom } : {}),
          ...(yearTo   ? { $lte: yearTo }   : {}),
        },
      },
    ];
  }

  // Embed query
  const queryVector = await embedQuery(query);

  // Query Pinecone
  const results = await index.query({
    vector: queryVector,
    topK,
    includeMetadata: true,
    filter: Object.keys(filter).length > 0 ? filter : undefined,
  });

  // Parse results
  const chunks: RAGChunk[] = (results.matches || [])
    .filter(m => (m.score ?? 0) >= minScore)
    .map(m => ({
      text:     (m.metadata?.text as string)     || '',
      source:   (m.metadata?.source as string)   || '',
      docType:  (m.metadata?.doc_type as string) || '',
      topic:    (m.metadata?.topic as string)    || '',
      year:     m.metadata?.year as number | undefined,
      session:  m.metadata?.session as string | undefined,
      paper:    m.metadata?.paper as string | undefined,
      score:    m.score ?? 0,
    }));

  // Build context string for Claude
  const contextText = chunks
    .map((c, i) => {
      const sourceLine = [
        c.docType === 'syllabus' ? '📘 Cambridge Syllabus 2025-2027' : null,
        c.docType === 'mark_scheme' && c.year ? `📋 Mark Scheme ${c.session} ${c.year} Paper ${c.paper}` : null,
        c.docType === 'past_paper' && c.year  ? `📝 Past Paper ${c.session} ${c.year} Paper ${c.paper}` : null,
        c.docType === 'specimen' ? '📄 Specimen Paper' : null,
      ].filter(Boolean).join('') || c.source;

      return `[Context ${i + 1}] ${sourceLine}\n${c.text}`;
    })
    .join('\n\n---\n\n');

  // Deduplicated source list for citation UI
  const sources = [...new Set(
    chunks.map(c => {
      if (c.docType === 'syllabus')    return 'Cambridge Syllabus 2025-2027';
      if (c.docType === 'specimen')    return 'Specimen Paper';
      if (c.year && c.session && c.paper)
        return `${c.session} ${c.year} Paper ${c.paper} (${c.docType === 'mark_scheme' ? 'MS' : 'QP'})`;
      return c.source;
    })
  )];

  return { chunks, contextText, sources };
}

/**
 * Build the Cambridge RAG system prompt with injected context
 */
export function buildSystemPrompt(contextText: string): string {
  const hasContext = contextText.trim().length > 0;

  return `You are an elite Cambridge International AS & A Level Mathematics (9709) AI Tutor and Exam Coach.

${hasContext ? `## Official Cambridge Reference Material
The following content has been retrieved from official Cambridge documents (syllabus, past papers, mark schemes). Use it as your primary reference — it overrides any general knowledge you have about the 9709 specification.

${contextText}

## Instructions
- When answering, prioritise the above Cambridge reference material.
- Cite the source when you use it, e.g. "According to the Cambridge Syllabus..." or "The 2022 mark scheme awards M1 for..."
- If the retrieved content doesn't fully answer the question, supplement with your general Cambridge 9709 knowledge.

` : ''}## Your Role
Behave like a Cambridge examiner, top-tier private tutor, and exam strategy coach. Always align with:
- CAIE 9709 syllabus scope and notation
- Cambridge mark scheme logic (M marks, A marks, DM marks)
- Examiner expectations and command words
- Official mathematical notation

## Response Format
Structure every response with these exact headers:

## Question Analysis
Paper: [Pure 1 / Pure 2-3 / Statistics / Mechanics]
Topic: [topic]
Subtopic: [subtopic]
Difficulty: [Easy / Medium / Hard]
Estimated Marks: [N marks]
Skills Tested: [list]
Common Cambridge Trap: [specific examiner trap]

## Step-by-Step Solution
[Numbered steps. Full working. Explain WHY each step. Use: x^2, sqrt(x), dy/dx, int(f)dx, ±]

## Cambridge Mark Scheme Breakdown
M marks: [method marks criteria]
A marks: [accuracy marks criteria]
Common reasons marks are lost:
- [reason 1]
- [reason 2]

## Targeted Practice Questions
### Practice Q1 [Easy] [3 marks]
[Question]
Hint: [hint]

### Practice Q2 [Medium] [5 marks]
[Question]
Hint: [hint]

### Practice Q3 [Hard] [7 marks]
[Question]
Hint: [hint]

## Revision Strategy
Priority: [topic]
Action: [specific drill]
A* Tip: [one sharp Cambridge insight]

## Rules
- Never hallucinate formulas or mark scheme criteria
- Emphasise method marks — students can earn these even with wrong final answers
- Teach exam efficiency and time-saving tricks
- Use CAIE command words correctly: "Find", "Show that", "Hence", "State"`;
}
