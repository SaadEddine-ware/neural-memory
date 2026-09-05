import { D1Database } from '@cloudflare/workers-types';
import { Memory } from './types.ts';
import { SUMMARY_PROMPT } from './prompts.ts';

export interface SessionSummary {
  session_id: string;
  summary: string;
  topic: string;
  key_decisions: string[];
  goals_mentioned: string[];
  token_estimate: number;
}

export function buildSummaryPrompt(conversationHistory: string): string {
  return SUMMARY_PROMPT.replace('{HISTORY}', conversationHistory);
}

export function parseSummary(llmOutput: string): string {
  return llmOutput.trim().replace(/^["']|["']$/g, '');
}

export async function getSessionMemories(
  db: D1Database,
  sessionId: string
): Promise<Memory[]> {
  const memories = await db
    .prepare(
      `SELECT * FROM memories
       WHERE session_id = ? AND type = 'prompt_answer'
       ORDER BY created_at ASC`
    )
    .bind(sessionId)
    .all<Memory>();

  return memories.results;
}

export async function buildConversationHistory(
  db: D1Database,
  sessionId: string
): Promise<string> {
  const memories = await getSessionMemories(db, sessionId);

  const lines: string[] = [];
  for (const memory of memories) {
    const keys = JSON.parse(memory.keys || '{}');
    const keywords = keys.keywords || [];
    lines.push(`[${memory.type}] ${memory.content}`);
    if (keywords.length > 0) {
      lines.push(`  Keywords: ${keywords.join(', ')}`);
    }
  }

  return lines.join('\n');
}

export async function generateSessionSummary(
  db: D1Database,
  sessionId: string
): Promise<SessionSummary> {
  const memories = await getSessionMemories(db, sessionId);

  const topics = new Set<string>();
  const goals: string[] = [];

  for (const memory of memories) {
    try {
      const keys = JSON.parse(memory.keys || '{}');
      if (keys.keywords) {
        for (const k of keys.keywords) {
          topics.add(k);
        }
      }
    } catch {}
  }

  const goalMemories = await db
    .prepare('SELECT description FROM goals WHERE session_id = ?')
    .bind(sessionId)
    .all<{ description: string }>();

  for (const g of goalMemories.results) {
    goals.push(g.description);
  }

  const tokenEstimate = memories.reduce(
    (sum, m) => sum + (m.tokens_est || 0),
    0
  );

  const topicArray = Array.from(topics).slice(0, 5);

  return {
    session_id: sessionId,
    summary: `Session with ${memories.length} prompts covering: ${topicArray.join(', ')}`,
    topic: topicArray[0] || 'general',
    key_decisions: [],
    goals_mentioned: goals,
    token_estimate: tokenEstimate,
  };
}

export async function updateSessionSummary(
  db: D1Database,
  sessionId: string,
  summary: string
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare('UPDATE sessions SET summary = ?, updated_at = ? WHERE id = ?')
    .bind(summary, now, sessionId)
    .run();
}

export async function getSessionSummary(
  db: D1Database,
  sessionId: string
): Promise<{
  summary: string | null;
  memory_count: number;
  goal_count: number;
  token_estimate: number;
}> {
  const session = await db
    .prepare('SELECT summary FROM sessions WHERE id = ?')
    .bind(sessionId)
    .first<{ summary: string | null }>();

  const memoryCount = await db
    .prepare('SELECT COUNT(*) as count FROM memories WHERE session_id = ?')
    .bind(sessionId)
    .first<{ count: number }>();

  const goalCount = await db
    .prepare('SELECT COUNT(*) as count FROM goals WHERE session_id = ?')
    .bind(sessionId)
    .first<{ count: number }>();

  const tokenEstimate = await db
    .prepare('SELECT COALESCE(SUM(tokens_est), 0) as total FROM memories WHERE session_id = ?')
    .bind(sessionId)
    .first<{ total: number }>();

  return {
    summary: session?.summary || null,
    memory_count: memoryCount?.count || 0,
    goal_count: goalCount?.count || 0,
    token_estimate: tokenEstimate?.total || 0,
  };
}
