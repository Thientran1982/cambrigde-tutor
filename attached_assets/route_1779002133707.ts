// src/app/api/chat/route.ts
// Streaming chat endpoint with RAG retrieval
import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { retrieveChunks, buildSystemPrompt } from '@/lib/rag';
export const runtime = 'nodejs';
export const maxDuration = 60;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, topic, useRAG = true } = body;

    if (!messages || !Array.isArray(messages)) {
      return Response.json({ error: 'messages array required' }, { status: 400 });
    }
    // Extract the latest user query for RAG retrieval
    const lastUserMsg = [...messages].reverse().find((m: { role: string }) => m.role === 'user');
    const queryText = typeof lastUserMsg?.content === 'string'
      ? lastUserMsg.content
      : lastUserMsg?.content?.find((c: { type: string }) => c.type === 'text')?.text || '';
    // RAG retrieval
    let systemPrompt: string;
    let sources: string[] = [];

    if (useRAG && queryText) {
      try {
        const ragResult = await retrieveChunks(queryText, {
          topK: 6,
          topicFilter: topic !== 'All Topics' ? topic : undefined,
          yearFrom: 2019,
          yearTo: 2024,
        });
        systemPrompt = buildSystemPrompt(ragResult.contextText);
        sources = ragResult.sources;
      } catch (ragErr) {
        // RAG failed — fall back to base prompt (no Cambridge docs in context)
        console.warn('RAG retrieval failed, falling back to base prompt:', ragErr);
        systemPrompt = buildSystemPrompt('');
      }
    } else {
      systemPrompt = buildSystemPrompt('');
    }
    // Stream response from Claude
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        // First, send sources so the frontend can show citations
        if (sources.length > 0) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'sources', sources })}\n\n`)
          );
        }
        // Stream Claude response
        const claudeStream = anthropic.messages.stream({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          system: systemPrompt,
          messages: messages,
        });
        for await (const chunk of claudeStream) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'text', text: chunk.delta.text })}\n\n`
              )
            );
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Chat API error:', message);
    return Response.json({ error: message }, { status: 500 });
  }
}