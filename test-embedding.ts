import { computeEmbedding, embeddingToBase64 } from './src/embedding.js';
import { cosineSimilarity } from './src/similarity.js';

async function test() {
  console.log('Testing embedding model...\n');

  const text1 = 'Build the database with PostgreSQL';
  const text2 = 'Now make the REST API';
  const text3 = 'The UX looks bad';

  console.log('Computing embeddings...');
  const emb1 = await computeEmbedding(text1);
  const emb2 = await computeEmbedding(text2);
  const emb3 = await computeEmbedding(text3);

  console.log(`Text 1: "${text1}"`);
  console.log(`Text 2: "${text2}"`);
  console.log(`Text 3: "${text3}"\n`);

  const sim12 = cosineSimilarity(emb1, emb2);
  const sim13 = cosineSimilarity(emb1, emb3);
  const sim23 = cosineSimilarity(emb2, emb3);

  console.log(`Similarity (database vs API): ${sim12.toFixed(4)}`);
  console.log(`Similarity (database vs UX): ${sim13.toFixed(4)}`);
  console.log(`Similarity (API vs UX): ${sim23.toFixed(4)}\n`);

  console.log('Thresholds:');
  console.log(`> 0.8 = Same context (continue)`);
  console.log(`0.4 - 0.8 = Uncertain (ask user)`);
  console.log(`< 0.4 = Different context (switch)\n`);

  console.log('Base64 encoding test:');
  const base64 = embeddingToBase64(emb1);
  console.log(`Encoded length: ${base64.length} chars`);
  console.log(`First 50 chars: ${base64.substring(0, 50)}...`);
}

test().catch(console.error);
