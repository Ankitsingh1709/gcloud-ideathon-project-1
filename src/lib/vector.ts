/**
 * Vector helpers shared by the embedding endpoint, the semantic search UI,
 * and the test suite. Kept dependency-free so the server can import it too.
 */

/**
 * Scale a vector to unit length. gemini-embedding-001 returns an unnormalized
 * vector whenever outputDimensionality is not the native 3072 (measured L2 of
 * ~0.59 at 768 dims), so we normalize once on write. Afterwards cosine
 * similarity is just a dot product.
 */
export function l2Normalize(vector: number[]): number[] {
  let sumOfSquares = 0;
  for (const value of vector) sumOfSquares += value * value;
  const norm = Math.sqrt(sumOfSquares);
  if (norm === 0) return vector.slice();
  return vector.map(value => value / norm);
}

/**
 * Cosine similarity in [-1, 1]. Divides by the norms rather than assuming
 * unit-length inputs, so it stays correct for vectors stored before
 * normalization was introduced.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
