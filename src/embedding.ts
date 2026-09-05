import { Bindings } from './types';

export async function computeEmbedding(text: string, ai?: Bindings['AI']): Promise<Float32Array> {
  if (ai) {
    try {
      const response = await ai.run('@cf/baai/bge-base-en-v1.5', {
        text: [text],
      });
      const embeddings = (response as any).data;
      return new Float32Array(embeddings[0]);
    } catch (e) {
      console.warn('Workers AI embedding failed, using fallback:', e);
    }
  }

  return fallbackEmbedding(text);
}

function fallbackEmbedding(text: string): Float32Array {
  const dim = 384;
  const embedding = new Float32Array(dim);
  const words = text.toLowerCase().split(/\s+/);

  for (let i = 0; i < dim; i++) {
    let sum = 0;
    for (const word of words) {
      const charSum = Array.from(word).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
      sum += Math.sin(charSum * (i + 1) * 0.1) * 0.5;
      sum += Math.cos(charSum * (i + 1) * 0.01) * 0.3;
    }
    embedding[i] = sum / Math.max(words.length, 1);
  }

  const norm = Math.sqrt(embedding.reduce((acc, v) => acc + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < dim; i++) {
      embedding[i] /= norm;
    }
  }

  return embedding;
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
