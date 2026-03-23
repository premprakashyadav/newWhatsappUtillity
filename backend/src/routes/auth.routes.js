const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { whatsappService } = require('../services/whatsapp.service');

// Create/initialize a new WhatsApp session
router.post('/create-session', async (req, res) => {
  try {
    const sessionId = req.session.sessionId || uuidv4();
    req.session.sessionId = sessionId;

    console.log(`[create-session] Starting session: ${sessionId}`);

    // Check if session already exists and is ready
    const existing = whatsappService.getSessionStatus(sessionId);
    if (existing.status === 'ready') {
      console.log(`[create-session] Session already ready: ${sessionId}`);
      return res.json({ success: true, sessionId, status: 'already_ready' });
    }

    // Start session asynchronously — respond immediately so frontend can connect socket
    res.json({ success: true, sessionId, status: 'initializing' });

    // Initialize in background
    whatsappService.createSession(sessionId).catch(err => {
      console.error(`[create-session] Background init failed for ${sessionId}:`, err.message);
      whatsappService.emitToSession(sessionId, 'auth_failure', {
        sessionId,
        message: `Failed to start session: ${err.message}`
      });
    });

  } catch (err) {
    console.error('[create-session] Error:', err);
    res.status(500).json({ success: false, message: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined });
  }
});

// Get session status
router.get('/session-status', (req, res) => {
  const sessionId = req.session.sessionId || req.query.sessionId;
  if (!sessionId) return res.json({ status: 'not_found' });
  const status = whatsappService.getSessionStatus(sessionId);
  res.json({ sessionId, ...status });
});

// Get current session ID
router.get('/session-id', (req, res) => {
  res.json({ sessionId: req.session.sessionId || null });
});

// Logout
router.post('/logout', async (req, res) => {
  const sessionId = req.session.sessionId;
  if (sessionId) {
    await whatsappService.logout(sessionId);
    req.session.destroy();
  }
  res.json({ success: true });
});

// Check if logged in
router.get('/check', (req, res) => {
  const sessionId = req.session.sessionId;
  if (!sessionId) return res.json({ loggedIn: false });
  const status = whatsappService.getSessionStatus(sessionId);
  res.json({ loggedIn: status.status === 'ready', sessionId, phone: status.phone });
});

module.exports = router;
