#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = process.env.MEMORY_API_URL || "http://localhost:8787";

let currentSessionId: string | null = null;

async function api(method: string, path: string, body?: any) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function ensureSession(): Promise<string> {
  if (currentSessionId) return currentSessionId;
  const result = await api("POST", "/api/sessions", {
    summary: "Auto-created by MCP server",
  });
  currentSessionId = result.id;
  return currentSessionId;
}

const server = new McpServer({
  name: "neural-memory",
  version: "1.0.0",
});

server.tool(
  "memory_store",
  `Store a memory about the current conversation. 

IMPORTANT: You should AUTOMATICALLY store memories when:
- The user mentions a project, technology, or concept
- A decision is made about architecture or implementation
- The user shares preferences or requirements
- Important code patterns or solutions are discussed
- The user states a goal or objective

Do NOT wait for the user to ask you to remember something. Store it proactively.`,
  {
    type: z.enum(["subject", "action", "sub_action", "prompt_answer"]),
    content: z.string().describe("The memory content to store"),
    parent_id: z.string().optional().describe("Parent memory ID for hierarchy"),
    goal_id: z.string().optional().describe("Associated goal ID"),
    importance: z.number().min(1).max(10).optional().describe("Importance 1-10"),
    keywords: z.array(z.string()).optional().describe("Keywords for retrieval"),
  },
  async ({ type, content, parent_id, goal_id, importance, keywords }) => {
    const sessionId = await ensureSession();
    const result = await api("POST", "/api/memories", {
      type,
      content,
      session_id: sessionId,
      parent_id,
      goal_id,
      importance,
      keys: keywords ? { keywords } : undefined,
    });
    return {
      content: [{ type: "text", text: `Stored: ${content.substring(0, 50)}...` }],
    };
  }
);

server.tool(
  "memory_recall",
  "Recall relevant memories for a given query. Use this to find past context about a topic.",
  {
    query: z.string().describe("What to search for in memory"),
    limit: z.number().optional().default(5).describe("Max memories to return"),
  },
  async ({ query, limit }) => {
    const sessionId = await ensureSession();
    const embedResult = await api("POST", "/api/embed", { text: query });
    const memories = await api("POST", "/api/context/search", {
      query_embedding: embedResult.embedding,
      session_id: sessionId,
      limit,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(memories, null, 2) }],
    };
  }
);

server.tool(
  "memory_context",
  "Get formatted context for the current session. Use this at the start of a conversation to load relevant memories.",
  {},
  async () => {
    const sessionId = await ensureSession();
    const result = await api("GET", `/api/load/context?session_id=${sessionId}`);
    return {
      content: [{ type: "text", text: result.formatted || "No context available" }],
    };
  }
);

server.tool(
  "memory_headers",
  "Get lightweight memory headers for quick overview. Use this to see what's stored without loading full details.",
  {},
  async () => {
    const sessionId = await ensureSession();
    const result = await api("GET", `/api/load/headers?session_id=${sessionId}`);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "memory_goal_create",
  "Create a goal to track progress. Use this when the user sets an objective.",
  {
    description: z.string().describe("Goal description"),
    level: z.enum(["goal", "sub_goal", "task"]).optional().default("goal"),
    keywords: z.array(z.string()).optional(),
  },
  async ({ description, level, keywords }) => {
    const sessionId = await ensureSession();
    const result = await api("POST", "/api/goals", {
      description,
      session_id: sessionId,
      level,
      status: "active",
      keys: keywords ? { keywords } : undefined,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "memory_goal_active",
  "Get the currently active goal for a session.",
  {},
  async () => {
    const sessionId = await ensureSession();
    const result = await api("GET", `/api/goals/active?session_id=${sessionId}`);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "memory_goal_complete",
  "Mark a goal as completed.",
  {
    goal_id: z.string().describe("Goal ID to complete"),
  },
  async ({ goal_id }) => {
    const result = await api("PATCH", `/api/goals/${goal_id}`, {
      status: "completed",
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "memory_session_end",
  `End the current memory session and create a summary.

IMPORTANT: Call this when:
- The conversation is ending
- The user says goodbye or "that's all"
- The task is complete
- Before switching to a new topic

This ensures all important information from the session is preserved.`,
  {
    summary: z.string().optional().describe("Summary of what was accomplished"),
  },
  async ({ summary }) => {
    if (!currentSessionId) {
      return {
        content: [{ type: "text", text: "No active session to end" }],
      };
    }
    const result = await api("PATCH", `/api/sessions/${currentSessionId}`, {
      summary: summary || "Session completed",
    });
    const sessionId = currentSessionId;
    currentSessionId = null;
    return {
      content: [{ type: "text", text: `Session ${sessionId} ended. Summary saved.` }],
    };
  }
);

server.tool(
  "memory_session_create",
  "Create a new session for tracking conversations.",
  {
    summary: z.string().optional().describe("Session summary"),
  },
  async ({ summary }) => {
    const result = await api("POST", "/api/sessions", { summary });
    currentSessionId = result.id;
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "memory_drill_down",
  "Get detailed information about a specific memory including its children.",
  {
    memory_id: z.string().describe("Memory ID to drill into"),
  },
  async ({ memory_id }) => {
    const result = await api("GET", `/api/load/drill-down/memory?memory_id=${memory_id}`);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "memory_list_sessions",
  "List all memory sessions to see what's stored.",
  {},
  async () => {
    const result = await api("GET", "/api/sessions");
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Neural Memory MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
