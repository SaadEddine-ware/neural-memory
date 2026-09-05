const BASE = 'http://localhost:8787';

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log('  ✅ ' + name);
  } catch (e: any) {
    console.log('  ❌ ' + name + ': ' + e.message);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

async function api(method: string, path: string, body?: any) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
}

let sessionId = '';
let memoryId = '';
let goalId = '';

async function run() {
  console.log('\n🧠 Neural Memory System - Test Suite\n');

  // ========== HEALTH ==========
  console.log('\nHealth:');
  await test('GET /api/health', async () => {
    const { data } = await api('GET', '/api/health');
    assert(data.status === 'ok', 'Status not ok');
  });

  // ========== EMBEDDING ==========
  console.log('\nEmbedding:');
  let emb1 = '';
  let emb2 = '';

  await test('POST /api/embed (single text)', async () => {
    const { status, data } = await api('POST', '/api/embed', {
      text: 'building neural memory systems',
    });
    assert(status === 200, 'Status not 200');
    assert(data.embedding, 'No embedding');
    assert(data.dimensions >= 300, 'Dimensions too low: ' + data.dimensions);
    emb1 = data.embedding;
  });

  await test('POST /api/embed (similar text)', async () => {
    const { status, data } = await api('POST', '/api/embed', {
      text: 'constructing neural memory architectures',
    });
    assert(status === 200, 'Status not 200');
    emb2 = data.embedding;
  });

  await test('POST /api/embed (unrelated text)', async () => {
    const { status, data } = await api('POST', '/api/embed', {
      text: 'baking sourdough bread recipe',
    });
    assert(status === 200, 'Status not 200');
    assert(data.dimensions >= 300, 'Dimensions too low');
  });

  await test('Similar pair scores higher than unrelated pair', async () => {
    assert(emb1 && emb2, 'Embeddings not captured from earlier tests');

    const similarScore = await api('POST', '/api/context/compare', {
      query_embedding: emb1,
      target_embedding: emb2,
    });

    const unrelatedEmb = await api('POST', '/api/embed', {
      text: 'baking sourdough bread recipe',
    });
    const unrelatedScore = await api('POST', '/api/context/compare', {
      query_embedding: emb1,
      target_embedding: unrelatedEmb.data.embedding,
    });

    assert(
      similarScore.data.similarity > unrelatedScore.data.similarity,
      `Similar (${similarScore.data.similarity}) should score higher than unrelated (${unrelatedScore.data.similarity})`
    );
  });

  // ========== SESSIONS ==========
  console.log('\nSessions:');
  await test('POST /api/sessions', async () => {
    const { status, data } = await api('POST', '/api/sessions', {
      summary: 'Test session for neural memory',
    });
    assert(status === 201, 'Status not 201');
    sessionId = data.id;
    assert(data.id, 'No session ID');
  });

  await test('GET /api/sessions', async () => {
    const { data } = await api('GET', '/api/sessions');
    assert(Array.isArray(data), 'Not an array');
    assert(data.length > 0, 'Empty array');
  });

  await test('GET /api/sessions/:id', async () => {
    const { data } = await api('GET', '/api/sessions/' + sessionId);
    assert(data.id === sessionId, 'Wrong session');
  });

  // ========== MEMORIES ==========
  console.log('\nMemories:');
  await test('POST /api/memories (subject)', async () => {
    const { status, data } = await api('POST', '/api/memories', {
      type: 'subject',
      content: 'Building Neural Memory System',
      keys: { keywords: ['neural', 'memory', 'ai'] },
      importance: 10,
      session_id: sessionId,
    });
    assert(status === 201, 'Status not 201');
    memoryId = data.id;
    assert(data.type === 'subject', 'Wrong type');
  });

  await test('POST /api/memories (action)', async () => {
    const { status, data } = await api('POST', '/api/memories', {
      type: 'action',
      content: 'Implementing D1 Storage',
      keys: { keywords: ['d1', 'database', 'storage'] },
      importance: 8,
      session_id: sessionId,
      parent_id: memoryId,
    });
    assert(status === 201, 'Status not 201');
  });

  await test('GET /api/memories/:id', async () => {
    const { data } = await api('GET', '/api/memories/' + memoryId);
    assert(data.id === memoryId, 'Wrong memory');
  });

  await test('GET /api/memories/session/:id', async () => {
    const { data } = await api('GET', '/api/memories/session/' + sessionId);
    assert(Array.isArray(data), 'Not an array');
    assert(data.length >= 2, 'Not enough memories');
  });

  await test('PATCH /api/memories/:id', async () => {
    const { data } = await api('PATCH', '/api/memories/' + memoryId, {
      content: 'Building Neural Memory System - Updated',
      importance: 9,
    });
    assert(data.content.includes('Updated'), 'Content not updated');
  });

  // ========== GOALS ==========
  console.log('\nGoals:');
  await test('POST /api/goals', async () => {
    const { status, data } = await api('POST', '/api/goals', {
      description: 'Complete Phase 1',
      level: 'goal',
      status: 'active',
      keys: { keywords: ['phase1', 'memory'] },
      session_id: sessionId,
    });
    assert(status === 201, 'Status not 201');
    goalId = data.id;
  });

  await test('POST /api/goals (sub_goal)', async () => {
    const { status } = await api('POST', '/api/goals', {
      description: 'Set up database',
      level: 'sub_goal',
      status: 'completed',
      parent_goal_id: goalId,
      session_id: sessionId,
    });
    assert(status === 201, 'Status not 201');
  });

  await test('GET /api/goals/hierarchy', async () => {
    const { data } = await api('GET', '/api/goals/hierarchy?session_id=' + sessionId);
    assert(data.goals, 'No goals');
    assert(data.hierarchy, 'No hierarchy');
  });

  await test('GET /api/goals/active', async () => {
    const { data } = await api('GET', '/api/goals/active?session_id=' + sessionId);
    assert(data, 'No active goal');
  });

  // ========== KEYWORD EXTRACTION ==========
  console.log('\nKeyword Extraction:');
  await test('POST /api/extract/keys', async () => {
    const { data } = await api('POST', '/api/extract/keys', {
      text: 'Build the database with PostgreSQL',
    });
    assert(data.keywords, 'No keywords');
    assert(Array.isArray(data.keywords), 'Keywords not array');
  });

  await test('POST /api/extract/prompt', async () => {
    const { data } = await api('POST', '/api/extract/prompt', {
      text: 'Build the database',
    });
    assert(data.prompt, 'No prompt');
    assert(data.prompt.includes('keyword'), 'Prompt missing keyword');
  });

  // ========== PROGRESSIVE LOADING ==========
  console.log('\nProgressive Loading:');
  await test('GET /api/load/headers', async () => {
    const { data } = await api('GET', '/api/load/headers?session_id=' + sessionId);
    assert(data.headers, 'No headers');
    assert(data.goals, 'No goals');
  });

  await test('GET /api/load/context', async () => {
    const { data } = await api('GET', '/api/load/context?session_id=' + sessionId);
    assert(data.formatted, 'No formatted context');
    assert(data.formatted.includes('SESSION CONTEXT'), 'Missing header');
  });

  await test('GET /api/load/drill-down/memory', async () => {
    const { data } = await api('GET', '/api/load/drill-down/memory?memory_id=' + memoryId);
    assert(data.memory, 'No memory');
    assert(Array.isArray(data.children), 'No children');
  });

  // ========== CROSS-SESSION LINKING ==========
  console.log('\nCross-session Linking:');
  await test('GET /api/link/linked', async () => {
    const { data } = await api('GET', '/api/link/linked?memory_id=' + memoryId);
    assert(Array.isArray(data), 'Not an array');
  });

  await test('GET /api/link/context', async () => {
    const { data } = await api('GET', '/api/link/context?memory_id=' + memoryId);
    assert(data.memory, 'No memory');
    assert(Array.isArray(data.ancestors), 'No ancestors');
    assert(Array.isArray(data.children), 'No children');
  });

  await test('POST /api/link/session', async () => {
    const { data } = await api('POST', '/api/link/session', {
      session_id: sessionId,
    });
    assert('linked_count' in data, 'No linked_count');
  });

  // ========== ADAPTIVE LEARNING ==========
  console.log('\nAdaptive Learning:');
  await test('GET /api/adaptive/pattern', async () => {
    const { data } = await api('GET', '/api/adaptive/pattern?user_id=test-user');
    assert(data.user_id === 'test-user', 'Wrong user');
    assert('focus_score' in data, 'No focus_score');
  });

  await test('GET /api/adaptive/topics', async () => {
    const { data } = await api('GET', '/api/adaptive/topics?user_id=test-user');
    assert(Array.isArray(data.topics), 'No topics');
  });

  await test('GET /api/adaptive/stats', async () => {
    const { data } = await api('GET', '/api/adaptive/stats?session_id=' + sessionId);
    assert('total_memories' in data, 'No total_memories');
  });

  // ========== MEMORY RETENTION ==========
  console.log('\nMemory Retention:');
  await test('GET /api/retention/settings', async () => {
    const { data } = await api('GET', '/api/retention/settings?user_id=test-user');
    assert(data.user_id === 'test-user', 'Wrong user');
    assert('subject_duration_days' in data, 'No duration');
  });

  await test('GET /api/retention/expired', async () => {
    const { data } = await api('GET', '/api/retention/expired?user_id=test-user');
    assert('expired' in data, 'No expired');
    assert('count' in data, 'No count');
  });

  await test('GET /api/retention/age', async () => {
    const { data } = await api('GET', '/api/retention/age?memory_id=' + memoryId);
    assert('days_old' in data, 'No days_old');
    assert('retention_days' in data, 'No retention_days');
  });

  // ========== SESSION SUMMARIZATION ==========
  console.log('\nSession Summarization:');
  await test('GET /api/summary', async () => {
    const { data } = await api('GET', '/api/summary?session_id=' + sessionId);
    assert('summary' in data, 'No summary');
    assert('memory_count' in data, 'No memory_count');
  });

  await test('POST /api/summary/generate', async () => {
    const { data } = await api('POST', '/api/summary/generate', {
      session_id: sessionId,
    });
    assert(data.session_id === sessionId, 'Wrong session');
    assert(data.summary, 'No summary');
  });

  await test('POST /api/summary/prompt', async () => {
    const { data } = await api('POST', '/api/summary/prompt', {
      session_id: sessionId,
    });
    assert(data.prompt, 'No prompt');
  });

  // ========== CLEANUP ==========
  console.log('\nCleanup:');
  await test('DELETE /api/memories/:id', async () => {
    const { data } = await api('DELETE', '/api/memories/' + memoryId);
    assert(data.success, 'Not deleted');
  });

  await test('DELETE /api/goals/:id', async () => {
    const { data } = await api('DELETE', '/api/goals/' + goalId);
    assert(data.success, 'Not deleted');
  });

  await test('DELETE /api/sessions/:id', async () => {
    const { data } = await api('DELETE', '/api/sessions/' + sessionId);
    assert(data.success, 'Not deleted');
  });

  console.log('\n✨ All tests complete!\n');
}

run().catch(console.error);
