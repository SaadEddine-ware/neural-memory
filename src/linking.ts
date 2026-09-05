import { D1Database } from '@cloudflare/workers-types';
import { Memory } from './types.ts';

export interface LinkedMemory {
  memory: Memory;
  layer: 'sub_action' | 'action' | 'event';
  linked_to: string[];
  session_ids: string[];
}

export interface MemoryThread {
  id: string;
  subject: string;
  sessions: Array<{
    session_id: string;
    memories: Memory[];
    summary: string | null;
  }>;
  total_memories: number;
}

export async function findLinkedMemories(
  db: D1Database,
  memoryId: string
): Promise<LinkedMemory[]> {
  const memory = await db
    .prepare('SELECT * FROM memories WHERE id = ?')
    .bind(memoryId)
    .first<Memory>();

  if (!memory) {
    throw new Error('Memory not found');
  }

  const links: LinkedMemory[] = [];

  if (memory.parent_id) {
    const siblings = await db
      .prepare(
        `SELECT * FROM memories WHERE parent_id = ? AND id != ?`
      )
      .bind(memory.parent_id, memoryId)
      .all<Memory>();

    if (siblings.results.length > 0) {
      links.push({
        memory,
        layer: 'sub_action',
        linked_to: siblings.results.map((s) => s.id),
        session_ids: [...new Set([memory.session_id, ...siblings.results.map((s) => s.session_id)])],
      });
    }
  }

  if (memory.type === 'action' || memory.type === 'subject') {
    const sameContent = await db
      .prepare(
        `SELECT * FROM memories WHERE content LIKE ? AND id != ? AND type = ?`
      )
      .bind(`%${memory.content.substring(0, 30)}%`, memoryId, memory.type)
      .all<Memory>();

    if (sameContent.results.length > 0) {
      links.push({
        memory,
        layer: 'action',
        linked_to: sameContent.results.map((s) => s.id),
        session_ids: [...new Set([memory.session_id, ...sameContent.results.map((s) => s.session_id)])],
      });
    }
  }

  if (memory.type === 'subject') {
    const crossSession = await db
      .prepare(
        `SELECT * FROM memories WHERE type = 'subject' AND content LIKE ? AND id != ?`
      )
      .bind(`%${memory.content.substring(0, 20)}%`, memoryId)
      .all<Memory>();

    if (crossSession.results.length > 0) {
      links.push({
        memory,
        layer: 'event',
        linked_to: crossSession.results.map((s) => s.id),
        session_ids: [...new Set([memory.session_id, ...crossSession.results.map((s) => s.session_id)])],
      });
    }
  }

  return links;
}

export async function createMemoryThread(
  db: D1Database,
  subjectMemoryId: string
): Promise<MemoryThread | null> {
  const subject = await db
    .prepare('SELECT * FROM memories WHERE id = ? AND type = ?')
    .bind(subjectMemoryId, 'subject')
    .first<Memory>();

  if (!subject) {
    return null;
  }

  const relatedSubjects = await db
    .prepare(
      `SELECT * FROM memories WHERE type = ? AND content LIKE ? ORDER BY created_at ASC`
    )
    .bind('subject', `%${subject.content.substring(0, 20)}%`)
    .all<Memory>();

  const sessions = new Map<string, Memory[]>();
  for (const s of relatedSubjects.results) {
    const memories = sessions.get(s.session_id) || [];
    memories.push(s);
    sessions.set(s.session_id, memories);
  }

  const sessionData = [];
  for (const [sessionId, memories] of sessions) {
    const session = await db
      .prepare('SELECT summary FROM sessions WHERE id = ?')
      .bind(sessionId)
      .first<{ summary: string | null }>();

    sessionData.push({
      session_id: sessionId,
      memories,
      summary: session?.summary || null,
    });
  }

  return {
    id: subject.id,
    subject: subject.content,
    sessions: sessionData,
    total_memories: relatedSubjects.results.length,
  };
}

export async function linkAcrossSessions(
  db: D1Database,
  sessionId: string
): Promise<{
  linked_count: number;
  threads: MemoryThread[];
}> {
  const subjects = await db
    .prepare(
      `SELECT * FROM memories WHERE session_id = ? AND type = ?`
    )
    .bind(sessionId, 'subject')
    .all<Memory>();

  const threads: MemoryThread[] = [];
  let linkedCount = 0;

  for (const subject of subjects.results) {
    const existingThread = await createMemoryThread(db, subject.id);
    if (existingThread && existingThread.sessions.length > 1) {
      threads.push(existingThread);
      linkedCount += existingThread.total_memories;
    }
  }

  return {
    linked_count: linkedCount,
    threads,
  };
}

export async function getMemoryContext(
  db: D1Database,
  memoryId: string,
  depth: number = 2
): Promise<{
  memory: Memory;
  ancestors: Memory[];
  siblings: Memory[];
  children: Memory[];
}> {
  const memory = await db
    .prepare('SELECT * FROM memories WHERE id = ?')
    .bind(memoryId)
    .first<Memory>();

  if (!memory) {
    throw new Error('Memory not found');
  }

  const ancestors: Memory[] = [];
  let currentParentId = memory.parent_id;

  for (let i = 0; i < depth && currentParentId; i++) {
    const parent = await db
      .prepare('SELECT * FROM memories WHERE id = ?')
      .bind(currentParentId)
      .first<Memory>();
    if (parent) {
      ancestors.push(parent);
      currentParentId = parent.parent_id;
    }
  }

  const siblings = memory.parent_id
    ? (
        await db
          .prepare('SELECT * FROM memories WHERE parent_id = ? AND id != ?')
          .bind(memory.parent_id, memoryId)
          .all<Memory>()
      ).results
    : [];

  const children = (
    await db
      .prepare('SELECT * FROM memories WHERE parent_id = ? ORDER BY importance DESC')
      .bind(memoryId)
      .all<Memory>()
  ).results;

  return {
    memory,
    ancestors,
    siblings,
    children,
  };
}
