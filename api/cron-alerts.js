// api/cron-alerts.js
// Runs every hour via Vercel Cron
// Checks for high-impact macro events in the next 2 hours and sends Telegram alerts

const fetch = require('node-fetch');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;
const FH_KEY    = process.env.FINNHUB_API_KEY;

async function sendTelegram(message) {
  if (!BOT_TOKEN || !CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  });
}

async function checkUpcomingEvents() {
  if (!FH_KEY) return [];
  const now   = new Date();
  const from  = now.toISOString().split('T')[0];
  const to    = new Date(now.getTime() + 2 * 24 * 3600000).toISOString().split('T')[0];

  const res = await fetch(
    `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${FH_KEY}`
  );
  const data = await res.json();
  if (!data.economicCalendar) return [];

  const fxCurrencies = ['USD','EUR','GBP','JPY','CAD','CHF','AUD','NZD'];
  const nowTs = Math.floor(now.getTime() / 1000);
  const twoHoursLater = nowTs + 7200;

  return data.economicCalendar.filter(e => {
    const isForex = fxCurrencies.some(c =>
      (e.country||'').toUpperCase().includes(c) ||
      (e.unit||'').toUpperCase().includes(c)
    );
    const isHighImpact = (e.impact||'').toLowerCase().includes('high') || e.impact === '3';
    const eventTs = e.time || 0;
    const isSoon = eventTs >= nowTs && eventTs <= twoHoursLater;
    return isForex && isHighImpact && isSoon;
  });
}

async function checkRates() {
  try {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP,JPY,CAD,CHF,AUD,NZD');
    const data = await res.json();
    return data.rates || {};
  } catch(e) { return {}; }
}

module.exports = async function handler(req, res) {
  // Protect cron endpoint
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const alerts = [];

    // 1. Check upcoming high-impact events
    const events = await checkUpcomingEvents();
    for (const e of events) {
      const imp = '🔴';
      const dt = e.time
        ? new Date(e.time * 1000).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : e.date || '';
      const msg =
        `⚡ <b>ALERTE MACRO IMMINENTE</b> ${imp}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `📌 <b>${e.event}</b>\n` +
        `🏳️ <b>Pays :</b> ${e.country || '—'}\n` +
        `⏰ <b>Dans moins de 2h —</b> ${dt}\n` +
        `📉 <b>Précédent :</b> ${e.prev != null ? e.prev : '—'}\n` +
        `🎯 <b>Attendu :</b> ${e.estimate != null ? e.estimate : '—'}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `<i>Prépare ton analyse avant la publication.</i>`;
      await sendTelegram(msg);
      alerts.push({ type: 'macro_event', event: e.event });
    }

    // 2. Morning briefing at 7am UTC on weekdays
    const hour = new Date().getUTCHours();
    const dow  = new Date().getUTCDay();
    if (hour === 7 && dow >= 1 && dow <= 5) {
      const rates = await checkRates();
      // Simple scoring from rates momentum
      const pairs = Object.entries(rates)
        .sort(([,a],[,b]) => a - b) // lower USD rate = stronger currency
        .slice(0,3)
        .map(([c]) => c);
      const weak = Object.entries(rates)
        .sort(([,a],[,b]) => b - a)
        .slice(0,3)
        .map(([c]) => c);
      const briefing =
        `🌅 <b>BRIEFING MATINAL — ValackyPro</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `📅 ${new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })}\n\n` +
        `🏆 <b>Devises les plus fortes (vs USD) :</b> ${pairs.join(', ')}\n` +
        `📉 <b>Devises les plus faibles (vs USD) :</b> ${weak.join(', ')}\n\n` +
        `🎯 <b>Paire prioritaire :</b> ${pairs[0]}/USD vs ${weak[0]}/USD\n\n` +
        `📌 <b>Rappel :</b> Consulte ton dashboard pour le driver et le cycle du jour.\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `<a href="${process.env.DASHBOARD_URL || 'https://valackypro-dashboard.vercel.app'}">🔗 Ouvrir le Dashboard</a>`;
      await sendTelegram(briefing);
      alerts.push({ type: 'morning_briefing' });
    }

    return res.status(200).json({ ok: true, alerts_sent: alerts.length, alerts });

  } catch (err) {
    console.error('Cron error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
