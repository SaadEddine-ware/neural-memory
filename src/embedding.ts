import { Bindings } from './types';

export async function computeEmbedding(text: string, ai?: Bindings['AI']): Promise<Float32Array> {
  if (!ai) {
    throw new Error(
      'Workers AI binding is required for embeddings. ' +
      'Add "ai" binding to wrangler.jsonc: { "ai": { "binding": "AI" } }'
    );
  }

  const response = await ai.run('@cf/baai/bge-base-en-v1.5', {
    text: [text],
  });

  const embeddings = (response as any).data;
  if (!embeddings || !embeddings[0]) {
    throw new Error('Workers AI returned empty embedding response');
  }

  return new Float32Array(embeddings[0]);
}

export function embeddingToBuffer(embedding: Float32Array): ArrayBuffer {
  const buffer = embedding.buffer.slice(
    embedding.byteOffset,
    embedding.byteOffset + embedding.byteLength
  );
  return buffer as ArrayBuffer;
}

export function bufferToEmbedding(buffer: ArrayBuffer): Float32Array {
  return new Float32Array(buffer);
}

export function embeddingToBase64(embedding: Float32Array): string {
  const buffer = embeddingToBuffer(embedding);
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToEmbedding(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Float32Array(bytes.buffer);
}
