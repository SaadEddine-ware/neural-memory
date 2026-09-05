import { KEYWORD_EXTRACTION_PROMPT, IMPORTANCE_SCORING_PROMPT } from './prompts.ts';

export interface ExtractedKeys {
  keywords: string[];
  importance: number;
}

export function parseKeywords(llmOutput: string): string[] {
  try {
    const cleaned = llmOutput.trim();
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [];
    }
    const keywords = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(keywords)) {
      return [];
    }
    return keywords
      .filter((k) => typeof k === 'string')
      .map((k) => k.toLowerCase().trim())
      .filter((k) => k.length > 0 && k.length <= 50);
  } catch {
    return [];
  }
}

export function parseImportance(llmOutput: string): number {
  try {
    const num = parseInt(llmOutput.trim(), 10);
    if (isNaN(num)) return 5;
    return Math.max(1, Math.min(10, num));
  } catch {
    return 5;
  }
}

export function buildKeywordPrompt(text: string): string {
  return KEYWORD_EXTRACTION_PROMPT.replace('{TEXT}', text);
}

export function buildImportancePrompt(
  type: string,
  content: string
): string {
  return IMPORTANCE_SCORING_PROMPT.replace('{TYPE}', type).replace(
    '{CONTENT}',
    content
  );
}

export function extractKeywordsFallback(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
    'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
    'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'both',
    'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
    'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
    'don', 'now', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves',
    'you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his',
    'himself', 'she', 'her', 'hers', 'herself', 'it', 'its', 'itself',
    'they', 'them', 'their', 'theirs', 'themselves', 'what', 'which', 'who',
    'whom', 'this', 'that', 'these', 'those', 'and', 'but', 'if', 'or',
    'because', 'until', 'while', 'about', 'against', 'up', 'down',
    'let', 'make', 'use', 'using', 'used', 'get', 'getting', 'got',
    'like', 'want', 'wanting', 'wanted', 'go', 'going', 'went', 'gone',
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  const freq = new Map<string, number>();
  for (const word of words) {
    freq.set(word, (freq.get(word) || 0) + 1);
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}

export function extractKeysFromResponse(
  response: string,
  llmKeywords?: string[]
): ExtractedKeys {
  const keywords = llmKeywords || extractKeywordsFallback(response);
  const importance = estimateImportance(response);

  return { keywords, importance };
}

function estimateImportance(text: string): number {
  const length = text.length;
  if (length > 1000) return 8;
  if (length > 500) return 7;
  if (length > 200) return 6;
  if (length > 100) return 5;
  return 4;
}
