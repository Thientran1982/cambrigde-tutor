// src/app/api/exam/route.ts
// Generate Cambridge-style exam questions using RAG context

import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { retrieveChunks } from '@/lib/rag';

export const runtime = 'nodejs';
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { topics, numQuestions = 5, difficulty = 'mixed' } = body;

    if (!topics || !Array.isArray(topics) || topics.length === 0) {
      return Response.json({ error: 'topics array required' }, { status: 400 });
    }

    const topicsQuery = topics.join(', ');
    const ragQuery = `Cambridge 9709 exam questions ${topicsQuery} ${difficulty} difficulty mark scheme`;

    let ragContext = '';
    let sources: string[] = [];
    const ragAvailable = !!(process.env.OPENAI_API_KEY && process.env.PINECONE_API_KEY);

    if (ragAvailable) {
      try {
        const ragResult = await retrieveChunks(ragQuery, {
          topK: 8,
          yearFrom: 2020,
          yearTo: 2024,
        });
        ragContext = ragResult.contextText;
        sources = ragResult.sources;
      } catch (e) {
        console.warn('RAG failed for exam generation:', e);
      }
    }

    const systemPrompt = `You are a Cambridge 9709 examiner generating authentic exam questions.
${ragContext ? `\nUse the following official Cambridge past paper examples as style reference:\n\n${ragContext}\n\n` : ''}
Generate questions that authentically match Cambridge style — same difficulty gradients, notation, command words, and mark allocation as real 9709 papers.
Return ONLY valid JSON, no markdown fences, no other text.`;

    const userPrompt = `Generate exactly ${numQuestions} Cambridge 9709 exam questions.

Topics: ${topics.join(', ')}
Difficulty: ${difficulty === 'mixed' ? 'Progressive Easy → Medium → Hard' : difficulty === 'exam' ? 'Authentic Cambridge paper mix' : difficulty}

Return this exact JSON structure:
{
  "questions": [
    {
      "id": 1,
      "topic": "Integration",
      "subtopic": "Integration by parts",
      "difficulty": "Medium",
      "marks": 6,
      "question": "Full Cambridge-style question text with all necessary information.",
      "math_expression": "Key expression in text notation e.g. int(x*e^x)dx or dy/dx = 3x^2 - 2",
      "hint": "Small examiner hint",
      "model_answer": "Complete worked solution, all steps shown",
      "mark_scheme": "M1 for correct method... A1 for... etc",
      "cambridge_source": "Style reference: similar to Paper 1 Q7 style"
    }
  ]
}`;

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const rawText = response.content
      .map(b => (b.type === 'text' ? b.text : ''))
      .join('')
      .replace(/```json|```/g, '')
      .trim();

    const parsed = JSON.parse(rawText);

    return Response.json({
      ...parsed,
      sources,
      ragUsed: ragContext.length > 0,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Exam API error:', message);
    return Response.json({ error: message }, { status: 500 });
  }
}
