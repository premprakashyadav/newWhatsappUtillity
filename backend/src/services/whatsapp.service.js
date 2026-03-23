const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');

// ── Chromium detection ──────────────────────────────────────────────────────
function getChromiumPath() {
  // 1. Explicit env var (set in Render dashboard)
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    const p = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (fs.existsSync(p)) {
      console.log(`[chromium] Using env path: ${p}`);
      return p;
    }
    console.warn(`[chromium] Env path not found: ${p}`);
  }

  // 2. Common system paths (Render / Debian / Ubuntu)
  const candidates = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/local/bin/chromium',
    '/snap/bin/chromium',
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      console.log(`[chromium] Found at: ${p}`);
      return p;
    }
  }

  // 3. Try `which chromium` as fallback
  try {
    const { execSync } = require('child_process');
    const result = execSync('which chromium || which chromium-browser || which google-chrome', { timeout: 3000 })
      .toString().trim().split('\n')[0];
    if (result && fs.existsSync(result)) {
      console.log(`[chromium] Found via which: ${result}`);
      return result;
    }
  } catch (e) {
    console.warn('[chromium] which command failed:', e.message);
  }

  console.error('[chromium] No system Chromium found! Install it with: apt-get install -y chromium');
  return null;
}

// ── Puppeteer launch args optimised for Render (low-memory container) ───────
const PUPPETEER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',        // Critical on Render — /dev/shm is tiny
  '--disable-gpu',
  '--disable-software-rasterizer',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--no-zygote',
  '--single-process',               // Reduces memory usage
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-default-apps',
  '--disable-sync',
  '--disable-translate',
  '--hide-scrollbars',
  '--mute-audio',
  '--safebrowsing-disable-auto-update',
  '--disable-logging',
  '--disable-permissions-api',
  '--disable-presentation-api',
  '--disable-remote-fonts',
];

// ── Service ──────────────────────────────────────────────────────────────────
class WhatsAppService {
  constructor() {
    this.sessions = new Map();
    this.io = null;
  }

  setIo(io) { this.io = io; }

  emitToSession(sessionId, event, data) {
    if (this.io) this.io.to(sessionId).emit(event, data);
  }

  async createSession(sessionId) {
    // Return existing session if already alive
    if (this.sessions.has(sessionId)) {
      const sess = this.sessions.get(sessionId);
      if (['ready', 'authenticated', 'initializing', 'qr_ready'].includes(sess.status)) {
        console.log(`[session] Reusing existing session ${sessionId} (${sess.status})`);
        return { status: sess.status, sessionId };
      }
      // Clean up dead session
      this.sessions.delete(sessionId);
    }

    const executablePath = getChromiumPath();
    if (!executablePath) {
      throw new Error('Chromium not found. Run: apt-get install -y chromium');
    }

    const authPath = path.join(__dirname, '../../.wwebjs_auth');
    if (!fs.existsSync(authPath)) fs.mkdirSync(authPath, { recursive: true });

    console.log(`[session] Creating new session ${sessionId} with Chromium: ${executablePath}`);

    const client = new Client({
      authStrategy: new LocalAuth({ clientId: sessionId, dataPath: authPath }),
      puppeteer: {
        headless: true,
        executablePath,
        args: PUPPETEER_ARGS,
        timeout: 60000,
      }
    });

    const sessionData = { client, status: 'initializing', qr: null, phone: null, sessionId };
    this.sessions.set(sessionId, sessionData);

    client.on('qr', async (qr) => {
      console.log(`[session] QR received for ${sessionId}`);
      try {
        const qrDataUrl = await qrcode.toDataURL(qr);
        sessionData.qr = qrDataUrl;
        sessionData.status = 'qr_ready';
        this.emitToSession(sessionId, 'qr', { qr: qrDataUrl, sessionId });
      } catch (e) {
        console.error('[session] QR generation failed:', e.message);
      }
    });

    client.on('loading_screen', (percent, message) => {
      console.log(`[session] Loading ${sessionId}: ${percent}% — ${message}`);
    });

    client.on('authenticated', () => {
      console.log(`[session] Authenticated: ${sessionId}`);
      sessionData.status = 'authenticated';
      this.emitToSession(sessionId, 'authenticated', { sessionId });
    });

    client.on('ready', () => {
      sessionData.status = 'ready';
      sessionData.qr = null;
      const info = client.info;
      sessionData.phone = info?.wid?.user || 'Unknown';
      console.log(`[session] Ready: ${sessionId} — +${sessionData.phone}`);
      this.emitToSession(sessionId, 'ready', { sessionId, phone: sessionData.phone });
    });

    client.on('auth_failure', (msg) => {
      console.error(`[session] Auth failure ${sessionId}:`, msg);
      sessionData.status = 'auth_failure';
      this.emitToSession(sessionId, 'auth_failure', { sessionId, message: msg });
      this.sessions.delete(sessionId);
    });

    client.on('disconnected', (reason) => {
      console.log(`[session] Disconnected ${sessionId}:`, reason);
      sessionData.status = 'disconnected';
      this.emitToSession(sessionId, 'disconnected', { sessionId, reason });
      this.sessions.delete(sessionId);
    });

    // Initialize (non-blocking — caller handles errors via socket events)
    client.initialize().catch(err => {
      console.error(`[session] initialize() failed for ${sessionId}:`, err.message);
      sessionData.status = 'error';
      this.emitToSession(sessionId, 'auth_failure', { sessionId, message: err.message });
      this.sessions.delete(sessionId);
    });

    return { status: 'initializing', sessionId };
  }

  getSession(sessionId) { return this.sessions.get(sessionId); }

  getSessionStatus(sessionId) {
    const sess = this.sessions.get(sessionId);
    if (!sess) return { status: 'not_found' };
    return { status: sess.status, phone: sess.phone, qr: sess.qr, sessionId };
  }

  async sendMessage(sessionId, to, message, imagePath = null) {
    const sess = this.sessions.get(sessionId);
    if (!sess || sess.status !== 'ready') throw new Error('Session not ready');

    const phone = String(to).replace(/\D/g, '');
    const chatId = phone.includes('@c.us') ? phone : `${phone}@c.us`;

    try {
      if (imagePath && fs.existsSync(imagePath)) {
        const media = MessageMedia.fromFilePath(imagePath);
        await sess.client.sendMessage(chatId, media, { caption: message });
      } else {
        await sess.client.sendMessage(chatId, message);
      }
      return { success: true, to: phone };
    } catch (err) {
      console.error(`[send] Failed to ${phone}:`, err.message);
      return { success: false, to: phone, error: err.message };
    }
  }

  async sendBulkMessages(sessionId, contacts, message, imagePath = null, onProgress = null) {
    const results = [];
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      const phone = String(
        contact.phone || contact.number || contact.Phone || contact.Number || ''
      ).replace(/\D/g, '');

      const personalizedMsg = contact.name
        ? message.replace(/\{name\}/gi, contact.name)
        : message;

      if (!phone || phone.length < 7) {
        results.push({ success: false, to: phone || 'unknown', error: 'Invalid phone number' });
        if (onProgress) onProgress({ current: i + 1, total: contacts.length, result: results[results.length - 1] });
        continue;
      }

      const result = await this.sendMessage(sessionId, phone, personalizedMsg, imagePath);
      results.push(result);
      if (onProgress) onProgress({ current: i + 1, total: contacts.length, result });

      if (i < contacts.length - 1) {
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
      }
    }
    return results;
  }

  async logout(sessionId) {
    const sess = this.sessions.get(sessionId);
    if (sess) {
      try { await sess.client.logout(); } catch (e) {}
      try { await sess.client.destroy(); } catch (e) {}
      this.sessions.delete(sessionId);
    }
    return { success: true };
  }

  getAllSessions() {
    return [...this.sessions.entries()].map(([id, s]) => ({
      sessionId: id, status: s.status, phone: s.phone
    }));
  }
}

const whatsappService = new WhatsAppService();
module.exports = { whatsappService, WhatsAppService };
