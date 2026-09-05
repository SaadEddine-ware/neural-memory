import { D1Database } from '@cloudflare/workers-types';
import { UserSettings } from './types.ts';

export interface UserPattern {
  user_id: string;
  avg_session_length: number;
  avg_prompts_per_session: number;
  preferred_topics: string[];
  switch_frequency: number;
  focus_score: number;
}

export async function getUserPattern(
  db: D1Database,
  userId: string
): Promise<UserPattern> {
  const settings = await db
    .prepare('SELECT * FROM user_settings WHERE user_id = ?')
    .bind(userId)
    .first<UserSettings>();

  const sessions = await db
    .prepare(
      `SELECT s.id, COUNT(m.id) as prompt_count
       FROM sessions s
       LEFT JOIN memories m ON m.session_id = s.id AND m.type = 'prompt_answer'
       GROUP BY s.id`
    )
    .all<{ id: string; prompt_count: number }>();

  const totalPrompts = sessions.results.reduce(
    (sum, s) => sum + s.prompt_count,
    0
  );
  const avgPrompts = sessions.results.length > 0
    ? totalPrompts / sessions.results.length
    : 0;

  const totalConfirmations = settings?.total_confirmations || 1;
  const confirmed = settings?.switch_confirmed_count || 0;
  const switchFrequency = confirmed / totalConfirmations;

  const focusScore = 1 - switchFrequency;

  const memories = await db
    .prepare('SELECT keys FROM memories WHERE session_id IN (SELECT id FROM sessions)')
    .all<{ keys: string }>();

  const topicCount = new Map<string, number>();
  for (const m of memories.results) {
    try {
      const keys = JSON.parse(m.keys);
      if (keys.keywords && Array.isArray(keys.keywords)) {
        for (const k of keys.keywords) {
          topicCount.set(k, (topicCount.get(k) || 0) + 1);
        }
      }
    } catch {}
  }

  const preferredTopics = Array.from(topicCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([topic]) => topic);

  return {
    user_id: userId,
    avg_session_length: sessions.results.length,
    avg_prompts_per_session: avgPrompts,
    preferred_topics: preferredTopics,
    switch_frequency: switchFrequency,
    focus_score: focusScore,
  };
}

export async function getTopicSuggestions(
  db: D1Database,
  userId: string,
  limit: number = 5
): Promise<string[]> {
  const pattern = await getUserPattern(db, userId);
  return pattern.preferred_topics.slice(0, limit);
}

export async function getSessionStats(
  db: D1Database,
  sessionId: string
): Promise<{
  total_memories: number;
  memories_by_type: Record<string, number>;
  avg_importance: number;
  total_tokens_est: number;
}> {
  const memories = await db
    .prepare('SELECT * FROM memories WHERE session_id = ?')
    .bind(sessionId)
    .all<{ type: string; importance: number; tokens_est: number }>();

  const byType: Record<string, number> = {};
  let totalImportance = 0;
  let totalTokens = 0;

  for (const m of memories.results) {
    byType[m.type] = (byType[m.type] || 0) + 1;
    totalImportance += m.importance;
    totalTokens += m.tokens_est || 0;
  }

  return {
    total_memories: memories.results.length,
    memories_by_type: byType,
    avg_importance: memories.results.length > 0
      ? totalImportance / memories.results.length
      : 0,
    total_tokens_est: totalTokens,
  };
}
