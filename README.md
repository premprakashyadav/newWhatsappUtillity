# 📱 WA Utility — Bulk WhatsApp Messaging Platform

A full-stack WhatsApp bulk messaging utility built with **Angular 17** (frontend) and **Node.js + Express** (backend). Scan a QR code to link your WhatsApp, upload an Excel file with contacts, compose a message (with optional image), and send to everyone at once.

---

## 🌟 Features

| Feature | Details |
|---|---|
| **QR Login** | Scan QR with WhatsApp mobile — no phone number needed |
| **Session Persistence** | Sessions saved locally; no re-scan on refresh |
| **Excel/CSV Upload** | Upload `.xlsx`, `.xls`, or `.csv` with phone + name columns |
| **Bulk Messaging** | Send to hundreds of contacts with per-message delay |
| **Personalization** | Use `{name}` in message body for per-contact names |
| **Image Attachments** | Attach JPG/PNG/GIF to any message |
| **Real-time Progress** | Live progress bar via Socket.io |
| **Single Send** | Quick one-off message panel |
| **Sample Template** | Download pre-formatted Excel template |
| **Results Report** | See success/failure per contact after send |

---

## 🗂 Project Structure

```
whatsapp-utility/
├── backend/                   # Node.js + Express API
│   ├── src/
│   │   ├── server.js          # Entry point + Socket.io
│   │   ├── routes/
│   │   │   ├── auth.routes.js     # Session management
│   │   │   └── message.routes.js  # Send & parse endpoints
│   │   └── services/
│   │       └── whatsapp.service.js  # whatsapp-web.js wrapper
│   ├── uploads/               # Temp file storage
│   ├── .env                   # Environment variables
│   └── package.json
│
├── frontend/                  # Angular 17 SPA
│   ├── src/
│   │   ├── app/
│   │   │   ├── components/
│   │   │   │   ├── login/         # QR scan login screen
│   │   │   │   └── dashboard/     # Main app (bulk + single send)
│   │   │   ├── services/
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── socket.service.ts
│   │   │   │   └── message.service.ts
│   │   │   └── guards/
│   │   │       └── auth.guard.ts
│   │   └── environments/
│   │       ├── environment.ts       # Dev config
│   │       └── environment.prod.ts  # Prod config (update URL)
│   └── package.json
│
├── .github/workflows/ci.yml   # GitHub Actions CI/CD
├── Dockerfile                 # Docker (Render deployment)
├── render.yaml                # Render service config
└── README.md
```

---

## 🚀 Local Development

### Prerequisites
- Node.js 18+
- npm 9+
- Angular CLI: `npm install -g @angular/cli`

### 1. Clone the repo
```bash
git clone https://github.com/YOUR_USERNAME/whatsapp-utility.git
cd whatsapp-utility
```

### 2. Setup Backend
```bash
cd backend
cp .env.example .env        # Edit with your values
npm install
npm run dev                 # Starts on http://localhost:3000
```

**backend/.env**
```env
PORT=3000
SESSION_SECRET=change-this-to-a-random-string
FRONTEND_URL=http://localhost:4200
NODE_ENV=development
```

### 3. Setup Frontend
```bash
cd frontend
npm install
npm start                   # Starts on http://localhost:4200
```

### 4. Open the App
Navigate to `http://localhost:4200` → Click **Generate QR Code** → Scan with WhatsApp

---

## 📊 Excel File Format

Your Excel file must have at minimum a **phone** column. A **name** column is optional but enables personalization.

| phone | name |
|---|---|
| 919876543210 | John Doe |
| 918765432109 | Jane Smith |
| 917654321098 | Bob Johnson |

> ⚠️ Phone numbers must include country code (no `+`). India = `91XXXXXXXXXX`

**Accepted column name variants:**
- Phone: `phone`, `number`, `mobile`, `contact`, `whatsapp`
- Name: `name`, `firstname`, `first_name`, `fullname`

Download the template directly from the app: **Dashboard → Bulk Send → ⬇ Template**

---

## 🌐 API Reference

### Auth Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/create-session` | Initialize WhatsApp session |
| `GET` | `/api/auth/session-status` | Get current session status |
| `GET` | `/api/auth/check` | Check if logged in |
| `POST` | `/api/auth/logout` | Logout & destroy session |

### Message Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/messages/parse-excel` | Upload & parse Excel file |
| `POST` | `/api/messages/send-bulk` | Start bulk send job |
| `POST` | `/api/messages/send-single` | Send to one number |
| `GET` | `/api/messages/sample-template` | Download Excel template |

### Socket.io Events

| Event | Direction | Payload |
|---|---|---|
| `init-session` | Client → Server | `sessionId` |
| `qr` | Server → Client | `{ qr: dataUrl, sessionId }` |
| `authenticated` | Server → Client | `{ sessionId }` |
| `ready` | Server → Client | `{ sessionId, phone }` |
| `disconnected` | Server → Client | `{ sessionId, reason }` |
| `bulk-start` | Server → Client | `{ jobId, total }` |
| `bulk-progress` | Server → Client | `{ jobId, current, total, result }` |
| `bulk-complete` | Server → Client | `{ jobId, results, success, failed }` |
| `bulk-error` | Server → Client | `{ jobId, error }` |

---

## ☁️ Deployment on Render

### Backend (Web Service)

1. Push code to GitHub
2. Go to [render.com](https://render.com) → **New → Web Service**
3. Connect your GitHub repo
4. Configure:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `node src/server.js`
   - **Environment:** Node
5. Add Environment Variables:
   ```
   NODE_ENV = production
   SESSION_SECRET = <generate a long random string>
   FRONTEND_URL = https://your-frontend.onrender.com
   ```
6. Click **Create Web Service**

> ⚠️ **Important for Render:** Puppeteer/Chromium needs extra setup. Use the **Dockerfile** deployment method for reliable Chromium support:
> - In Render, choose **Environment: Docker** instead of Node
> - Render will use the `Dockerfile` at the repo root automatically

### Frontend (Static Site)

1. Go to Render → **New → Static Site**
2. Connect same GitHub repo
3. Configure:
   - **Root Directory:** `frontend`
   - **Build Command:** `npm install && npm run build:prod`
   - **Publish Directory:** `frontend/dist/whatsapp-utility-frontend`
4. Update `frontend/src/environments/environment.prod.ts`:
   ```typescript
   export const environment = {
     production: true,
     apiUrl: 'https://YOUR-BACKEND.onrender.com/api',
     wsUrl: 'https://YOUR-BACKEND.onrender.com'
   };
   ```

---

## 🐙 GitHub Setup

```bash
# Initialize repo
git init
git add .
git commit -m "feat: initial WhatsApp utility setup"

# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/whatsapp-utility.git
git branch -M main
git push -u origin main
```

GitHub Actions will automatically:
- ✅ Lint backend on every push/PR
- ✅ Build Angular on every push/PR
- ✅ Render auto-deploys when main branch passes CI

---

## ⚙️ Configuration Tips

### Message Delay
In `backend/src/services/whatsapp.service.js`, the delay between messages is:
```js
await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
```
Adjust `2000` (ms) to increase/decrease delay. Higher delay = safer from bans.

### Personalization
In your message, use `{name}` or `{Name}`:
```
Hi {name}, we have a special offer for you! 🎉
```

---

## ⚠️ Important Disclaimers

- This tool uses **whatsapp-web.js**, an unofficial WhatsApp Web client
- Sending bulk messages may violate [WhatsApp Terms of Service](https://www.whatsapp.com/legal/terms-of-service)
- Use responsibly — only message people who have opted in
- Excessive bulk sending may result in your number being banned
- This project is for educational/personal use only

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Angular 17, TypeScript, SCSS |
| Backend | Node.js, Express.js |
| WhatsApp | whatsapp-web.js (Baileys-based) |
| Realtime | Socket.io |
| Excel | SheetJS (xlsx) |
| File Upload | Multer |
| Sessions | express-session |
| Browser | Puppeteer + Chromium |
| Deployment | Render.com |
| CI/CD | GitHub Actions |

---

## 📄 License

MIT © 2024 — Use at your own risk.
