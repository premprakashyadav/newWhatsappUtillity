require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const chromium = require('@sparticuz/chromium');

const authRoutes = require('./routes/auth.routes');
const messageRoutes = require('./routes/message.routes');
const { whatsappService } = require('./services/whatsapp.service');

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:4200',
  'http://localhost:4200',
  'http://localhost:3000',
];

const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'], credentials: true }
});

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'whatsapp-utility-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 24 * 60 * 60 * 1000 }
}));

// Uploads directory
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

app.set('io', io);
app.set('whatsappService', whatsappService);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);

// ── Health check (shows chromium path for debugging) ─────────────────────────
app.get('/api/health', async (req, res) => {
  let chromiumPath = null;

  try {
    chromiumPath = await chromium.executablePath();
  } catch (e) {
    console.error('[health] Chromium error:', e.message);
  }

  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    node: process.version,
    env: process.env.NODE_ENV,
    chromium: {
      path: chromiumPath,
      exists: !!chromiumPath,
    },
    sessions: whatsappService.getAllSessions().length,
  });
});

// ── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('[socket] Client connected:', socket.id);

  socket.on('init-session', (sessionId) => {
    socket.join(sessionId);
    console.log(`[socket] ${socket.id} joined session ${sessionId}`);

    // Send current status immediately on join
    const status = whatsappService.getSessionStatus(sessionId);
    socket.emit('session-status', status);

    // Re-send QR if already generated
    if (status.status === 'qr_ready' && status.qr) {
      socket.emit('qr', { qr: status.qr, sessionId });
    }
  });

  socket.on('disconnect', () => {
    console.log('[socket] Client disconnected:', socket.id);
  });
});

whatsappService.setIo(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`   NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`   FRONTEND_URL: ${process.env.FRONTEND_URL}`);
});
