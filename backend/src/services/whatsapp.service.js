const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

// Detect system Chromium path (Render uses Debian/Ubuntu)
function getChromiumPath() {
  const candidates = [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  // Let puppeteer-core handle it (local dev with Chrome installed)
  return undefined;
}

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
    if (this.sessions.has(sessionId)) {
      const sess = this.sessions.get(sessionId);
      if (sess.status === 'ready') return { status: 'already_ready', sessionId };
    }

    const executablePath = getChromiumPath();
    const puppeteerArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--hide-scrollbars',
      '--metrics-recording-only',
      '--mute-audio',
      '--safebrowsing-disable-auto-update',
    ];

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: sessionId,
        dataPath: path.join(__dirname, '../../.wwebjs_auth')
      }),
      puppeteer: {
        headless: true,
        ...(executablePath ? { executablePath } : {}),
        args: puppeteerArgs
      }
    });

    const sessionData = { client, status: 'initializing', qr: null, phone: null, sessionId };
    this.sessions.set(sessionId, sessionData);

    client.on('qr', async (qr) => {
      const qrDataUrl = await qrcode.toDataURL(qr);
      sessionData.qr = qrDataUrl;
      sessionData.status = 'qr_ready';
      this.emitToSession(sessionId, 'qr', { qr: qrDataUrl, sessionId });
      console.log(`QR generated for session ${sessionId}`);
    });

    client.on('ready', () => {
      sessionData.status = 'ready';
      sessionData.qr = null;
      const info = client.info;
      sessionData.phone = info?.wid?.user || 'Unknown';
      this.emitToSession(sessionId, 'ready', { sessionId, phone: sessionData.phone });
      console.log(`Client ready for session ${sessionId}, phone: ${sessionData.phone}`);
    });

    client.on('authenticated', () => {
      sessionData.status = 'authenticated';
      this.emitToSession(sessionId, 'authenticated', { sessionId });
    });

    client.on('auth_failure', (msg) => {
      sessionData.status = 'auth_failure';
      this.emitToSession(sessionId, 'auth_failure', { sessionId, message: msg });
      this.sessions.delete(sessionId);
    });

    client.on('disconnected', (reason) => {
      sessionData.status = 'disconnected';
      this.emitToSession(sessionId, 'disconnected', { sessionId, reason });
      this.sessions.delete(sessionId);
    });

    await client.initialize();
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

    const chatId = to.includes('@c.us') ? to : `${to}@c.us`;

    try {
      if (imagePath && fs.existsSync(imagePath)) {
        const media = MessageMedia.fromFilePath(imagePath);
        await sess.client.sendMessage(chatId, media, { caption: message });
      } else {
        await sess.client.sendMessage(chatId, message);
      }
      return { success: true, to };
    } catch (err) {
      console.error(`Failed to send to ${to}:`, err.message);
      return { success: false, to, error: err.message };
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

      if (!phone) {
        results.push({ success: false, to: 'unknown', error: 'No phone number' });
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
