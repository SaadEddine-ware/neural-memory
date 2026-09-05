import { D1Database } from '@cloudflare/workers-types';

export interface RetentionSettings {
  user_id: string;
  default_duration_days: number;
  subject_duration_days: number;
  action_duration_days: number;
  sub_action_duration_days: number;
  prompt_answer_duration_days: number;
  auto_delete_expired: boolean;
}

const DEFAULT_RETENTION: Omit<RetentionSettings, 'user_id'> = {
  default_duration_days: 30,
  subject_duration_days: 365,
  action_duration_days: 180,
  sub_action_duration_days: 90,
  prompt_answer_duration_days: 30,
  auto_delete_expired: false,
};

export async function getRetentionSettings(
  db: D1Database,
  userId: string
): Promise<RetentionSettings> {
  const existing = await db
    .prepare('SELECT * FROM user_settings WHERE user_id = ?')
    .bind(userId)
    .first<{ user_id: string }>();

  if (existing) {
    return {
      user_id: userId,
      ...DEFAULT_RETENTION,
    };
  }

  return {
    user_id: userId,
    ...DEFAULT_RETENTION,
  };
}

export async function updateRetentionSettings(
  db: D1Database,
  userId: string,
  settings: Partial<Omit<RetentionSettings, 'user_id'>>
): Promise<RetentionSettings> {
  const current = await getRetentionSettings(db, userId);
  const updated = { ...current, ...settings };

  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT OR REPLACE INTO user_settings (id, user_id, similarity_threshold, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      userId,
      0.6,
      now,
      now
    )
    .run();

  return updated;
}

export async function getExpiredMemories(
  db: D1Database,
  userId: string
): Promise<Array<{ id: string; type: string; content: string; created_at: string }>> {
  const retention = await getRetentionSettings(db, userId);
  const now = new Date();

  const memories = await db
    .prepare(
      `SELECT id, type, content, created_at FROM memories
       WHERE session_id IN (
         SELECT id FROM sessions WHERE created_at IS NOT NULL
       )`
    )
    .all<{ id: string; type: string; content: string; created_at: string }>();

  const expired: Array<{ id: string; type: string; content: string; created_at: string }> = [];

  for (const memory of memories.results) {
    const createdAt = new Date(memory.created_at);
    const daysSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

    let maxDays = retention.default_duration_days;
    switch (memory.type) {
      case 'subject':
        maxDays = retention.subject_duration_days;
        break;
      case 'action':
        maxDays = retention.action_duration_days;
        break;
      case 'sub_action':
        maxDays = retention.sub_action_duration_days;
        break;
      case 'prompt_answer':
        maxDays = retention.prompt_answer_duration_days;
        break;
    }

    if (daysSinceCreation > maxDays) {
      expired.push(memory);
    }
  }

  return expired;
}

export async function deleteExpiredMemories(
  db: D1Database,
  userId: string
): Promise<{ deleted_count: number; deleted_ids: string[] }> {
  const expired = await getExpiredMemories(db, userId);

  if (expired.length === 0) {
    return { deleted_count: 0, deleted_ids: [] };
  }

  const ids = expired.map((m) => m.id);
  const placeholders = ids.map(() => '?').join(',');

  await db
    .prepare(`DELETE FROM memories WHERE id IN (${placeholders})`)
    .bind(...ids)
    .run();

  return {
    deleted_count: expired.length,
    deleted_ids: ids,
  };
}

export async function getMemoryAge(
  db: D1Database,
  memoryId: string
): Promise<{
  created_at: string;
  days_old: number;
  retention_days: number;
  is_expired: boolean;
}> {
  const memory = await db
    .prepare('SELECT id, type, created_at FROM memories WHERE id = ?')
    .bind(memoryId)
    .first<{ id: string; type: string; created_at: string }>();

  if (!memory) {
    throw new Error('Memory not found');
  }

  const createdAt = new Date(memory.created_at);
  const now = new Date();
  const daysOld = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

  const retentionDays = getRetentionDays(memory.type);

  return {
    created_at: memory.created_at,
    days_old: Math.floor(daysOld),
    retention_days: retentionDays,
    is_expired: daysOld > retentionDays,
  };
}

function getRetentionDays(type: string): number {
  switch (type) {
    case 'subject':
      return 365;
    case 'action':
      return 180;
    case 'sub_action':
      return 90;
    case 'prompt_answer':
      return 30;
    default:
      return 30;
  }
}
