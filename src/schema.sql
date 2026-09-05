-- Neural Memory System - Database Schema

-- memories table (core)
CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    parent_id TEXT,
    type TEXT NOT NULL CHECK(type IN ('subject', 'action', 'sub_action', 'prompt_answer')),
    content TEXT NOT NULL,
    embedding BLOB,
    keys TEXT NOT NULL DEFAULT '{}',
    goal_id TEXT,
    importance INTEGER DEFAULT 5 CHECK(importance BETWEEN 1 AND 10),
    tokens_est INTEGER,
    session_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES memories(id),
    FOREIGN KEY (goal_id) REFERENCES goals(id),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- goals table
CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    parent_goal_id TEXT,
    description TEXT NOT NULL,
    embedding BLOB,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'paused')),
    keys TEXT NOT NULL DEFAULT '{}',
    level TEXT NOT NULL CHECK(level IN ('goal', 'sub_goal', 'task')),
    session_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_goal_id) REFERENCES goals(id),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    root_subject_id TEXT,
    summary TEXT,
    tokens_used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (root_subject_id) REFERENCES memories(id)
);

-- user_settings table
CREATE TABLE IF NOT EXISTS user_settings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    similarity_threshold REAL DEFAULT 0.6,
    switch_confirmed_count INTEGER DEFAULT 0,
    switch_rejected_count INTEGER DEFAULT 0,
    total_confirmations INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_memories_session ON memories(session_id);
CREATE INDEX IF NOT EXISTS idx_memories_goal ON memories(goal_id);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_parent ON memories(parent_id);
CREATE INDEX IF NOT EXISTS idx_goals_session ON goals(session_id);
CREATE INDEX IF NOT EXISTS idx_goals_parent ON goals(parent_goal_id);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
CREATE INDEX IF NOT EXISTS idx_goals_level ON goals(level);
