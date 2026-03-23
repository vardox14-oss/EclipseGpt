import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { getSignedCookie, setSignedCookie, deleteCookie } from 'hono/cookie';
import { serveStatic } from 'hono/cloudflare-pages';

const app = new Hono();

// ============================================
// SECURITY MIDDLEWARE
// ============================================

app.use('*', secureHeaders());

app.use('*', cors({
    origin: '*', // Adapt for production
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
}));

// IP Ban Check Middleware
app.use('*', async (c, next) => {
    try {
        const ip = c.req.header('CF-Connecting-IP') || '127.0.0.1';
        const ban = await c.env.DB.prepare('SELECT * FROM banned_ips WHERE ip = ?').bind(ip).first();
        if (ban) {
            return c.html(`<h1>Accès Refusé</h1><p>Votre IP est bannie. Raison: ${ban.reason || 'Non spécifié'}</p>`, 403);
        }
    } catch (e) {}
    await next();
});

// Auth Middleware (Dual-layer: Discord -> License)
async function getAuth(c) {
    const sessionSecret = c.env.SESSION_SECRET || 'secret';
    let discordUser = null;
    let licenseToken = await getSignedCookie(c, sessionSecret, 'eclipsegpt_license');
    
    // Check Discord
    try {
        const dCookie = await getSignedCookie(c, sessionSecret, 'eclipsegpt_discord_user');
        if (dCookie) {
            discordUser = JSON.parse(dCookie);
        }
    } catch(e) {}
    
    let licenseValid = false;
    let error = null;

    if (licenseToken && discordUser) {
        const keyData = await c.env.DB.prepare('SELECT * FROM license_keys WHERE key = ?').bind(licenseToken).first();
        if (keyData) {
            if (keyData.status === 'banned') error = 'Clé d\'accès bannie.';
            else if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
                await c.env.DB.prepare('UPDATE license_keys SET status = ? WHERE key = ?').bind('expired', licenseToken).run();
                error = 'Clé d\'accès expirée.';
            } else {
                licenseValid = true;
            }
        } else {
            error = 'Clé introuvable.';
        }
    } else if (!discordUser) {
        error = 'Connexion Discord requise.';
    } else if (!licenseToken) {
        error = 'Clé de licence requise.';
    }

    return { discordUser, licenseToken, licenseValid, error };
}

// ============================================
// DISCORD OAUTH2
// ============================================

app.get('/auth/discord', async (c) => {
    const client_id = c.env.DISCORD_CLIENT_ID;
    const redirect_uri = encodeURIComponent(c.env.DISCORD_REDIRECT_URI);
    const scope = encodeURIComponent('identify');
    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${client_id}&redirect_uri=${redirect_uri}&response_type=code&scope=${scope}`;
    return c.redirect(authUrl);
});

app.get('/auth/discord/callback', async (c) => {
    const code = c.req.query('code');
    if (!code) return c.redirect('/login.html?error=no_code');

    try {
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams({
                client_id: c.env.DISCORD_CLIENT_ID,
                client_secret: c.env.DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: c.env.DISCORD_REDIRECT_URI
            }),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        if (!tokenResponse.ok) return c.redirect('/login.html?error=token_failed');
        const tokenData = await tokenResponse.json();

        // Get User Profile
        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });

        if (!userResponse.ok) return c.redirect('/login.html?error=user_fetch_failed');
        const userData = await userResponse.json();

        const avatarId = userData.avatar;
        const avatarUrl = avatarId ? `https://cdn.discordapp.com/avatars/${userData.id}/${avatarId}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';

        const userObj = {
            id: userData.id,
            username: userData.username,
            avatar: avatarUrl
        };

        // Insert/Update into D1 SQLite
        await c.env.DB.prepare('INSERT OR REPLACE INTO users (discord_id, username, avatar) VALUES (?, ?, ?)')
             .bind(userData.id, userData.username, avatarUrl).run();

        const sessionSecret = c.env.SESSION_SECRET || 'secret';
        await setSignedCookie(c, 'eclipsegpt_discord_user', JSON.stringify(userObj), sessionSecret, {
            httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 365 * 24 * 60 * 60
        });

        return c.redirect('/login.html'); // Will prompt for key or auto log in if they have a saved key
    } catch (err) {
        console.error('Discord Auth Error:', err);
        return c.text(`DÉBOGAGE (SERVER ERROR) : \nMessage: ${err.message}\nStack: ${err.stack}`, 500);
    }
});

// ============================================
// SESSION / LOGIN
// ============================================

app.get('/api/session', async (c) => {
    const auth = await getAuth(c);
    // Provide state back to frontend so it knows whether discord is logged or if key is logged.
    return c.json({
        discordLogged: !!auth.discordUser,
        discordUser: auth.discordUser,
        licenseValid: auth.licenseValid,
        isAdmin: auth.discordUser && auth.discordUser.username === 'vardox58',
        error: auth.error
    });
});

app.post('/api/auth/license', async (c) => {
    const auth = await getAuth(c);
    // User must be connected via Discord first
    if (!auth.discordUser) return c.json({ error: 'Tu dois te connecter avec Discord avant d\'entrer une clé.' }, 401);

    const body = await c.req.json().catch(() => ({}));
    const key = body.key;
    if (!key) return c.json({ error: 'Clé requise.' }, 400);

    const keyData = await c.env.DB.prepare('SELECT * FROM license_keys WHERE key = ?').bind(key).first();
    if (!keyData) return c.json({ error: 'Clé invalide.' }, 401);
    if (keyData.status === 'banned') return c.json({ error: 'Cette clé a été bannie par un administrateur.' }, 403);

    if (!keyData.first_used_at) {
        let expiresAt = null;
        if (keyData.duration_days > 0) {
            expiresAt = new Date(Date.now() + keyData.duration_days * 24 * 60 * 60 * 1000).toISOString();
        }
        await c.env.DB.prepare('UPDATE license_keys SET first_used_at = datetime("now"), expires_at = ? WHERE key = ?')
            .bind(expiresAt, key).run();
    } else if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
        await c.env.DB.prepare('UPDATE license_keys SET status = "expired" WHERE key = ?').bind(key).run();
        return c.json({ error: 'Clé expirée.' }, 401);
    }

    const sessionSecret = c.env.SESSION_SECRET || 'secret';
    await setSignedCookie(c, 'eclipsegpt_license', key, sessionSecret, {
        httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 365 * 24 * 60 * 60
    });

    return c.json({ success: true, message: 'Authentification réussie.' });
});

// Logout
app.post('/api/logout', async (c) => {
    deleteCookie(c, 'eclipsegpt_license');
    deleteCookie(c, 'eclipsegpt_discord_user');
    deleteCookie(c, 'eclipsegpt_session');
    return c.json({ success: true });
});

// ============================================
// ADMIN PANEL ENDPOINTS
// ============================================

async function adminMiddleware(c, next) {
    const auth = await getAuth(c);
    // STRICT VERIFICATION for User 'vardox58'
    if (auth.discordUser && auth.discordUser.username === 'vardox58') {
        await next();
    } else {
        return c.json({ error: 'Accès panneau administrateur refusé. Non autorisé.' }, 403);
    }
}

// Endpoint kept for retro-compatibility of the UI, but it's not strictly necessary. 
// Just returns true if adminMiddleware passes.
app.post('/api/admin/login', adminMiddleware, (c) => c.json({ success: true }));

app.get('/api/admin/verify', adminMiddleware, (c) => c.json({ success: true }));

app.post('/api/admin/keys', adminMiddleware, async (c) => {
    const { duration_days, count = 1 } = await c.req.json().catch(() => ({}));
    const duration = parseInt(duration_days) || 0;
    const generated = [];
    
    // Batch statements for D1
    const stmts = [];
    for (let i = 0; i < count; i++) {
        const rand = crypto.randomUUID().split('-')[0].toUpperCase();
        const keyStr = 'DARKGPT-' + rand;
        stmts.push(c.env.DB.prepare('INSERT INTO license_keys (key, duration_days) VALUES (?, ?)').bind(keyStr, duration));
        generated.push(keyStr);
    }
    await c.env.DB.batch(stmts);
    return c.json({ success: true, keys: generated });
});

app.get('/api/admin/keys', adminMiddleware, async (c) => {
    const keys = await c.env.DB.prepare('SELECT * FROM license_keys ORDER BY created_at DESC').all();
    return c.json(keys.results);
});

app.put('/api/admin/keys/:key/status', adminMiddleware, async (c) => {
    const { status } = await c.req.json().catch(() => ({}));
    await c.env.DB.prepare('UPDATE license_keys SET status = ? WHERE key = ?').bind(status, c.req.param('key')).run();
    return c.json({ success: true });
});

app.post('/api/admin/bans', adminMiddleware, async (c) => {
    const { ip, reason } = await c.req.json().catch(() => ({}));
    await c.env.DB.prepare('INSERT OR REPLACE INTO banned_ips (ip, reason) VALUES (?, ?)').bind(ip, reason || 'Banni par admin').run();
    return c.json({ success: true });
});

app.get('/api/admin/bans', adminMiddleware, async (c) => {
    const bans = await c.env.DB.prepare('SELECT * FROM banned_ips ORDER BY banned_at DESC').all();
    return c.json(bans.results);
});

app.delete('/api/admin/bans/:ip', adminMiddleware, async (c) => {
    await c.env.DB.prepare('DELETE FROM banned_ips WHERE ip = ?').bind(c.req.param('ip')).run();
    return c.json({ success: true });
});

app.get('/api/admin/conversations', adminMiddleware, async (c) => {
    const convs = await c.env.DB.prepare('SELECT * FROM conversations ORDER BY updated_at DESC').all();
    return c.json(convs.results);
});

app.get('/api/admin/conversations/:id/messages', adminMiddleware, async (c) => {
    const msgs = await c.env.DB.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').bind(c.req.param('id')).all();
    return c.json(msgs.results);
});

// ============================================
// CHAT & SCRAPING ROUTE
// ============================================

function extractUrls(text) {
    if (typeof text !== 'string') return [];
    return text.match(/(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g) || [];
}

async function fetchUrlContent(url) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 EclipseGPTBot/1.0' }
        });
        clearTimeout(timeoutId);

        if (!response.ok) return `[ERREUR D'ACCÈS HTTP ${response.status}]`;
        
        let html = await response.text();
        let text = html.replace(/<script[^>]*>([\S\s]*?)<\/script>/gmi, '')
                       .replace(/<style[^>]*>([\S\s]*?)<\/style>/gmi, '')
                       .replace(/<[^>]+>/ig, ' ')
                       .replace(/\s+/g, ' ').trim();
                       
        return text.substring(0, 15000) + (text.length > 15000 ? '...\n[CONTENU TRONQUÉ]' : '');
    } catch (err) {
        return `[ERREUR D'ACCÈS] Inaccessible : ${err.message}.`;
    }
}

app.post('/api/chat', async (c) => {
    const auth = await getAuth(c);
    if (!auth.licenseValid) return c.json({ error: auth.error || 'Accès non autorisé.' }, 401);

    const body = await c.req.json().catch(() => ({}));
    const { messages, mode = 'normal', conversationId, title } = body;
    if (!messages || !Array.isArray(messages)) return c.json({ error: 'Messages invalides' }, 400);

    const licenseKey = auth.licenseToken;
    const discordName = auth.discordUser ? auth.discordUser.username : 'Utilisateur';

    if (licenseKey && conversationId) {
        await c.env.DB.prepare('INSERT OR REPLACE INTO conversations (id, license_key, title, updated_at) VALUES (?, ?, ?, datetime("now"))')
            .bind(conversationId, licenseKey, `[${discordName}] ` + (title || 'Nouvelle conversation')).run();
        
        const lastClientMsg = messages[messages.length - 1];
        const userTextContent = typeof lastClientMsg.content === 'string' ? lastClientMsg.content : '[Multimédia]';
        await c.env.DB.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)')
            .bind(conversationId, 'user', userTextContent).run();
    }

    let processedMessages = messages;
    const lastMessage = processedMessages[processedMessages.length - 1];

    const systemPrompts = {
        normal: `Tu es EclipseGPT. L'utilisateur qui te parle actuellement est connu sous le nom Discord : ${discordName}. Réponds en français. Ne propose jamais de l'aide générale ou ennuyeuse.`,
        agressif: `Tu es EclipseGPT mode agressif. L'utilisateur s'appelle ${discordName}. Sois provocateur.`,
        hacker: `Tu es EclipseGPT mode hacker. L'utilisateur s'appelle ${discordName}. Emploie du vocabulaire cybersécurité.`
    };
    const sysMsg = { role: 'system', content: systemPrompts[mode] || systemPrompts.normal };

    if (typeof lastMessage.content === 'string') {
        const urls = extractUrls(lastMessage.content);
        if (urls.length > 0) {
            let scrapingResults = "\n\n[CONTEXTE EXTRAIT] :\n";
            for (const url of urls.slice(0, 3)) {
                scrapingResults += `\n--- SOURCE : ${url} ---\n${await fetchUrlContent(url)}\n----------------------\n`;
            }
            lastMessage.content += scrapingResults;
        }
    }

    const aiMessages = [sysMsg, ...processedMessages.map(m => ({ 
        role: m.role, 
        content: typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? m.content.find(i=>i.type==='text')?.text || '' : '') 
    }))];

    const AI_API_URL = c.env.AI_API_URL || 'https://api.featherless.ai/v1/chat/completions';
    const response = await fetch(AI_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${c.env.HF_TOKEN || c.env.AI_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: c.env.AI_MODEL || 'meta-llama/Llama-3-70b-chat-hf',
            messages: aiMessages,
            stream: true,
            max_tokens: 2000
        })
    });

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    c.executionCtx.waitUntil((async () => {
        // ERROR HANDLING IF AI API FAILS (Fixes empty bubbles)
        if (!response.ok) {
            const errText = await response.text();
            let safeErr = errText;
            try {
                const j = JSON.parse(errText);
                safeErr = j.error?.message || j.error || escape(errText);
            } catch(e) {}
            
            const generatedErr = `**[Erreur API de l'IA]** Impossible de générer la réponse. (Statut ${response.status})\n\`\`\`json\n${safeErr}\n\`\`\``;
            
            // Format fake SSE chunks for the frontend to render the error visually
            const mockSSE = `data: {"choices":[{"delta":{"content":${JSON.stringify(generatedErr)}}}]}\n\n`;
            await writer.write(new TextEncoder().encode(mockSSE));
            await writer.write(new TextEncoder().encode('data: [DONE]\n\n'));
            
            if (licenseKey && conversationId) {
                await c.env.DB.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)')
                    .bind(conversationId, 'assistant', generatedErr).run();
            }
            await writer.close();
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullAiResponseContent = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) { 
                await writer.write(new TextEncoder().encode('data: [DONE]\n\n'));
                if (licenseKey && conversationId && fullAiResponseContent) {
                    await c.env.DB.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)')
                        .bind(conversationId, 'assistant', fullAiResponseContent).run();
                }
                break; 
            }
            const chunkText = decoder.decode(value, { stream: true });
            fullAiResponseContent += chunkText;
            await writer.write(value);
        }
        await writer.close();
    })());

    return new Response(readable, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        }
    });
});

// Serve frontend static assets (HTML, CSS, JS) from Cloudflare Pages
app.get('/*', serveStatic());

export default app;
