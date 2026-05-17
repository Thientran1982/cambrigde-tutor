// src/app/api/grade/route.ts
// Auto-grade student exam submissions using Cambridge mark scheme context from RAG
import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { retrieveChunks } from '@/lib/rag';
export const runtime = 'nodejs';
export const maxDuration = 90;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
interface Question {
  id: number;
  topic: string;
  subtopic?: string;
  difficulty: string;
  marks: number;
  question: string;
  math_expression?: string;
  model_answer: string;
  mark_scheme: string;
}
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { questions, answers, examSettings } = body as {
      questions: Question[];
      answers: string[];
      examSettings: { topics: string[]; difficulty: string };
    };
    if (!questions?.length || !answers?.length) {
      return Response.json({ error: 'questions and answers required' }, { status: 400 });
    }
    // Retrieve real Cambridge mark scheme chunks for context
    const topicsQuery = examSettings?.topics?.join(', ') || questions.map(q => q.topic).join(', ');
    const ragQuery = `Cambridge 9709 mark scheme ${topicsQuery} marking criteria method marks accuracy marks`;
    let ragContext = '';
    let sources: string[] = [];
    try {
      const ragResult = await retrieveChunks(ragQuery, {
        topK: 5,
        docTypeFilter: 'mark_scheme',
        yearFrom: 2020,
        yearTo: 2024,
      });
      ragContext = ragResult.contextText;
      sources = ragResult.sources;
    } catch (e) {
      console.warn('RAG failed for grading, using model knowledge only:', e);
    }
    const systemPrompt = `You are a strict Cambridge 9709 examiner grading student answers.
${ragContext ? `\nUse these official Cambridge mark scheme examples as reference for marking standards:\n\n${ragContext}\n` : ''}
Apply Cambridge mark scheme principles strictly:
- M marks: awarded for correct method even if arithmetic error follows
- A marks: accuracy marks, usually depend on preceding M mark
- B marks: independent marks for specific values/statements
- "Follow through" (ft): award if student's method is correct but carries forward an earlier error
- Never award A mark if M mark was not earned (unless stated "independent")
Return ONLY valid JSON, no markdown.`;
    const userPrompt = `Grade these ${questions.length} Cambridge 9709 student answers strictly.
${questions.map((q, i) => `
QUESTION ${i + 1} [${q.marks} marks] — ${q.topic} (${q.difficulty})
Question: ${q.question}
${q.math_expression ? `Expression: ${q.math_expression}` : ''}
Official Mark Scheme: ${q.mark_scheme}
Model Answer: ${q.model_answer}
Student Answer: ${answers[i]?.trim() || '[No answer provided]'}
`).join('\n---\n')}
Return this exact JSON:
{
  "results": [
    {
      "questionId": 1,
      "marksAwarded": 4,
      "marksAvailable": 6,
      "mMarks": 2,
      "mMarksAvailable": 2,
      "aMarks": 2,
      "aMarksAvailable": 3,
      "grade": "partial",
      "feedback": "Detailed Cambridge-style feedback. State exactly which M/A marks were earned and why. Mention what was missing.",
      "modelAnswer": "Complete worked solution",
      "examinerNote": "Common mistake or tip for this question type"
    }
  ],
  "totalMarks": 15,
  "totalAvailable": 30,
  "percentage": 50,
  "cambridgeGrade": "B",
  "overallFeedback": "2-3 sentence examiner summary",
  "weakTopics": ["Integration", "Trigonometry"],
  "strongTopics": ["Differentiation"]
}`;
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const raw = response.content
      .map(b => (b.type === 'text' ? b.text : ''))
      .join('')
      .replace(/```json|```/g, '')
      .trim();
    const grading = JSON.parse(raw);
    return Response.json({ ...grading, sources, ragUsed: ragContext.length > 0 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Grade API error:', message);
    return Response.json({ error: message }, { status: 500 });
  }
}