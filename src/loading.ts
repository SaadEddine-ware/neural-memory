import { D1Database } from '@cloudflare/workers-types';
import { Memory, Goal } from './types.ts';

export interface MemoryHeader {
  id: string;
  type: Memory['type'];
  content: string;
  importance: number;
  tokens_est: number;
  child_count: number;
}

export interface GoalHeader {
  id: string;
  level: Goal['level'];
  description: string;
  status: Goal['status'];
  child_count: number;
}

export interface SessionContext {
  headers: MemoryHeader[];
  goals: GoalHeader[];
  total_tokens_est: number;
}

const TOKEN_BUDGET = {
  SESSION_START: 500,
  PER_PROMPT: 200,
  MAX_LOADED: 2000,
};

export async function loadSessionHeaders(
  db: D1Database,
  sessionId: string
): Promise<SessionContext> {
  const memories = await db
    .prepare(
      `SELECT id, type, content, importance, tokens_est,
        (SELECT COUNT(*) FROM memories WHERE parent_id = m.id) as child_count
       FROM memories m
       WHERE session_id = ? AND parent_id IS NULL
       ORDER BY importance DESC, created_at DESC`
    )
    .bind(sessionId)
    .all<MemoryHeader>();

  const goals = await db
    .prepare(
      `SELECT id, level, description, status,
        (SELECT COUNT(*) FROM goals WHERE parent_goal_id = g.id) as child_count
       FROM goals g
       WHERE session_id = ? AND parent_goal_id IS NULL
       ORDER BY created_at DESC`
    )
    .bind(sessionId)
    .all<GoalHeader>();

  const totalTokens = memories.results.reduce(
    (sum, m) => sum + (m.tokens_est || 0),
    0
  );

  return {
    headers: memories.results,
    goals: goals.results,
    total_tokens_est: totalTokens,
  };
}

export async function drillDownMemory(
  db: D1Database,
  memoryId: string
): Promise<{
  memory: Memory;
  children: Memory[];
}> {
  const memory = await db
    .prepare('SELECT * FROM memories WHERE id = ?')
    .bind(memoryId)
    .first<Memory>();

  if (!memory) {
    throw new Error('Memory not found');
  }

  const children = await db
    .prepare(
      `SELECT * FROM memories WHERE parent_id = ?
       ORDER BY importance DESC, created_at DESC`
    )
    .bind(memoryId)
    .all<Memory>();

  return {
    memory,
    children: children.results,
  };
}

export async function drillDownGoal(
  db: D1Database,
  goalId: string
): Promise<{
  goal: Goal;
  subGoals: Goal[];
  tasks: Goal[];
}> {
  const goal = await db
    .prepare('SELECT * FROM goals WHERE id = ?')
    .bind(goalId)
    .first<Goal>();

  if (!goal) {
    throw new Error('Goal not found');
  }

  const subGoals = await db
    .prepare(
      `SELECT * FROM goals WHERE parent_goal_id = ? AND level = 'sub_goal'
       ORDER BY created_at ASC`
    )
    .bind(goalId)
    .all<Goal>();

  const tasks = await db
    .prepare(
      `SELECT * FROM goals WHERE parent_goal_id = ? AND level = 'task'
       ORDER BY created_at ASC`
    )
    .bind(goalId)
    .all<Goal>();

  return {
    goal,
    subGoals: subGoals.results,
    tasks: tasks.results,
  };
}

export async function loadByImportance(
  db: D1Database,
  sessionId: string,
  maxTokens: number = TOKEN_BUDGET.MAX_LOADED
): Promise<Memory[]> {
  const memories = await db
    .prepare(
      `SELECT * FROM memories
       WHERE session_id = ?
       ORDER BY importance DESC, created_at DESC`
    )
    .bind(sessionId)
    .all<Memory>();

  let tokenCount = 0;
  const selected: Memory[] = [];

  for (const memory of memories.results) {
    const memTokens = memory.tokens_est || 0;
    if (tokenCount + memTokens > maxTokens) break;
    selected.push(memory);
    tokenCount += memTokens;
  }

  return selected;
}

export async function searchByKeywords(
  db: D1Database,
  sessionId: string,
  keywords: string[]
): Promise<Memory[]> {
  const conditions = keywords.map(() => "keys LIKE ?").join(' OR ');
  const params = keywords.map(k => `%${k}%`);

  const memories = await db
    .prepare(
      `SELECT * FROM memories
       WHERE session_id = ? AND (${conditions})
       ORDER BY importance DESC`
    )
    .bind(sessionId, ...params)
    .all<Memory>();

  return memories.results;
}

export function estimateTokensForContext(context: SessionContext): number {
  const headerTokens = context.headers.reduce(
    (sum, h) => sum + Math.ceil(h.content.length / 4),
    0
  );
  const goalTokens = context.goals.reduce(
    (sum, g) => sum + Math.ceil(g.description.length / 4),
    0
  );
  return headerTokens + goalTokens;
}

export function formatContextForLLM(context: SessionContext): string {
  const lines: string[] = [];

  lines.push('=== SESSION CONTEXT ===');
  lines.push('');

  if (context.headers.length > 0) {
    lines.push('Memories:');
    for (const h of context.headers) {
      const childInfo = h.child_count > 0 ? ` (${h.child_count} children)` : '';
      lines.push(`  [${h.type}] ${h.content}${childInfo}`);
    }
    lines.push('');
  }

  if (context.goals.length > 0) {
    lines.push('Goals:');
    for (const g of context.goals) {
      const childInfo = g.child_count > 0 ? ` (${g.child_count} sub-goals)` : '';
      lines.push(`  [${g.level}] ${g.description} (${g.status})${childInfo}`);
    }
    lines.push('');
  }

  lines.push(`Total tokens estimated: ${context.total_tokens_est}`);

  return lines.join('\n');
}
