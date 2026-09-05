export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

export function findMostSimilar(
  queryEmbedding: Float32Array,
  candidates: Array<{ id: string; embedding: Float32Array }>
): Array<{ id: string; similarity: number }> {
  const results = candidates.map((candidate) => ({
    id: candidate.id,
    similarity: cosineSimilarity(queryEmbedding, candidate.embedding),
  }));

  return results.sort((a, b) => b.similarity - a.similarity);
}

export function isContextSwitch(
  similarity: number,
  threshold: number
): boolean {
  return similarity <= threshold;
}

export function shouldAskUser(
  similarity: number,
  threshold: number,
  highThreshold: number = 0.8
): boolean {
  if (similarity > highThreshold) {
    return false;
  }
  return similarity <= threshold;
}
