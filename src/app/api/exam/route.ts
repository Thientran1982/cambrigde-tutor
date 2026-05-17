// src/app/api/exam/route.ts
// Generate Cambridge-style exam questions using RAG context

import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { retrieveChunks } from '@/lib/rag';

export const runtime = 'nodejs';
export const maxDuration = 120;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { topics, numQuestions = 5, difficulty = 'mixed' } = body;

    if (!topics || !Array.isArray(topics) || topics.length === 0) {
      return Response.json({ error: 'topics array required' }, { status: 400 });
    }

    // Retrieve relevant past paper questions + mark schemes for context
    const topicsQuery = topics.join(', ');
    const ragQuery = `Cambridge 9709 exam questions ${topicsQuery} ${difficulty} difficulty mark scheme`;

    let ragContext = '';
    let sources: string[] = [];

    try {
      const ragResult = await retrieveChunks(ragQuery, {
        topK: 6,
        yearFrom: 2020,
        yearTo: 2024,
      });
      ragContext = ragResult.contextText;
      sources = ragResult.sources;
    } catch (e) {
      console.warn('RAG failed for exam generation:', e);
    }

    const systemPrompt = `You are a Cambridge 9709 examiner generating authentic exam questions.
${ragContext ? `\nUse the following official Cambridge past paper examples as style reference:\n\n${ragContext}\n\n` : ''}
Generate questions that authentically match Cambridge style — same difficulty gradients, notation, command words, and mark allocation as real 9709 papers.
Return ONLY valid JSON, no markdown fences, no other text. Be concise in all fields.`;

    const userPrompt = `Generate exactly ${numQuestions} Cambridge 9709 exam questions.

Topics: ${topics.join(', ')}
Difficulty: ${difficulty === 'mixed' ? 'Progressive Easy → Medium → Hard' : difficulty === 'exam' ? 'Authentic Cambridge paper mix' : difficulty}

Return this exact JSON structure (keep model_answer and mark_scheme SHORT — key steps only, max 3 lines each):
{
  "questions": [
    {
      "id": 1,
      "topic": "Integration",
      "subtopic": "Integration by parts",
      "difficulty": "Medium",
      "marks": 6,
      "question": "Full Cambridge-style question text with all necessary information.",
      "math_expression": "Key expression e.g. int(x*e^x)dx or dy/dx = 3x^2 - 2",
      "hint": "One-line examiner hint without giving away the method",
      "model_answer": "Step 1: ... Step 2: ... Final answer: ...",
      "mark_scheme": "M1 correct method, A1 correct integral, A1 final answer",
      "cambridge_source": "Style: 9709 Paper 1 Q7"
    }
  ]
}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    if (response.stop_reason === 'max_tokens') {
      console.warn(`Exam generation hit max_tokens for ${numQuestions} questions`);
    }

    const rawText = response.content
      .map(b => (b.type === 'text' ? b.text : ''))
      .join('')
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // Attempt progressive JSON repair for truncated responses
      let repaired = rawText;

      // Remove trailing incomplete field (e.g. "model_answer": "partial...)
      repaired = repaired.replace(/,?\s*"[^"]*"\s*:\s*"[^"]*$/, '');
      // Remove trailing comma
      repaired = repaired.replace(/,\s*$/, '');

      // Count open braces/brackets to close them
      const openBraces = (repaired.match(/\{/g) || []).length - (repaired.match(/\}/g) || []).length;
      const openBrackets = (repaired.match(/\[/g) || []).length - (repaired.match(/\]/g) || []).length;

      for (let i = 0; i < openBraces + openBrackets; i++) {
        if (i < openBrackets) repaired += ']';
        else repaired += '}';
      }
      // Ensure outer structure is closed
      if (!repaired.trimEnd().endsWith('}}') && repaired.includes('"questions"')) {
        repaired = repaired.trimEnd().replace(/\}?\]?\}?$/, ']}');
      }

      try {
        parsed = JSON.parse(repaired);
        console.warn('Exam JSON repaired successfully');
      } catch {
        throw new Error(`Exam generation failed — response was cut off (${rawText.length} chars). Try fewer questions or a shorter topic list.`);
      }
    }

    // Ensure questions array exists
    if (!parsed.questions || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      throw new Error('No questions were generated. Please try again.');
    }

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
