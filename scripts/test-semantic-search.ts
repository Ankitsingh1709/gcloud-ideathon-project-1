/**
 * Checks the semantic memory search maths, and — when a Gemini key is
 * available — that real embeddings actually rank a related memory above an
 * unrelated one. Run: npx tsx scripts/test-semantic-search.ts
 */
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { l2Normalize, cosineSimilarity } from '../src/lib/vector';

dotenv.config();

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ SUCCESS: ${message}`);
    testsPassed++;
  } else {
    console.log(`❌ FAILURE: ${message}`);
    testsFailed++;
  }
}

console.log('\n🧠 SEMANTIC MEMORY SEARCH');
console.log('===========================================================');

// --- Pure maths -------------------------------------------------------------
{
  const v = [3, 4];
  assert(Math.abs(cosineSimilarity(v, v) - 1) < 1e-9, 'A vector is perfectly similar to itself');
  assert(Math.abs(cosineSimilarity([1, 0], [0, 1])) < 1e-9, 'Orthogonal vectors score 0');
  assert(Math.abs(cosineSimilarity([1, 0], [-1, 0]) + 1) < 1e-9, 'Opposite vectors score -1');
  assert(cosineSimilarity([1, 2, 3], [1, 2]) === 0, 'Mismatched dimensions score 0 instead of throwing');
  assert(cosineSimilarity([0, 0], [1, 1]) === 0, 'A zero vector scores 0 instead of dividing by zero');

  const normalized = l2Normalize(v);
  const length = Math.sqrt(normalized.reduce((s, x) => s + x * x, 0));
  assert(Math.abs(length - 1) < 1e-9, 'l2Normalize returns a unit-length vector');
  assert(Math.abs(cosineSimilarity(normalized, v) - 1) < 1e-9, 'Normalizing does not change direction');
  assert(l2Normalize([0, 0]).every(x => x === 0), 'l2Normalize leaves a zero vector alone');
}

// --- Real embeddings --------------------------------------------------------
async function testRealEmbeddings() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('⏭️  SKIPPED: live embedding ranking (no GEMINI_API_KEY set)');
    return;
  }

  const ai = new GoogleGenAI({ apiKey });

  async function embed(text: string): Promise<number[]> {
    const r: any = await ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: text,
      config: { outputDimensionality: 768, taskType: 'SEMANTIC_SIMILARITY' },
    });
    return l2Normalize(r.embeddings[0].values);
  }

  const query = 'I am completely overwhelmed by my workload and cannot switch off.';
  const related = 'Work has been relentless this month and the stress is following me home.';
  const unrelated = 'I baked sourdough for the first time and the crust came out perfect.';

  const [qv, relatedV, unrelatedV] = await Promise.all([embed(query), embed(related), embed(unrelated)]);

  assert(qv.length === 768, 'The embedding endpoint returns 768 dimensions');

  const relatedScore = cosineSimilarity(qv, relatedV);
  const unrelatedScore = cosineSimilarity(qv, unrelatedV);
  console.log(`   related: ${relatedScore.toFixed(4)}   unrelated: ${unrelatedScore.toFixed(4)}`);

  assert(relatedScore > unrelatedScore, 'A semantically related memory outranks an unrelated one');
  assert(relatedScore > 0.5, 'A clearly related memory scores above 0.5');

  // Normalized vectors make cosine and dot product equivalent — this is what
  // lets the UI rank with a plain dot product if it ever needs to.
  const dot = qv.reduce((s, x, i) => s + x * relatedV[i], 0);
  assert(Math.abs(dot - relatedScore) < 1e-6, 'On normalized vectors, cosine equals the dot product');
}

testRealEmbeddings()
  .catch(err => {
    console.log(`❌ FAILURE: live embedding check crashed: ${err?.message || err}`);
    testsFailed++;
  })
  .finally(() => {
    console.log('===========================================================');
    console.log(`📊 TEST RESULTS: ${testsPassed} passed, ${testsFailed} failed.`);
    process.exit(testsFailed > 0 ? 1 : 0);
  });
