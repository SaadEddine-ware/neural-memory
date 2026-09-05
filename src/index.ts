import {
  Bindings,
  CreateMemoryRequest,
  UpdateMemoryRequest,
  CreateGoalRequest,
  UpdateGoalRequest,
  CreateSessionRequest,
  UpdateSessionRequest,
  AutoExtractRequest,
  RetentionSettings,
} from './types';
import { jsonResponse, errorResponse } from './utils';
import { generateUUID, estimateTokens } from './utils';
import {
  createMemory,
  getMemory,
  getMemoriesBySession,
  getMemoriesByParent,
  updateMemory,
  deleteMemory,
} from './db/memories';
import {
  createGoal,
  getGoal,
  getGoalsBySession,
  getGoalsByParent,
  updateGoal,
  deleteGoal,
} from './db/goals';
import {
  createSession,
  getSession,
  getSessions,
  updateSession,
  deleteSession,
} from './db/sessions';
import {
  cosineSimilarity,
  findMostSimilar,
} from './similarity';
import { base64ToEmbedding, computeEmbedding, embeddingToBase64, embeddingToBuffer } from './embedding';
import {
  extractKeysFromResponse,
  parseKeywords,
  parseImportance,
  buildKeywordPrompt,
  buildImportancePrompt,
} from './extract';
import {
  getUserSettings,
  updateAdaptiveThreshold,
  getDecision,
} from './adaptive';
import {
  buildGoalInferencePrompt,
  buildGoalMatchingPrompt,
  parseGoalInference,
  parseGoalMatching,
  getGoalHierarchy,
  getActiveGoal,
  completeGoal,
} from './goals';
import {
  loadSessionHeaders,
  drillDownMemory,
  drillDownGoal,
  loadByImportance,
  searchByKeywords,
  formatContextForLLM,
} from './loading';
import {
  findLinkedMemories,
  createMemoryThread,
  linkAcrossSessions,
  getMemoryContext,
} from './linking';
import {
  getUserPattern,
  getTopicSuggestions,
  getSessionStats,
} from './adaptive-learning';
import {
  getRetentionSettings,
  updateRetentionSettings,
  getExpiredMemories,
  deleteExpiredMemories,
  getMemoryAge,
} from './retention';
import {
  buildSummaryPrompt,
  parseSummary,
  buildConversationHistory,
  generateSessionSummary,
  updateSessionSummary,
  getSessionSummary,
} from './summarization';

export default {
  async fetch(request: Request, env: Bindings): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS headers
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    try {
      // ========== MEMORIES ==========
      if (path === '/api/memories' && method === 'POST') {
        const body = (await request.json()) as CreateMemoryRequest;
        
        // Compute embedding
        let embeddingBuffer: ArrayBuffer | null = null;
        try {
          const embedding = await computeEmbedding(body.content, env.AI);
          embeddingBuffer = embeddingToBuffer(embedding);
        } catch (e) {
          console.error('Embedding failed:', e);
        }
        
        const id = generateUUID();
        const now = new Date().toISOString();
        const tokensEst = body.tokens_est || estimateTokens(body.content);
        const keysJson = JSON.stringify(body.keys || {});
        
        await env.DB.prepare(
          `INSERT INTO memories (id, parent_id, type, content, embedding, keys, goal_id, importance, tokens_est, session_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          id,
          body.parent_id || null,
          body.type,
          body.content,
          embeddingBuffer,
          keysJson,
          body.goal_id || null,
          body.importance || 5,
          tokensEst,
          body.session_id,
          now,
          now
        ).run();
        
        return jsonResponse({
          id,
          parent_id: body.parent_id || null,
          type: body.type,
          content: body.content,
          embedding: embeddingBuffer,
          keys: keysJson,
          goal_id: body.goal_id || null,
          importance: body.importance || 5,
          tokens_est: tokensEst,
          session_id: body.session_id,
          created_at: now,
          updated_at: now,
        }, 201);
      }

      if (path.startsWith('/api/memories/session/')) {
        const sessionId = path.split('/api/memories/session/')[1];
        const limit = parseInt(url.searchParams.get('limit') || '100');
        const offset = parseInt(url.searchParams.get('offset') || '0');
        const memories = await getMemoriesBySession(env.DB, sessionId, limit, offset);
        return jsonResponse(memories);
      }

      if (path.startsWith('/api/memories/parent/')) {
        const parentId = path.split('/api/memories/parent/')[1];
        const memories = await getMemoriesByParent(env.DB, parentId);
        return jsonResponse(memories);
      }

      if (path.match(/^\/api\/memories\/[a-f0-9-]+$/) && method === 'GET') {
        const id = path.split('/api/memories/')[1];
        const memory = await getMemory(env.DB, id);
        if (!memory) return errorResponse('Memory not found', 404);
        return jsonResponse(memory);
      }

      if (path.match(/^\/api\/memories\/[a-f0-9-]+$/) && method === 'PATCH') {
        const id = path.split('/api/memories/')[1];
        const body = (await request.json()) as UpdateMemoryRequest;
        const memory = await updateMemory(env.DB, id, body);
        if (!memory) return errorResponse('Memory not found', 404);
        return jsonResponse(memory);
      }

      if (path.match(/^\/api\/memories\/[a-f0-9-]+$/) && method === 'DELETE') {
        const id = path.split('/api/memories/')[1];
        const deleted = await deleteMemory(env.DB, id);
        if (!deleted) return errorResponse('Memory not found', 404);
        return jsonResponse({ success: true });
      }

      // ========== GOALS ==========
      if (path === '/api/goals' && method === 'POST') {
        const body = (await request.json()) as CreateGoalRequest;
        const goal = await createGoal(env.DB, body);
        return jsonResponse(goal, 201);
      }

      if (path.startsWith('/api/goals/session/')) {
        const sessionId = path.split('/api/goals/session/')[1];
        const limit = parseInt(url.searchParams.get('limit') || '100');
        const offset = parseInt(url.searchParams.get('offset') || '0');
        const goals = await getGoalsBySession(env.DB, sessionId, limit, offset);
        return jsonResponse(goals);
      }

      if (path.startsWith('/api/goals/parent/')) {
        const parentId = path.split('/api/goals/parent/')[1];
        const goals = await getGoalsByParent(env.DB, parentId);
        return jsonResponse(goals);
      }

      if (path.match(/^\/api\/goals\/[a-f0-9-]+$/) && method === 'GET') {
        const id = path.split('/api/goals/')[1];
        const goal = await getGoal(env.DB, id);
        if (!goal) return errorResponse('Goal not found', 404);
        return jsonResponse(goal);
      }

      if (path.match(/^\/api\/goals\/[a-f0-9-]+$/) && method === 'PATCH') {
        const id = path.split('/api/goals/')[1];
        const body = (await request.json()) as UpdateGoalRequest;
        const goal = await updateGoal(env.DB, id, body);
        if (!goal) return errorResponse('Goal not found', 404);
        return jsonResponse(goal);
      }

      if (path.match(/^\/api\/goals\/[a-f0-9-]+$/) && method === 'DELETE') {
        const id = path.split('/api/goals/')[1];
        const deleted = await deleteGoal(env.DB, id);
        if (!deleted) return errorResponse('Goal not found', 404);
        return jsonResponse({ success: true });
      }

      // ========== SESSIONS ==========
      if (path === '/api/sessions' && method === 'POST') {
        const body = (await request.json()) as CreateSessionRequest;
        const session = await createSession(env.DB, body);
        return jsonResponse(session, 201);
      }

      if (path === '/api/sessions' && method === 'GET') {
        const limit = parseInt(url.searchParams.get('limit') || '50');
        const offset = parseInt(url.searchParams.get('offset') || '0');
        const sessions = await getSessions(env.DB, limit, offset);
        return jsonResponse(sessions);
      }

      if (path.match(/^\/api\/sessions\/[a-f0-9-]+$/) && method === 'GET') {
        const id = path.split('/api/sessions/')[1];
        const session = await getSession(env.DB, id);
        if (!session) return errorResponse('Session not found', 404);
        return jsonResponse(session);
      }

      if (path.match(/^\/api\/sessions\/[a-f0-9-]+$/) && method === 'PATCH') {
        const id = path.split('/api/sessions/')[1];
        const body = (await request.json()) as UpdateSessionRequest;
        const session = await updateSession(env.DB, id, body);
        if (!session) return errorResponse('Session not found', 404);
        return jsonResponse(session);
      }

      if (path.match(/^\/api\/sessions\/[a-f0-9-]+$/) && method === 'DELETE') {
        const id = path.split('/api/sessions/')[1];
        const deleted = await deleteSession(env.DB, id);
        if (!deleted) return errorResponse('Session not found', 404);
        return jsonResponse({ success: true });
      }

      // ========== CONTEXT SWITCH DETECTION ==========
      if (path === '/api/context/compare' && method === 'POST') {
        const body = (await request.json()) as {
          query_embedding: string;
          target_embedding: string;
        };
        
        const queryEmb = base64ToEmbedding(body.query_embedding);
        const targetEmb = base64ToEmbedding(body.target_embedding);
        const similarity = cosineSimilarity(queryEmb, targetEmb);
        
        return jsonResponse({ similarity });
      }

      if (path === '/api/context/detect' && method === 'POST') {
        const body = (await request.json()) as {
          query_embedding: string;
          current_goal_id: string;
          user_id: string;
        };
        
        const goal = await getGoal(env.DB, body.current_goal_id);
        if (!goal) {
          return errorResponse('Goal not found', 404);
        }
        
        const settings = await getUserSettings(env.DB, body.user_id);
        const queryEmb = base64ToEmbedding(body.query_embedding);
        
        let similarity = 0;
        if (goal.embedding) {
          const goalEmb = new Float32Array(goal.embedding);
          similarity = cosineSimilarity(queryEmb, goalEmb);
        }
        
        const decision = getDecision(similarity, settings.similarity_threshold);
        
        return jsonResponse({
          similarity,
          threshold: settings.similarity_threshold,
          decision,
          goal_id: goal.id,
          goal_description: goal.description,
        });
      }

      if (path === '/api/context/confirm' && method === 'POST') {
        const body = (await request.json()) as {
          user_id: string;
          confirmed: boolean;
        };
        
        const settings = await updateAdaptiveThreshold(
          env.DB,
          body.user_id,
          body.confirmed
        );
        
        return jsonResponse({
          threshold: settings.similarity_threshold,
          total_confirmations: settings.total_confirmations,
        });
      }

      if (path === '/api/context/search' && method === 'POST') {
        const body = (await request.json()) as {
          query_embedding: string;
          session_id: string;
          limit?: number;
        };
        
        const memories = await getMemoriesBySession(
          env.DB,
          body.session_id,
          body.limit || 10
        );
        
        const embeddings = memories
          .filter((m) => m.embedding)
          .map((m) => {
            // Convert byte array to Float32Array
            const bytes = new Uint8Array(m.embedding!);
            const floats = new Float32Array(bytes.buffer);
            return {
              id: m.id,
              embedding: floats,
              memory: m,
            };
          });
        
        const queryEmb = base64ToEmbedding(body.query_embedding);
        const results = findMostSimilar(queryEmb, embeddings.map(e => ({ id: e.id, embedding: e.embedding })));
        
        // Enrich results with full memory data
        const enriched = results.map(r => {
          const mem = embeddings.find(e => e.id === r.id)?.memory;
          return {
            ...r,
            type: mem?.type,
            content: mem?.content,
            importance: mem?.importance,
            created_at: mem?.created_at,
            keys: mem?.keys,
          };
        });
        
        return jsonResponse(enriched);
      }

      // ========== USER SETTINGS ==========
      if (path === '/api/settings' && method === 'GET') {
        const userId = url.searchParams.get('user_id');
        if (!userId) {
          return errorResponse('user_id is required');
        }
        const settings = await getUserSettings(env.DB, userId);
        return jsonResponse(settings);
      }

      if (path === '/api/settings' && method === 'PATCH') {
        const body = (await request.json()) as {
          user_id: string;
          confirmed: boolean;
        };
        const settings = await updateAdaptiveThreshold(
          env.DB,
          body.user_id,
          body.confirmed
        );
        return jsonResponse(settings);
      }

      // ========== KEYWORD EXTRACTION ==========
      if (path === '/api/extract/keys' && method === 'POST') {
        const body = (await request.json()) as { text: string };
        const keys = extractKeysFromResponse(body.text);
        return jsonResponse(keys);
      }

      if (path === '/api/extract/prompt' && method === 'POST') {
        const body = (await request.json()) as { text: string };
        const prompt = buildKeywordPrompt(body.text);
        return jsonResponse({ prompt });
      }

      if (path === '/api/extract/importance-prompt' && method === 'POST') {
        const body = (await request.json()) as {
          type: string;
          content: string;
        };
        const prompt = buildImportancePrompt(body.type, body.content);
        return jsonResponse({ prompt });
      }

      if (path === '/api/extract/auto' && method === 'POST') {
        const body = (await request.json()) as AutoExtractRequest;
        
        const extracted = extractKeysFromResponse(
          body.content,
          body.llm_keywords
        );

        const finalKeys = {
          keywords: body.llm_keywords || extracted.keywords,
          importance: body.llm_importance || extracted.importance,
        };

        const memoryData: CreateMemoryRequest = {
          type: body.type,
          content: body.content,
          session_id: body.session_id,
          parent_id: body.parent_id,
          goal_id: body.goal_id,
          keys: finalKeys,
          importance: finalKeys.importance,
        };

        const memory = await createMemory(env.DB, memoryData);
        return jsonResponse(memory, 201);
      }

      if (path === '/api/embed' && method === 'POST') {
        const body = (await request.json()) as { text: string };
        const embedding = await computeEmbedding(body.text, env.AI);
        const base64 = embeddingToBase64(embedding);
        return jsonResponse({ embedding: base64, dimensions: embedding.length });
      }

      // ========== GOAL TRACKING ==========
      if (path === '/api/goals/infer' && method === 'POST') {
        const body = (await request.json()) as { conversation: string };
        const prompt = buildGoalInferencePrompt(body.conversation);
        return jsonResponse({ prompt });
      }

      if (path === '/api/goals/match' && method === 'POST') {
        const body = (await request.json()) as {
          conversation: string;
          session_id: string;
        };
        const goals = await getGoalsBySession(env.DB, body.session_id);
        const prompt = buildGoalMatchingPrompt(goals, body.conversation);
        return jsonResponse({ prompt, goals });
      }

      if (path === '/api/goals/infer-auto' && method === 'POST') {
        const body = (await request.json()) as {
          conversation: string;
          session_id: string;
          llm_goals?: CreateGoalRequest[];
        };

        let goalsToCreate: CreateGoalRequest[] = [];

        if (body.llm_goals) {
          goalsToCreate = body.llm_goals.map((g) => ({
            ...g,
            session_id: body.session_id,
          }));
        } else {
          const extracted = parseGoalInference(body.conversation);
          goalsToCreate = extracted.map((g) => ({
            ...g,
            session_id: body.session_id,
          }));
        }

        const createdGoals = [];
        for (const goal of goalsToCreate) {
          const created = await createGoal(env.DB, goal);
          createdGoals.push(created);
        }

        return jsonResponse({ goals: createdGoals }, 201);
      }

      if (path === '/api/goals/hierarchy' && method === 'GET') {
        const sessionId = url.searchParams.get('session_id');
        if (!sessionId) {
          return errorResponse('session_id is required');
        }
        const { goals, hierarchy } = await getGoalHierarchy(env.DB, sessionId);
        const hierarchyObj: Record<string, typeof goals> = {};
        hierarchy.forEach((value, key) => {
          hierarchyObj[key] = value;
        });
        return jsonResponse({ goals, hierarchy: hierarchyObj });
      }

      if (path === '/api/goals/active' && method === 'GET') {
        const sessionId = url.searchParams.get('session_id');
        if (!sessionId) {
          return errorResponse('session_id is required');
        }
        const goal = await getActiveGoal(env.DB, sessionId);
        return jsonResponse(goal);
      }

      if (path.match(/^\/api\/goals\/[a-f0-9-]+\/complete$/) && method === 'POST') {
        const id = path.split('/api/goals/')[1].split('/')[0];
        const goal = await completeGoal(env.DB, id);
        if (!goal) return errorResponse('Goal not found', 404);
        return jsonResponse(goal);
      }

      if (path === '/api/goals/link-memory' && method === 'POST') {
        const body = (await request.json()) as {
          memory_id: string;
          goal_id: string;
        };
        const memory = await updateMemory(env.DB, body.memory_id, {
          goal_id: body.goal_id,
        });
        if (!memory) return errorResponse('Memory not found', 404);
        return jsonResponse(memory);
      }

      // ========== PROGRESSIVE LOADING ==========
      if (path === '/api/load/headers' && method === 'GET') {
        const sessionId = url.searchParams.get('session_id');
        if (!sessionId) {
          return errorResponse('session_id is required');
        }
        const context = await loadSessionHeaders(env.DB, sessionId);
        return jsonResponse(context);
      }

      if (path === '/api/load/context' && method === 'GET') {
        const sessionId = url.searchParams.get('session_id');
        if (!sessionId) {
          return errorResponse('session_id is required');
        }
        const context = await loadSessionHeaders(env.DB, sessionId);
        const formatted = formatContextForLLM(context);
        return jsonResponse({ context, formatted });
      }

      if (path === '/api/load/drill-down/memory' && method === 'GET') {
        const memoryId = url.searchParams.get('memory_id');
        if (!memoryId) {
          return errorResponse('memory_id is required');
        }
        try {
          const result = await drillDownMemory(env.DB, memoryId);
          return jsonResponse(result);
        } catch {
          return errorResponse('Memory not found', 404);
        }
      }

      if (path === '/api/load/drill-down/goal' && method === 'GET') {
        const goalId = url.searchParams.get('goal_id');
        if (!goalId) {
          return errorResponse('goal_id is required');
        }
        try {
          const result = await drillDownGoal(env.DB, goalId);
          return jsonResponse(result);
        } catch {
          return errorResponse('Goal not found', 404);
        }
      }

      if (path === '/api/load/by-importance' && method === 'GET') {
        const sessionId = url.searchParams.get('session_id');
        if (!sessionId) {
          return errorResponse('session_id is required');
        }
        const maxTokens = parseInt(url.searchParams.get('max_tokens') || '2000');
        const memories = await loadByImportance(env.DB, sessionId, maxTokens);
        return jsonResponse(memories);
      }

      if (path === '/api/load/search' && method === 'POST') {
        const body = (await request.json()) as {
          session_id: string;
          keywords: string[];
        };
        const memories = await searchByKeywords(env.DB, body.session_id, body.keywords);
        return jsonResponse(memories);
      }

      // ========== CROSS-SESSION LINKING ==========
      if (path === '/api/link/linked' && method === 'GET') {
        const memoryId = url.searchParams.get('memory_id');
        if (!memoryId) {
          return errorResponse('memory_id is required');
        }
        try {
          const links = await findLinkedMemories(env.DB, memoryId);
          return jsonResponse(links);
        } catch {
          return errorResponse('Memory not found', 404);
        }
      }

      if (path === '/api/link/thread' && method === 'GET') {
        const memoryId = url.searchParams.get('memory_id');
        if (!memoryId) {
          return errorResponse('memory_id is required');
        }
        const thread = await createMemoryThread(env.DB, memoryId);
        if (!thread) {
          return errorResponse('Subject memory not found', 404);
        }
        return jsonResponse(thread);
      }

      if (path === '/api/link/session' && method === 'POST') {
        const body = (await request.json()) as { session_id: string };
        const result = await linkAcrossSessions(env.DB, body.session_id);
        return jsonResponse(result);
      }

      if (path === '/api/link/context' && method === 'GET') {
        const memoryId = url.searchParams.get('memory_id');
        if (!memoryId) {
          return errorResponse('memory_id is required');
        }
        const depth = parseInt(url.searchParams.get('depth') || '2');
        try {
          const context = await getMemoryContext(env.DB, memoryId, depth);
          return jsonResponse(context);
        } catch {
          return errorResponse('Memory not found', 404);
        }
      }

      // ========== ADAPTIVE LEARNING ==========
      if (path === '/api/adaptive/pattern' && method === 'GET') {
        const userId = url.searchParams.get('user_id');
        if (!userId) {
          return errorResponse('user_id is required');
        }
        const pattern = await getUserPattern(env.DB, userId);
        return jsonResponse(pattern);
      }

      if (path === '/api/adaptive/topics' && method === 'GET') {
        const userId = url.searchParams.get('user_id');
        if (!userId) {
          return errorResponse('user_id is required');
        }
        const limit = parseInt(url.searchParams.get('limit') || '5');
        const topics = await getTopicSuggestions(env.DB, userId, limit);
        return jsonResponse({ topics });
      }

      if (path === '/api/adaptive/stats' && method === 'GET') {
        const sessionId = url.searchParams.get('session_id');
        if (!sessionId) {
          return errorResponse('session_id is required');
        }
        const stats = await getSessionStats(env.DB, sessionId);
        return jsonResponse(stats);
      }

      // ========== MEMORY RETENTION ==========
      if (path === '/api/retention/settings' && method === 'GET') {
        const userId = url.searchParams.get('user_id');
        if (!userId) {
          return errorResponse('user_id is required');
        }
        const settings = await getRetentionSettings(env.DB, userId);
        return jsonResponse(settings);
      }

      if (path === '/api/retention/settings' && method === 'PATCH') {
        const body = (await request.json()) as {
          user_id: string;
          settings: Partial<Omit<RetentionSettings, 'user_id'>>;
        };
        const settings = await updateRetentionSettings(
          env.DB,
          body.user_id,
          body.settings
        );
        return jsonResponse(settings);
      }

      if (path === '/api/retention/expired' && method === 'GET') {
        const userId = url.searchParams.get('user_id');
        if (!userId) {
          return errorResponse('user_id is required');
        }
        const expired = await getExpiredMemories(env.DB, userId);
        return jsonResponse({ expired, count: expired.length });
      }

      if (path === '/api/retention/cleanup' && method === 'POST') {
        const body = (await request.json()) as { user_id: string };
        const result = await deleteExpiredMemories(env.DB, body.user_id);
        return jsonResponse(result);
      }

      if (path === '/api/retention/age' && method === 'GET') {
        const memoryId = url.searchParams.get('memory_id');
        if (!memoryId) {
          return errorResponse('memory_id is required');
        }
        try {
          const age = await getMemoryAge(env.DB, memoryId);
          return jsonResponse(age);
        } catch {
          return errorResponse('Memory not found', 404);
        }
      }

      // ========== SESSION SUMMARIZATION ==========
      if (path === '/api/summary/prompt' && method === 'POST') {
        const body = (await request.json()) as { session_id: string };
        const history = await buildConversationHistory(env.DB, body.session_id);
        const prompt = buildSummaryPrompt(history);
        return jsonResponse({ prompt });
      }

      if (path === '/api/summary/generate' && method === 'POST') {
        const body = (await request.json()) as { session_id: string };
        const summary = await generateSessionSummary(env.DB, body.session_id);
        return jsonResponse(summary);
      }

      if (path === '/api/summary/update' && method === 'POST') {
        const body = (await request.json()) as {
          session_id: string;
          summary: string;
        };
        await updateSessionSummary(env.DB, body.session_id, body.summary);
        return jsonResponse({ success: true });
      }

      if (path === '/api/summary' && method === 'GET') {
        const sessionId = url.searchParams.get('session_id');
        if (!sessionId) {
          return errorResponse('session_id is required');
        }
        const summary = await getSessionSummary(env.DB, sessionId);
        return jsonResponse(summary);
      }

      // ========== HEALTH ==========
      if (path === '/api/health') {
        return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() });
      }

      return errorResponse('Not Found', 404);
    } catch (error) {
      console.error('Request error:', error);
      return errorResponse(
        error instanceof Error ? error.message : 'Internal Server Error',
        500
      );
    }
  },
};
