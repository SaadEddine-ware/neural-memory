export interface Memory {
  id: string;
  parent_id: string | null;
  type: 'subject' | 'action' | 'sub_action' | 'prompt_answer';
  content: string;
  embedding: ArrayBuffer | null;
  keys: string;
  goal_id: string | null;
  importance: number;
  tokens_est: number | null;
  session_id: string;
  created_at: string;
  updated_at: string;
}

export interface Goal {
  id: string;
  parent_goal_id: string | null;
  description: string;
  embedding: ArrayBuffer | null;
  status: 'active' | 'completed' | 'paused';
  keys: string;
  level: 'goal' | 'sub_goal' | 'task';
  session_id: string;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  root_subject_id: string | null;
  summary: string | null;
  tokens_used: number;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  id: string;
  user_id: string;
  similarity_threshold: number;
  switch_confirmed_count: number;
  switch_rejected_count: number;
  total_confirmations: number;
  created_at: string;
  updated_at: string;
}

export interface Bindings {
  DB: D1Database;
  AI?: Ai;
}

export interface CreateMemoryRequest {
  parent_id?: string;
  type: Memory['type'];
  content: string;
  keys?: Record<string, unknown>;
  goal_id?: string;
  importance?: number;
  tokens_est?: number;
  session_id: string;
}

export interface UpdateMemoryRequest {
  content?: string;
  keys?: Record<string, unknown>;
  importance?: number;
  goal_id?: string | null;
}

export interface CreateGoalRequest {
  parent_goal_id?: string;
  description: string;
  status?: Goal['status'];
  keys?: Record<string, unknown>;
  level: Goal['level'];
  session_id: string;
}

export interface UpdateGoalRequest {
  description?: string;
  status?: Goal['status'];
  keys?: Record<string, unknown>;
}

export interface CreateSessionRequest {
  root_subject_id?: string;
  summary?: string;
  tokens_used?: number;
}

export interface UpdateSessionRequest {
  root_subject_id?: string;
  summary?: string;
  tokens_used?: number;
}

export interface AutoExtractRequest {
  content: string;
  type: Memory['type'];
  session_id: string;
  parent_id?: string;
  goal_id?: string;
  llm_keywords?: string[];
  llm_importance?: number;
}

export interface RetentionSettings {
  user_id: string;
  default_duration_days: number;
  subject_duration_days: number;
  action_duration_days: number;
  sub_action_duration_days: number;
  prompt_answer_duration_days: number;
  auto_delete_expired: boolean;
}
