const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { whatsappService } = require('../services/whatsapp.service');

// Create/initialize a new WhatsApp session
router.post('/create-session', async (req, res) => {
  try {
    const sessionId = req.session.sessionId || uuidv4();
    req.session.sessionId = sessionId;

    const result = await whatsappService.createSession(sessionId);
    res.json({ success: true, sessionId, ...result });
  } catch (err) {
    console.error('Create session error:', err);
    res.status(500).json({ success: false, message: err.message });
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
