import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
// Cloud Run injects PORT (8080 by default); fall back to 3000 for local dev.
const PORT = Number(process.env.PORT) || 3000;
const FIREBASE_PROJECT_ID = "lab1-rag-project";

// Express middleware for payload ingestion
app.use(express.json());

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
function requireAdminRole(req: any, res: any, next: any) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthenticated.' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Administrator privileges required.' });
  }
  next();
}

// AI Initialization with Lazy Checking
let aiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI {
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

async function generateContentWithFallback(contents: any, systemInstruction?: string, configExtra?: any) {
  const client = getAiClient();
  let lastError: any = null;

  for (const model of FALLBACK_MODELS) {
    try {
      const response = await client.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          ...configExtra
        }
      });
      if (response && response.text) {
        return { text: response.text, model };
      }
    } catch (error) {
      console.warn(`Model ${model} failed, trying next fallback...`, error);
      lastError = error;
    }
  }
  throw new Error(`All Gemini fallback models exhausted. Last error: ${lastError?.message || lastError}`);
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

// API Routes

// Route 1: Converse / get reflection from Gemini
app.post('/api/gemini/reflect', authenticateFirebaseUser, async (req: any, res: any) => {
  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const { messages } = body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Missing or invalid "messages" array.' });
    }

    // Format chat history for the @google/genai SDK
    // The SDK expects messages in { role: string, parts: [{ text: string }] } format or content strings
    const formattedContents = messages.map((m: any) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content || '' }]
    }));

    const result = await generateContentWithFallback(formattedContents, JOURNAL_SYSTEM_INSTRUCTION);
    res.json({ response: result.text, modelUsed: result.model });
  } catch (error: any) {
    console.error('Error in /api/gemini/reflect:', error);
    res.status(500).json({ error: error.message || 'Failed to generate reflection.' });
  }
});

// Route 2: Analyze conversation and generate metadata (Title, Summary, Category, Mood)
app.post('/api/gemini/analyze', authenticateFirebaseUser, async (req: any, res: any) => {
  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const { text } = body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "text" field.' });
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
    });
    
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
    console.error('Error in /api/gemini/analyze:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze entry.' });
  }
});

// Route 3: Secure admin system-stats route gated by Custom Claims verified server-side
app.get('/api/admin/system-stats', authenticateFirebaseUser, requireAdminRole, (req: any, res: any) => {
  res.json({
    status: 'operational',
    version: '1.2.0-RBAC',
    uptimeSeconds: process.uptime(),
    adminRequestUid: req.user.uid,
    adminEmail: req.user.email,
    timestamp: Date.now(),
    features: {
      geminiAnalysis: true,
      roleBasedAccessControl: true,
      secureRulesDeployment: true,
    },
    systemMetrics: {
      activeSessions: 1,
      totalRequestsServed: 42,
    }
  });
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

startServer();
