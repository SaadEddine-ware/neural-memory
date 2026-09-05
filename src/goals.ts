import { D1Database } from '@cloudflare/workers-types';
import { Goal, CreateGoalRequest } from './types';
import { GOAL_INFERENCE_PROMPT, GOAL_MATCHING_PROMPT } from './prompts.ts';
import { generateUUID } from './utils.ts';

export function buildGoalInferencePrompt(conversation: string): string {
  return GOAL_INFERENCE_PROMPT.replace('{CONVERSATION}', conversation);
}

export function buildGoalMatchingPrompt(
  goals: Goal[],
  conversation: string
): string {
  const goalsList = goals
    .map(
      (g, i) =>
        `${i}: [${g.level}] ${g.description} (${g.status})`
    )
    .join('\n');

  return GOAL_MATCHING_PROMPT.replace('{GOALS}', goalsList).replace(
    '{CONVERSATION}',
    conversation
  );
}

export function parseGoalInference(llmOutput: string): CreateGoalRequest[] {
  try {
    const cleaned = llmOutput.trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.goals || !Array.isArray(parsed.goals)) return [];

    return parsed.goals.map(
      (g: { description: string; level: string; parent_index: number | null }) => ({
        description: g.description || '',
        level: g.level || 'goal',
        parent_goal_id: null,
        status: 'active' as const,
        keys: {},
        session_id: '',
      })
    );
  } catch {
    return [];
  }
}

export function parseGoalMatching(llmOutput: string): {
  matched_goal_index: number;
  confidence: number;
  should_create_new: boolean;
} {
  try {
    const cleaned = llmOutput.trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { matched_goal_index: -1, confidence: 0, should_create_new: true };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      matched_goal_index: parsed.matched_goal_index ?? -1,
      confidence: parsed.confidence ?? 0,
      should_create_new: parsed.should_create_new ?? true,
    };
  } catch {
    return { matched_goal_index: -1, confidence: 0, should_create_new: true };
  }
}

export async function getGoalHierarchy(
  db: D1Database,
  sessionId: string
): Promise<{
  goals: Goal[];
  hierarchy: Map<string, Goal[]>;
}> {
  const goals = await db
    .prepare('SELECT * FROM goals WHERE session_id = ? ORDER BY created_at ASC')
    .bind(sessionId)
    .all<Goal>();

  const hierarchy = new Map<string, Goal[]>();
  for (const goal of goals.results) {
    const parentId = goal.parent_goal_id || 'root';
    if (!hierarchy.has(parentId)) {
      hierarchy.set(parentId, []);
    }
    hierarchy.get(parentId)!.push(goal);
  }

  return { goals: goals.results, hierarchy };
}

export async function getActiveGoal(
  db: D1Database,
  sessionId: string
): Promise<Goal | null> {
  const goal = await db
    .prepare(
      'SELECT * FROM goals WHERE session_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1'
    )
    .bind(sessionId, 'active')
    .first<Goal>();
  return goal || null;
}

export async function completeGoal(
  db: D1Database,
  goalId: string
): Promise<Goal | null> {
  const now = new Date().toISOString();
  await db
    .prepare('UPDATE goals SET status = ?, updated_at = ? WHERE id = ?')
    .bind('completed', now, goalId)
    .run();

  return await db
    .prepare('SELECT * FROM goals WHERE id = ?')
    .bind(goalId)
    .first<Goal>();
}
