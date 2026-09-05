import { D1Database } from '@cloudflare/workers-types';
import { Session, CreateSessionRequest, UpdateSessionRequest } from '../types';
import { generateUUID } from '../utils';

export async function createSession(
  db: D1Database,
  data: CreateSessionRequest = {}
): Promise<Session> {
  const id = generateUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO sessions (id, root_subject_id, summary, tokens_used, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      data.root_subject_id || null,
      data.summary || null,
      data.tokens_used || 0,
      now,
      now
    )
    .run();

  return {
    id,
    root_subject_id: data.root_subject_id || null,
    summary: data.summary || null,
    tokens_used: data.tokens_used || 0,
    created_at: now,
    updated_at: now,
  };
}

export async function getSession(
  db: D1Database,
  id: string
): Promise<Session | null> {
  const row = await db
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .bind(id)
    .first<Session>();
  return row || null;
}

export async function getSessions(
  db: D1Database,
  limit = 50,
  offset = 0
): Promise<Session[]> {
  const { results } = await db
    .prepare('SELECT * FROM sessions ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .bind(limit, offset)
    .all<Session>();
  return results;
}

export async function updateSession(
  db: D1Database,
  id: string,
  data: UpdateSessionRequest
): Promise<Session | null> {
  const existing = await getSession(db, id);
  if (!existing) return null;

  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE sessions SET root_subject_id = ?, summary = ?, tokens_used = ?, updated_at = ? WHERE id = ?`
    )
    .bind(
      data.root_subject_id !== undefined ? data.root_subject_id : existing.root_subject_id,
      data.summary !== undefined ? data.summary : existing.summary,
      data.tokens_used !== undefined ? data.tokens_used : existing.tokens_used,
      now,
      id
    )
    .run();

  return {
    ...existing,
    root_subject_id: data.root_subject_id !== undefined ? data.root_subject_id : existing.root_subject_id,
    summary: data.summary !== undefined ? data.summary : existing.summary,
    tokens_used: data.tokens_used !== undefined ? data.tokens_used : existing.tokens_used,
    updated_at: now,
  };
}

export async function deleteSession(
  db: D1Database,
  id: string
): Promise<boolean> {
  const memories = await db
    .prepare('SELECT id FROM memories WHERE session_id = ?')
    .bind(id)
    .all<{ id: string }>();

  for (const mem of memories.results) {
    await db
      .prepare('DELETE FROM memories WHERE id = ?')
      .bind(mem.id)
      .run();
  }

  await db
    .prepare('DELETE FROM goals WHERE session_id = ?')
    .bind(id)
    .run();

  const result = await db
    .prepare('DELETE FROM sessions WHERE id = ?')
    .bind(id)
    .run();
  return result.meta.changes > 0;
}
