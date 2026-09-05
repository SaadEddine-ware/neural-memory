import { D1Database } from '@cloudflare/workers-types';
import { Goal, CreateGoalRequest, UpdateGoalRequest } from '../types';
import { generateUUID } from '../utils';

export async function createGoal(
  db: D1Database,
  data: CreateGoalRequest
): Promise<Goal> {
  const id = generateUUID();
  const now = new Date().toISOString();
  const keysJson = JSON.stringify(data.keys || {});

  await db
    .prepare(
      `INSERT INTO goals (id, parent_goal_id, description, status, keys, level, session_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      data.parent_goal_id || null,
      data.description,
      data.status || 'active',
      keysJson,
      data.level,
      data.session_id,
      now,
      now
    )
    .run();

  return {
    id,
    parent_goal_id: data.parent_goal_id || null,
    description: data.description,
    embedding: null,
    status: data.status || 'active',
    keys: keysJson,
    level: data.level,
    session_id: data.session_id,
    created_at: now,
    updated_at: now,
  };
}

export async function getGoal(
  db: D1Database,
  id: string
): Promise<Goal | null> {
  const row = await db
    .prepare('SELECT * FROM goals WHERE id = ?')
    .bind(id)
    .first<Goal>();
  return row || null;
}

export async function getGoalsBySession(
  db: D1Database,
  sessionId: string,
  limit = 100,
  offset = 0
): Promise<Goal[]> {
  const { results } = await db
    .prepare('SELECT * FROM goals WHERE session_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .bind(sessionId, limit, offset)
    .all<Goal>();
  return results;
}

export async function getGoalsByParent(
  db: D1Database,
  parentId: string
): Promise<Goal[]> {
  const { results } = await db
    .prepare('SELECT * FROM goals WHERE parent_goal_id = ? ORDER BY created_at DESC')
    .bind(parentId)
    .all<Goal>();
  return results;
}

export async function getActiveGoals(
  db: D1Database,
  sessionId: string
): Promise<Goal[]> {
  const { results } = await db
    .prepare('SELECT * FROM goals WHERE session_id = ? AND status = ? ORDER BY created_at DESC')
    .bind(sessionId, 'active')
    .all<Goal>();
  return results;
}

export async function updateGoal(
  db: D1Database,
  id: string,
  data: UpdateGoalRequest
): Promise<Goal | null> {
  const existing = await getGoal(db, id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const keysJson = data.keys ? JSON.stringify(data.keys) : existing.keys;

  await db
    .prepare(
      `UPDATE goals SET description = ?, status = ?, keys = ?, updated_at = ? WHERE id = ?`
    )
    .bind(
      data.description || existing.description,
      data.status || existing.status,
      keysJson,
      now,
      id
    )
    .run();

  return {
    ...existing,
    description: data.description || existing.description,
    status: data.status || existing.status,
    keys: keysJson,
    updated_at: now,
  };
}

export async function deleteGoal(
  db: D1Database,
  id: string
): Promise<boolean> {
  const children = await db
    .prepare('SELECT id FROM goals WHERE parent_goal_id = ?')
    .bind(id)
    .all<{ id: string }>();

  for (const child of children.results) {
    await deleteGoal(db, child.id);
  }

  await db
    .prepare('UPDATE memories SET goal_id = NULL WHERE goal_id = ?')
    .bind(id)
    .run();

  const result = await db
    .prepare('DELETE FROM goals WHERE id = ?')
    .bind(id)
    .run();
  return result.meta.changes > 0;
}
