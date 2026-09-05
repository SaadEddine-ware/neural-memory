import { D1Database } from '@cloudflare/workers-types';
import { UserSettings } from './types';
import { generateUUID } from './utils';

const DEFAULT_THRESHOLD = 0.6;
const MIN_THRESHOLD = 0.3;
const MAX_THRESHOLD = 0.9;
const EMA_FACTOR = 0.2;

export async function getUserSettings(
  db: D1Database,
  userId: string
): Promise<UserSettings> {
  const existing = await db
    .prepare('SELECT * FROM user_settings WHERE user_id = ?')
    .bind(userId)
    .first<UserSettings>();

  if (existing) {
    return existing;
  }

  const id = generateUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO user_settings (id, user_id, similarity_threshold, switch_confirmed_count, switch_rejected_count, total_confirmations, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, userId, DEFAULT_THRESHOLD, 0, 0, 0, now, now)
    .run();

  return {
    id,
    user_id: userId,
    similarity_threshold: DEFAULT_THRESHOLD,
    switch_confirmed_count: 0,
    switch_rejected_count: 0,
    total_confirmations: 0,
    created_at: now,
    updated_at: now,
  };
}

export async function updateAdaptiveThreshold(
  db: D1Database,
  userId: string,
  userConfirmedSwitch: boolean
): Promise<UserSettings> {
  const settings = await getUserSettings(db, userId);

  settings.total_confirmations++;
  if (userConfirmedSwitch) {
    settings.switch_confirmed_count++;
  } else {
    settings.switch_rejected_count++;
  }

  const diff = settings.switch_rejected_count - settings.switch_confirmed_count;
  const adjustment = EMA_FACTOR * (diff / settings.total_confirmations);
  settings.similarity_threshold = Math.max(
    MIN_THRESHOLD,
    Math.min(MAX_THRESHOLD, DEFAULT_THRESHOLD + adjustment)
  );

  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE user_settings 
       SET similarity_threshold = ?, switch_confirmed_count = ?, switch_rejected_count = ?, total_confirmations = ?, updated_at = ?
       WHERE user_id = ?`
    )
    .bind(
      settings.similarity_threshold,
      settings.switch_confirmed_count,
      settings.switch_rejected_count,
      settings.total_confirmations,
      now,
      userId
    )
    .run();

  settings.updated_at = now;
  return settings;
}

export function getDecision(
  similarity: number,
  threshold: number
): 'continue' | 'ask' | 'switch' {
  if (similarity > 0.8) {
    return 'continue';
  }
  if (similarity <= threshold) {
    return 'switch';
  }
  return 'ask';
}
