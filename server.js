// ============================================================
//  server.js  —  Ege's NFC Profile Backend
//  Run: node server.js
//  Requires: npm install
// ============================================================

import express    from 'express'
import cors       from 'cors'
import webpush    from 'web-push'
import Database   from 'better-sqlite3'

const app = express()
app.use(express.json())
app.use(cors())   // allow your frontend domain

// ── DATABASE ─────────────────────────────────────────────────
// Creates a local contacts.db file automatically
const db = new Database('contacts.db')

db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT,
    phone       TEXT NOT NULL,
    company     TEXT,
    notes       TEXT,
    met_at      TEXT NOT NULL,
    followed_up INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT UNIQUE NOT NULL,
    p256dh   TEXT NOT NULL,
    auth     TEXT NOT NULL
  );
`)

// ── WEB PUSH SETUP ────────────────────────────────────────────
// Step 1: Run this ONCE to generate your keys:
//   node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log(k)"
// Step 2: Paste the output below
const VAPID_PUBLIC  = 'BEQ2T2kgxhQ72FSj1StR5riZja4t8YByVdTmAqxfm_qiRxDvQFsoqx5M4t0ezXsPxB3URz5h7rOrMmJkIf38SLk'
const VAPID_PRIVATE = 'weRYzLj1mTCPpWNSdT-6ptRALQPK-xgBeQWTvzpjxG4'
const VAPID_EMAIL   = 'mailto:egecan.alparslan@gmail.com'

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE)

// ── ROUTES ───────────────────────────────────────────────────

/**
 * POST /contact
 * Called by your profile page form when someone submits.
 * Body: { name, email, phone, company, notes }
 */
app.post('/contact', (req, res) => {
  const { name, email, phone, company, notes } = req.body

  if (!name || !phone) {
    return res.status(400).json({ error: 'Name and phone are required.' })
  }

  const id     = crypto.randomUUID()
  const met_at = new Date().toISOString()

  db.prepare(`
    INSERT INTO contacts (id, name, email, phone, company, notes, met_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, email ?? '', phone, company ?? '', notes ?? '', met_at)

  console.log(`✅ New contact saved: ${name} (${phone})`)

  // ── Schedule the 11-hour follow-up notification ──────────
  const ELEVEN_HOURS = 11 * 60 * 60 * 1000  // milliseconds

  setTimeout(async () => {
    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id)

    // Don't notify if already followed up
    if (contact?.followed_up) return

    const subs = db.prepare('SELECT * FROM push_subscriptions').all()
    if (subs.length === 0) return

    const payload = JSON.stringify({
      title: `Follow up with ${name}`,
      body:  `You met ${name} 11 hours ago${company ? ` from ${company}` : ''}. Time to reach out! 👋`,
      url:   '/crm',
      contactId: id,
    })

    for (const sub of subs) {
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        }, payload)
        console.log(`🔔 Sent follow-up notification for ${name}`)
      } catch (err) {
        console.error('Push error:', err.statusCode, err.message)
        // Remove expired/invalid subscriptions
        if (err.statusCode === 404 || err.statusCode === 410) {
          db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(sub.endpoint)
        }
      }
    }
  }, ELEVEN_HOURS)

  res.json({ success: true, id })
})

/**
 * GET /contacts
 * Returns all contacts for your CRM dashboard.
 * Add authentication here before going live!
 */
app.get('/contacts', (req, res) => {
  const contacts = db.prepare(`
    SELECT * FROM contacts ORDER BY met_at DESC
  `).all()
  res.json(contacts)
})

/**
 * PATCH /contacts/:id/followedup
 * Marks a contact as followed up.
 */
app.patch('/contacts/:id/followedup', (req, res) => {
  db.prepare('UPDATE contacts SET followed_up = 1 WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

/**
 * DELETE /contacts/:id
 * Deletes a contact.
 */
app.delete('/contacts/:id', (req, res) => {
  db.prepare('DELETE FROM contacts WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

/**
 * POST /subscribe
 * Your phone calls this once to register for push notifications.
 * The frontend sends the subscription object from the browser.
 */
app.post('/subscribe', (req, res) => {
  const { endpoint, keys } = req.body
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Invalid subscription.' })
  }

  db.prepare(`
    INSERT OR REPLACE INTO push_subscriptions (endpoint, p256dh, auth)
    VALUES (?, ?, ?)
  `).run(endpoint, keys.p256dh, keys.auth)

  console.log('📱 Push subscription registered.')
  res.json({ success: true })
})

/**
 * GET /vapid-public-key
 * Your frontend fetches this to set up push notifications.
 */
app.get('/vapid-public-key', (req, res) => {
  res.json({ key: VAPID_PUBLIC })
})

// ── START ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`)
  console.log(`   POST /contact         → save a new contact`)
  console.log(`   GET  /contacts        → list all contacts`)
  console.log(`   POST /subscribe       → register push notifications`)
  console.log(`\n   ⚠️  Set your VAPID keys before going live!\n`)
})
