import express from 'express';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434/api/generate';
const OLLAMA_DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:0.5b';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || '';

// Model names are user-chosen. This only rejects characters that can never
// appear in an Ollama model name; availability is checked against /api/tags
// in later phases. This is an injection guard, not quality policing.
const SAFE_MODEL_PATTERN = /^[A-Za-z0-9._:+-]{1,120}$/;

function base64UrlDecode(input) {
    let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) base64 += '=';
    return Buffer.from(base64, 'base64');
}

function verifySupabaseToken(authorizationHeader) {
    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
        return { ok: false, status: 401, error: 'Authentication required.' };
    }
    if (!SUPABASE_JWT_SECRET) {
        return { ok: false, status: 500, error: 'Auth is not configured on the server.' };
    }
    const token = authorizationHeader.slice('Bearer '.length).trim();
    const parts = token.split('.');
    if (parts.length !== 3) {
        return { ok: false, status: 401, error: 'Invalid session token.' };
    }
    try {
        const signingInput = `${parts[0]}.${parts[1]}`;
        const expected = crypto.createHmac('sha256', SUPABASE_JWT_SECRET).update(signingInput).digest();
        const actual = base64UrlDecode(parts[2]);
        if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
            return { ok: false, status: 401, error: 'Invalid session token.' };
        }
        const payload = JSON.parse(base64UrlDecode(parts[1]).toString('utf8'));
        if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) {
            return { ok: false, status: 401, error: 'Session expired. Please sign in again.' };
        }
        if (payload.role !== 'authenticated' && payload.aud !== 'authenticated') {
            return { ok: false, status: 403, error: 'This account is not authorized.' };
        }
        return { ok: true, userId: payload.sub };
    } catch {
        return { ok: false, status: 401, error: 'Invalid session token.' };
    }
}

app.use(express.static(__dirname));
app.use(express.json());

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || `http://localhost:${process.env.PORT || 3000}`;

app.use((req, res, next) => {
    const requestOrigin = req.headers.origin;
    if (requestOrigin && requestOrigin === ALLOWED_ORIGIN) {
        res.header('Access-Control-Allow-Origin', requestOrigin);
        res.header('Vary', 'Origin');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'index.html'));
});

// Public runtime config for the browser. Only the public Supabase URL and
// the anon key are exposed here. RLS is what protects user data.
app.get('/config.json', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({
        supabaseUrl: SUPABASE_URL,
        supabaseAnonKey: SUPABASE_ANON_KEY
    });
});

app.post('/api/generate', async (req, res) => {
    try {
        const auth = verifySupabaseToken(req.headers.authorization);
        if (!auth.ok) {
            return res.status(auth.status).json({ error: auth.error });
        }

        const requestedModel = typeof req.body.model === 'string' && req.body.model.length > 0
            ? req.body.model
            : OLLAMA_DEFAULT_MODEL;
        if (!SAFE_MODEL_PATTERN.test(requestedModel)) {
            return res.status(400).json({ error: 'Invalid model name.' });
        }

        const history = Array.isArray(req.body.messages)
            ? req.body.messages.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
            : [];
        const prompt = typeof req.body.prompt === 'string' && req.body.prompt.length > 0
            ? req.body.prompt
            : history.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n');

        if (!prompt) {
            throw new Error('No prompt provided');
        }

        console.log('Sending request to model backend...');

        const response = await fetch(OLLAMA_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: requestedModel,
                prompt,
                stream: false
            })
        });

        console.log('Model backend response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Model backend error:', errorText);
            throw new Error(`Model API error: ${response.status}`);
        }

        const data = await response.json();
        console.log('Model response:', {
            model: data.model,
            response_length: data.response?.length
        });

        res.json({
            response: data.response,
            model: data.model
        });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({
            error: 'Failed to communicate with model API'
        });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
    console.error('Global error handler:', err);
    res.status(500).json({
        error: 'Internal server error',
        timestamp: new Date().toISOString()
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('Environment:', {
        nodeEnv: process.env.NODE_ENV,
        ollamaApiUrl: OLLAMA_API_URL,
        ollamaModel: OLLAMA_DEFAULT_MODEL,
        supabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_JWT_SECRET),
        port: PORT
    });
});
