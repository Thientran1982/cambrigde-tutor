// src/app/api/grade/route.ts
// Grade student exam answers using Cambridge mark scheme logic

import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface ExamQuestion {
  topic: string;
  marks: number;
  question: string;
  math_expression?: string;
  mark_scheme: string;
  model_answer: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { questions, answers } = body as { questions: ExamQuestion[]; answers: string[] };

    if (!questions || !answers) {
      return Response.json({ error: 'questions and answers required' }, { status: 400 });
    }

    const gradingPrompt = `You are a Cambridge 9709 examiner. Grade these student answers strictly per Cambridge mark scheme logic.

${questions.map((q, i) => `QUESTION ${i + 1} [${q.marks} marks] — ${q.topic}
Question: ${q.question}
${q.math_expression ? `Math: ${q.math_expression}` : ''}
Mark Scheme: ${q.mark_scheme}
Model Answer: ${q.model_answer}
Student Answer: ${answers[i] || '[No answer]'}`).join('\n---\n')}

Return ONLY valid JSON (no markdown):
{"results":[{"questionId":1,"marksAwarded":4,"marksAvailable":6,"grade":"partial","feedback":"Cambridge-style feedback. What was correct, what was missing, which M/A marks were earned/lost.","modelAnswer":"Brief ideal answer"}],"totalMarks":15,"totalAvailable":30,"percentage":50,"cambridgeGrade":"B","overallFeedback":"2-3 sentence performance summary and key improvement areas"}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: 'You are a Cambridge 9709 examiner. Return only valid JSON.',
      messages: [{ role: 'user', content: gradingPrompt }],
    });

    const rawText = response.content
      .map(b => (b.type === 'text' ? b.text : ''))
      .join('')
      .replace(/```json|```/g, '')
      .trim();

    const grading = JSON.parse(rawText);
    return Response.json(grading);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Grade API error:', message);
    return Response.json({ error: message }, { status: 500 });
  }
}
