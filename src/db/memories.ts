import { D1Database } from '@cloudflare/workers-types';
import { Memory, CreateMemoryRequest, UpdateMemoryRequest } from '../types';
import { generateUUID, estimateTokens } from '../utils';

export async function createMemory(
  db: D1Database,
  data: CreateMemoryRequest
): Promise<Memory> {
  const id = generateUUID();
  const now = new Date().toISOString();
  const tokensEst = data.tokens_est || estimateTokens(data.content);
  const keysJson = JSON.stringify(data.keys || {});

  await db
    .prepare(
      `INSERT INTO memories (id, parent_id, type, content, keys, goal_id, importance, tokens_est, session_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      data.parent_id || null,
      data.type,
      data.content,
      keysJson,
      data.goal_id || null,
      data.importance || 5,
      tokensEst,
      data.session_id,
      now,
      now
    )
    .run();

  return {
    id,
    parent_id: data.parent_id || null,
    type: data.type,
    content: data.content,
    embedding: null,
    keys: keysJson,
    goal_id: data.goal_id || null,
    importance: data.importance || 5,
    tokens_est: tokensEst,
    session_id: data.session_id,
    created_at: now,
    updated_at: now,
  };
}

export async function getMemory(
  db: D1Database,
  id: string
): Promise<Memory | null> {
  const row = await db
    .prepare('SELECT * FROM memories WHERE id = ?')
    .bind(id)
    .first<Memory>();
  return row || null;
}

export async function getMemoriesBySession(
  db: D1Database,
  sessionId: string,
  limit = 100,
  offset = 0
): Promise<Memory[]> {
  const { results } = await db
    .prepare('SELECT * FROM memories WHERE session_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .bind(sessionId, limit, offset)
    .all<Memory>();
  return results;
}

export async function getMemoriesByParent(
  db: D1Database,
  parentId: string
): Promise<Memory[]> {
  const { results } = await db
    .prepare('SELECT * FROM memories WHERE parent_id = ? ORDER BY importance DESC')
    .bind(parentId)
    .all<Memory>();
  return results;
}

export async function updateMemory(
  db: D1Database,
  id: string,
  data: UpdateMemoryRequest
): Promise<Memory | null> {
  const existing = await getMemory(db, id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const keysJson = data.keys ? JSON.stringify(data.keys) : existing.keys;

  await db
    .prepare(
      `UPDATE memories SET content = ?, keys = ?, importance = ?, updated_at = ? WHERE id = ?`
    )
    .bind(
      data.content || existing.content,
      keysJson,
      data.importance || existing.importance,
      now,
      id
    )
    .run();

  return {
    ...existing,
    content: data.content || existing.content,
    keys: keysJson,
    importance: data.importance || existing.importance,
    updated_at: now,
  };
}

export async function deleteMemory(
  db: D1Database,
  id: string
): Promise<boolean> {
  const children = await db
    .prepare('SELECT id FROM memories WHERE parent_id = ?')
    .bind(id)
    .all<{ id: string }>();

  for (const child of children.results) {
    await deleteMemory(db, child.id);
  }

  const result = await db
    .prepare('DELETE FROM memories WHERE id = ?')
    .bind(id)
    .run();
  return result.meta.changes > 0;
}
