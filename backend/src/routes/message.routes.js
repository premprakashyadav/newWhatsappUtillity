const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { whatsappService } = require('../services/whatsapp.service');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowedExcel = ['.xlsx', '.xls', '.csv'];
    const allowedImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.fieldname === 'excel' && allowedExcel.includes(ext)) return cb(null, true);
    if (file.fieldname === 'image' && allowedImage.includes(ext)) return cb(null, true);
    cb(new Error(`Invalid file type: ${file.fieldname}`));
  }
});

// Parse Excel/CSV file and return contacts
router.post('/parse-excel', upload.single('excel'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    // Cleanup uploaded excel
    fs.unlinkSync(req.file.path);

    if (!data.length) return res.status(400).json({ success: false, message: 'Excel file is empty' });

    // Normalize columns
    const contacts = data.map(row => {
      const normalized = {};
      for (const key of Object.keys(row)) {
        const lk = key.toLowerCase().trim();
        if (['phone', 'number', 'mobile', 'contact', 'whatsapp'].includes(lk)) normalized.phone = String(row[key]).replace(/\D/g, '');
        else if (['name', 'firstname', 'first_name', 'fullname', 'full_name'].includes(lk)) normalized.name = row[key];
        else normalized[key] = row[key];
      }
      return normalized;
    }).filter(c => c.phone && c.phone.length >= 7);

    res.json({ success: true, contacts, total: contacts.length, columns: Object.keys(data[0] || {}) });
  } catch (err) {
    console.error('Parse excel error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Send bulk messages
router.post('/send-bulk', upload.single('image'), async (req, res) => {
  const sessionId = req.session.sessionId || req.body.sessionId;
  if (!sessionId) return res.status(401).json({ success: false, message: 'No session' });

  const status = whatsappService.getSessionStatus(sessionId);
  if (status.status !== 'ready') return res.status(400).json({ success: false, message: 'WhatsApp not ready' });

  let contacts;
  try {
    contacts = JSON.parse(req.body.contacts || '[]');
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid contacts JSON' });
  }

  if (!contacts.length) return res.status(400).json({ success: false, message: 'No contacts provided' });

  const message = req.body.message || '';
  const imagePath = req.file ? req.file.path : null;
  const io = req.app.get('io');

  // Respond immediately, process in background
  res.json({ success: true, message: 'Bulk send started', total: contacts.length });

  const jobId = `job-${Date.now()}`;
  io.to(sessionId).emit('bulk-start', { jobId, total: contacts.length });

  try {
    const results = await whatsappService.sendBulkMessages(
      sessionId, contacts, message, imagePath,
      (progress) => {
        io.to(sessionId).emit('bulk-progress', { jobId, ...progress });
      }
    );

    const success = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    io.to(sessionId).emit('bulk-complete', { jobId, results, success, failed, total: contacts.length });
  } catch (err) {
    io.to(sessionId).emit('bulk-error', { jobId, error: err.message });
  } finally {
    if (imagePath && fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
  }
});

// Send single message
router.post('/send-single', upload.single('image'), async (req, res) => {
  const sessionId = req.session.sessionId || req.body.sessionId;
  if (!sessionId) return res.status(401).json({ success: false, message: 'No session' });

  const { phone, message } = req.body;
  const imagePath = req.file ? req.file.path : null;

  try {
    const result = await whatsappService.sendMessage(sessionId, phone.replace(/\D/g, ''), message, imagePath);
    if (imagePath && fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    res.json(result);
  } catch (err) {
    if (imagePath && fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Download sample Excel template
router.get('/sample-template', (req, res) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['name', 'phone'],
    ['John Doe', '919876543210'],
    ['Jane Smith', '918765432109'],
    ['Bob Johnson', '917654321098']
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Contacts');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename=contacts_template.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

module.exports = router;
