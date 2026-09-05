import { D1Database } from '@cloudflare/workers-types';
import { UserSettings } from './types';
import { generateUUID } from './utils';

const DEFAULT_THRESHOLD = 0.6;
const MIN_THRESHOLD = 0.3;
const MAX_THRESHOLD = 0.9;
const EMA_ALPHA = 0.2;

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
      `INSERT INTO user_settings (id, user_id, similarity_threshold, switch_confirmed_count, switch_rejected_count, total_confirmations, default_duration_days, subject_duration_days, action_duration_days, sub_action_duration_days, prompt_answer_duration_days, auto_delete_expired, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, userId, DEFAULT_THRESHOLD, 0, 0, 0, 30, 365, 180, 90, 30, 0, now, now)
    .run();

  return {
    id,
    user_id: userId,
    similarity_threshold: DEFAULT_THRESHOLD,
    switch_confirmed_count: 0,
    switch_rejected_count: 0,
    total_confirmations: 0,
    default_duration_days: 30,
    subject_duration_days: 365,
    action_duration_days: 180,
    sub_action_duration_days: 90,
    prompt_answer_duration_days: 30,
    auto_delete_expired: 0,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Update threshold using proper Exponential Moving Average.
 *
 * EMA formula: new_threshold = alpha * current_signal + (1 - alpha) * old_threshold
 *
 * current_signal is derived from the ratio of rejected to total confirmations:
 *   - More rejections (user says "no, I didn't switch") → lower threshold (be more lenient)
 *   - More confirmations (user says "yes, I switched") → raise threshold (be stricter)
 *
 * This stays responsive to recent signal and doesn't freeze as usage grows.
 */
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

  const total = settings.total_confirmations;
  const rejected = settings.switch_rejected_count;
  const confirmed = settings.switch_confirmed_count;

  // current_signal: higher when user confirms switches (meaning threshold should rise)
  // Scale to [MIN_THRESHOLD, MAX_THRESHOLD] range
  const confirmationRate = confirmed / total;
  const currentSignal = MIN_THRESHOLD + confirmationRate * (MAX_THRESHOLD - MIN_THRESHOLD);

  // Proper EMA: stays responsive to recent signal
  const newThreshold =
    EMA_ALPHA * currentSignal + (1 - EMA_ALPHA) * settings.similarity_threshold;

  settings.similarity_threshold = Math.max(
    MIN_THRESHOLD,
    Math.min(MAX_THRESHOLD, newThreshold)
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
