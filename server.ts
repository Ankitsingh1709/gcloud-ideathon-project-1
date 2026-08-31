import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import dotenv from 'dotenv';
import { l2Normalize } from './src/lib/vector';

dotenv.config();

const app = express();
// Cloud Run injects PORT (8080 by default); fall back to 3000 for local dev.
const PORT = Number(process.env.PORT) || 3000;
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "lab1-rag-project";
const FIREBASE_AUTH_DOMAIN = `${FIREBASE_PROJECT_ID}.firebaseapp.com`;
const APP_VERSION = '1.3.0';

// Bound the request body before any route handler ever sees it.
app.use(express.json({ limit: '64kb' }));

// Baseline security headers on every response.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // Voice journaling needs the mic; the map picker may ask for location.
  res.setHeader('Permissions-Policy', 'geolocation=(self), microphone=(self), camera=()');
  next();
});

// Content-Security-Policy, enforced in production only: the Vite dev server
// needs inline scripts and a websocket that the production bundle does not.
// React sets inline style attributes, so style-src must allow 'unsafe-inline'.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' https://apis.google.com https://maps.googleapis.com https://*.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.ggpht.com https://lh3.googleusercontent.com",
  // Firebase Auth + Firestore WebChannel + the Gemini proxy + Maps tiles.
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com",
  // Firebase Auth completes sign-in through an iframe on the authDomain.
  `frame-src 'self' https://${FIREBASE_AUTH_DOMAIN} https://accounts.google.com`,
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
].join('; ');

if (process.env.NODE_ENV === 'production') {
  app.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    next();
  });
}

// JWKS Client for Firebase Auth Token Verification
const jwksClientInstance = jwksRsa({
  jwksUri: 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
  cache: true,
  rateLimit: true,
});

function getKey(header: any, callback: any) {
  jwksClientInstance.getSigningKey(header.kid, (err, key) => {
    if (err || !key) {
      callback(err || new Error('No signing key found'));
    } else {
      const signingKey = key.getPublicKey();
      callback(null, signingKey);
    }
  });
}

// Security Middleware: Authenticate requests using Firebase ID token
function authenticateFirebaseUser(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header. Expected Bearer token.' });
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(token, getKey, {
    audience: FIREBASE_PROJECT_ID,
    issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    algorithms: ['RS256']
  }, (err, decoded: any) => {
    if (err) {
      console.error('JWT verification failed:', err);
      return res.status(401).json({ error: 'Invalid or expired Firebase ID token.' });
    }

    // Extracted claims: Default to 'user' for least privilege
    req.user = {
      uid: decoded.sub,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role || 'user',
    };
    next();
  });
}

// Role Check Middleware: Enforces role checks server-side only
export function requireAdminRole(req: any, res: any, next: any) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthenticated.' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Administrator privileges required.' });
  }
  next();
}

// --- Bring-your-own-key -----------------------------------------------------
// A user may optionally supply their own Gemini key. It is used for that single
// request and is never logged, never persisted, and never echoed in an error.
// Absent or malformed, we fall through to the Secret Manager key.
// Google issues two key formats: the legacy 39-character "AIza…" key and the
// newer "AQ.…" key (53 chars, contains dots). Matching only the legacy shape
// silently rejected every modern key.
const GEMINI_KEY_SHAPE = /^(?:AIza[A-Za-z0-9_-]{35}|AQ\.[A-Za-z0-9_.-]{16,})$/;

// Unanchored twin used for redaction. Over-matching is safe here;
// under-matching leaks a key.
const GEMINI_KEY_ANYWHERE = /(?:AIza[A-Za-z0-9_-]{35}|AQ\.[A-Za-z0-9_.-]{16,})/g;

export function extractByokKey(req: any, _res: any, next: any) {
  const supplied = req.headers['x-gemini-key'];
  if (typeof supplied === 'string' && GEMINI_KEY_SHAPE.test(supplied)) {
    req.byokKey = supplied;
  }
  next();
}

// Never let a key — ours or the caller's — escape inside an error payload.
export function safeMessage(err: any): string {
  return String(err?.message || err || 'Unknown error')
    .replace(GEMINI_KEY_ANYWHERE, '***REDACTED***');
}

// --- Per-user rate limiting -------------------------------------------------
// ponytail: per-instance in-memory sliding window; deploy with a low
// --max-instances so this stays honest. Move to a Firestore counter if the
// service ever needs to scale out.
export const RATE_LIMIT_MAX = 20;
export const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const rateLimitHits = new Map<string, number[]>();

export function rateLimitPerUser(req: any, res: any, next: any) {
  // A caller spending their own Gemini key is not spending our quota.
  if (req.byokKey) return next();

  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ error: 'Unauthenticated.' });

  const now = Date.now();
  const hits = (rateLimitHits.get(uid) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);

  if (hits.length >= RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - hits[0])) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({ error: `Rate limit exceeded. Try again in ${retryAfter}s.` });
  }

  hits.push(now);
  rateLimitHits.set(uid, hits);

  // Keep the map bounded on long-lived instances.
  if (rateLimitHits.size > 5000) {
    for (const [k, v] of rateLimitHits) {
      if (v.every(t => now - t >= RATE_LIMIT_WINDOW_MS)) rateLimitHits.delete(k);
    }
  }
  next();
}

// Exported for tests so the suite exercises the real limiter, not a copy.
export function __resetRateLimit() {
  rateLimitHits.clear();
}

// --- Input caps -------------------------------------------------------------
export const MAX_MESSAGES = 100;
export const MAX_TOTAL_CHARS = 24000;

// AI Initialization with Lazy Checking
let aiClient: GoogleGenAI | null = null;
function getAiClient(byokKey?: string): GoogleGenAI {
  // A caller-supplied key is built per request and deliberately not cached.
  if (byokKey) return new GoogleGenAI({ apiKey: byokKey });

  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

// Resilient Model Fallback Ladder
const FALLBACK_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-3.7-flash"
];

const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 768;
const MODEL_TIMEOUT_MS = 15000;

// ponytail: Promise.race leaks the in-flight request but bounds user-facing
// latency, which is what a four-model ladder actually needs. Swap for
// config.abortSignal if the SDK version in use supports it.
function withTimeout<T>(work: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${MODEL_TIMEOUT_MS}ms`)), MODEL_TIMEOUT_MS)
    ),
  ]);
}

async function generateContentWithFallback(
  contents: any,
  systemInstruction?: string,
  configExtra?: any,
  byokKey?: string
) {
  const client = getAiClient(byokKey);
  let lastError: any = null;

  for (const model of FALLBACK_MODELS) {
    try {
      const response: any = await withTimeout(
        client.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            ...configExtra
          }
        }),
        `Model ${model}`
      );
      if (response && response.text) {
        return { text: response.text, model };
      }
    } catch (error) {
      console.warn(`Model ${model} failed, trying next fallback...`, safeMessage(error));
      lastError = error;
    }
  }
  throw new Error(`All Gemini fallback models exhausted. Last error: ${safeMessage(lastError)}`);
}

// SYSTEM PROMPTS
const JOURNAL_SYSTEM_INSTRUCTION = `You are an empathetic, insightful, and supportive AI journaling companion. Your goal is to help users reflect on their thoughts, actions, and feelings.
When interacting with the user:
1. Provide thoughtful, warm, and supportive feedback.
2. Ask open-ended, gentle questions that encourage deeper reflection.
3. Help them brainstorm ideas, understand their emotions, or find positive perspectives when appropriate.
4. Keep your responses engaging but clear and uncluttered. Avoid generic, dry AI conversational filler.
5. Focus strictly on their journal entry and response context.`;

const ANALYZE_SYSTEM_INSTRUCTION = `You are an expert emotional analysis assistant. Analyze the provided journal entry text or conversation and return a structured JSON response containing:
1. "title": A short, elegant, and descriptive title for the entry (maximum 5 words).
2. "summary": A concise 1-2 sentence summary of what the entry is about.
3. "category": A single, appropriate category (e.g., "Personal", "Gratitude", "Work", "Relationships", "Health", "Growth", "Creative").
4. "mood": An appropriate emotion/mood tag reflecting the tone (e.g., "Calm", "Grateful", "Anxious", "Excited", "Reflective", "Melancholy", "Motivated").

Return ONLY a valid raw JSON object. Do not wrap it in markdown code blocks or provide any other text.
JSON Schema:
{
  "title": "string",
  "summary": "string",
  "category": "string",
  "mood": "string"
}`;

// The period is part of the prompt so the letter can never claim to describe
// "this week" while it was actually handed the whole archive.
export const DIGEST_PERIODS: Record<string, string> = {
  week: 'the past seven days',
  all: 'their journal so far',
};

export function digestInstruction(period: string): string {
  const periodLabel = DIGEST_PERIODS[period] || DIGEST_PERIODS.week;
  return `You are writing a short, warm letter to someone about ${periodLabel}, based on a list of their journal entry metadata (dates, titles, one-line summaries, moods, categories).

Write directly to them as "you". In 150-220 words:
1. Name the emotional arc you actually see across the dates — do not invent events that are not in the data.
2. Point out one concrete pattern worth noticing (a recurring mood, a category they keep returning to, a shift partway through).
3. Close with one gentle, specific question for the week ahead.

If there is only one entry, do not pretend there is an arc — reflect on that single entry instead.
Refer only to ${periodLabel}; never imply you can see more than you were given.

Be warm and plain-spoken. No bullet points, no headings, no preamble like "Here is your digest" — just the letter itself.`;
}

const MAX_DIGEST_ENTRIES = 30;

// Validates a chat history payload against the input caps. Returns an error
// string when the payload should be rejected, or null when it is acceptable.
export function validateMessages(messages: any): string | null {
  if (!messages || !Array.isArray(messages)) {
    return 'Missing or invalid "messages" array.';
  }
  if (messages.length > MAX_MESSAGES) {
    return `Conversation too long: ${messages.length} messages exceeds the ${MAX_MESSAGES} message limit.`;
  }
  const totalChars = messages.reduce((sum: number, m: any) => sum + String(m?.content || '').length, 0);
  if (totalChars > MAX_TOTAL_CHARS) {
    return `Conversation too large: ${totalChars} characters exceeds the ${MAX_TOTAL_CHARS} character limit.`;
  }
  return null;
}

// Health probe: unauthenticated by design so Cloud Run can use it as a
// startup/liveness check without minting a token.
//
// Deliberately NOT /healthz. Cloud Run runs on Knative, whose queue-proxy
// sidecar sits in front of this container and reserves that path for its own
// probes — a route registered there is shadowed and answers with Google's
// 404 page instead of ever reaching Express.
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: APP_VERSION, uptimeSeconds: process.uptime() });
});

// Every Gemini route is authenticated, BYOK-aware, and rate limited.
const geminiGuards = [authenticateFirebaseUser, extractByokKey, rateLimitPerUser];

// API Routes

// Route 1: Converse / get reflection from Gemini
app.post('/api/gemini/reflect', geminiGuards, async (req: any, res: any) => {
  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const { messages } = body;

    const validationError = validateMessages(messages);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    // Format chat history for the @google/genai SDK
    // The SDK expects messages in { role: string, parts: [{ text: string }] } format or content strings
    const formattedContents = messages.map((m: any) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content || '' }]
    }));

    const result = await generateContentWithFallback(
      formattedContents,
      JOURNAL_SYSTEM_INSTRUCTION,
      undefined,
      req.byokKey
    );
    res.json({ response: result.text, modelUsed: result.model });
  } catch (error: any) {
    console.error('Error in /api/gemini/reflect:', safeMessage(error));
    res.status(500).json({ error: safeMessage(error) || 'Failed to generate reflection.' });
  }
});

// Route 2: Analyze conversation and generate metadata (Title, Summary, Category, Mood)
app.post('/api/gemini/analyze', geminiGuards, async (req: any, res: any) => {
  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const { text } = body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "text" field.' });
    }
    if (text.length > MAX_TOTAL_CHARS) {
      return res.status(400).json({
        error: `Text too large: ${text.length} characters exceeds the ${MAX_TOTAL_CHARS} character limit.`
      });
    }

    const result = await generateContentWithFallback(text, ANALYZE_SYSTEM_INSTRUCTION, {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: "A short, elegant, and descriptive title for the entry (maximum 5 words)."
          },
          summary: {
            type: Type.STRING,
            description: "A concise 1-2 sentence summary of what the entry is about."
          },
          category: {
            type: Type.STRING,
            description: "A single, appropriate category (e.g., Personal, Gratitude, Work, Relationships, Health, Growth, Creative)."
          },
          mood: {
            type: Type.STRING,
            description: "An appropriate emotion/mood tag reflecting the tone (e.g., Calm, Grateful, Anxious, Excited, Reflective, Melancholy, Motivated)."
          }
        },
        required: ["title", "summary", "category", "mood"]
      }
    }, req.byokKey);

    // Attempt to parse JSON safely
    let parsedData;
    try {
      let cleanText = result.text.trim();
      if (cleanText.startsWith('```json')) {
        cleanText = cleanText.substring(7);
      }
      if (cleanText.endsWith('```')) {
        cleanText = cleanText.substring(0, cleanText.length - 3);
      }
      parsedData = JSON.parse(cleanText.trim());
    } catch (e) {
      console.error('Failed to parse Gemini JSON output:', result.text);
      // Fallback object in case JSON parsing failed
      parsedData = {
        title: "Reflection Entry",
        summary: "A personal reflective entry on thoughts and feelings.",
        category: "Personal",
        mood: "Reflective"
      };
    }

    res.json(parsedData);
  } catch (error: any) {
    console.error('Error in /api/gemini/analyze:', safeMessage(error));
    res.status(500).json({ error: safeMessage(error) || 'Failed to analyze entry.' });
  }
});

// Route 3: Secure admin system-stats route gated by Custom Claims verified server-side
app.get('/api/admin/system-stats', authenticateFirebaseUser, requireAdminRole, (req: any, res: any) => {
  res.json({
    status: 'operational',
    version: APP_VERSION,
    uptimeSeconds: process.uptime(),
    adminRequestUid: req.user.uid,
    adminEmail: req.user.email,
    timestamp: Date.now(),
    features: {
      geminiAnalysis: true,
      roleBasedAccessControl: true,
      secureRulesDeployment: true,
    },
    // Admins are scoped to operational metadata only. There is deliberately no
    // route here that reads user journal content — see firestore.rules.
    systemMetrics: {
      rateLimitPerUser: `${RATE_LIMIT_MAX} req / ${RATE_LIMIT_WINDOW_MS / 60000} min`,
      trackedRateLimitUsers: rateLimitHits.size,
    }
  });
});

// Route 4: Streaming reflection (Server-Sent Events).
// Kept alongside /api/gemini/reflect rather than replacing it: the client
// falls back to the non-streaming route, which walks the full model ladder.
app.post('/api/gemini/reflect/stream', geminiGuards, async (req: any, res: any) => {
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const { messages } = body;

  const validationError = validateMessages(messages);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const formattedContents = messages.map((m: any) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content || '' }]
  }));

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    const client = getAiClient(req.byokKey);
    // Single model on purpose: falling back mid-stream would replay text the
    // user has already watched appear.
    const model = FALLBACK_MODELS[0];
    const stream = await client.models.generateContentStream({
      model,
      contents: formattedContents,
      config: { systemInstruction: JOURNAL_SYSTEM_INSTRUCTION }
    });

    for await (const chunk of stream as any) {
      const text = chunk?.text;
      if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true, modelUsed: model })}\n\n`);
    res.end();
  } catch (error: any) {
    console.error('Error in /api/gemini/reflect/stream:', safeMessage(error));
    // Headers are already sent, so the failure has to travel inside the stream.
    res.write(`data: ${JSON.stringify({ error: safeMessage(error) })}\n\n`);
    res.end();
  }
});

// Route 5: Embed text for semantic memory search.
app.post('/api/gemini/embed', geminiGuards, async (req: any, res: any) => {
  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const { text } = body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "text" field.' });
    }
    if (text.length > MAX_TOTAL_CHARS) {
      return res.status(400).json({
        error: `Text too large: ${text.length} characters exceeds the ${MAX_TOTAL_CHARS} character limit.`
      });
    }

    const client = getAiClient(req.byokKey);
    const result: any = await withTimeout(
      client.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: text,
        config: {
          outputDimensionality: EMBEDDING_DIMENSIONS,
          taskType: 'SEMANTIC_SIMILARITY'
        }
      }),
      'Embedding model'
    );

    const values = result?.embeddings?.[0]?.values;
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error('Embedding model returned no vector.');
    }

    res.json({ embedding: l2Normalize(values), dimensions: values.length });
  } catch (error: any) {
    console.error('Error in /api/gemini/embed:', safeMessage(error));
    res.status(500).json({ error: safeMessage(error) || 'Failed to embed text.' });
  }
});

// Route 6: Weekly digest.
// Accepts entry METADATA only. The server re-projects whatever it is sent down
// to five known fields, so journal bodies cannot reach the model through this
// route even if a future client sends them by mistake.
app.post('/api/gemini/digest', geminiGuards, async (req: any, res: any) => {
  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const { entries } = body;
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'Missing or empty "entries" array.' });
    }

    const safeEntries = entries.slice(0, MAX_DIGEST_ENTRIES).map((e: any) => ({
      date: new Date(Number(e?.createdAt) || Date.now()).toISOString().slice(0, 10),
      title: String(e?.title || '').slice(0, 200),
      summary: String(e?.summary || '').slice(0, 500),
      mood: String(e?.mood || '').slice(0, 50),
      category: String(e?.category || '').slice(0, 50),
    }));

    // Only a known period label is accepted; anything else falls back to week.
    const period = Object.prototype.hasOwnProperty.call(DIGEST_PERIODS, String(body.period))
      ? String(body.period)
      : 'week';

    const result = await generateContentWithFallback(
      JSON.stringify(safeEntries),
      digestInstruction(period),
      undefined,
      req.byokKey
    );
    res.json({
      digest: result.text,
      modelUsed: result.model,
      period,
      entriesConsidered: safeEntries.length
    });
  } catch (error: any) {
    console.error('Error in /api/gemini/digest:', safeMessage(error));
    res.status(500).json({ error: safeMessage(error) || 'Failed to generate digest.' });
  }
});

// Setup Vite & Frontend static routing
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Importing this module in a test must not bind a port.
if (process.env.NODE_ENV !== 'test') {
  startServer();
}
