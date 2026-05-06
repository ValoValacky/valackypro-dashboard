// api/telegram.js
// Serverless function — handles sending Telegram messages
// Called by the frontend and by cron jobs

const fetch = require('node-fetch');

const BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

async function sendTelegram(message, parseMode = 'HTML') {
  if (!BOT_TOKEN || !CHAT_ID) {
    throw new Error('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured');
  }
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: message,
      parse_mode: parseMode,
      disable_web_page_preview: true
    })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || 'Telegram error');
  return data;
}

module.exports = async function handler(req, res) {
  // Allow CORS for frontend calls
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { type, data } = req.body;

    let message = '';

    // ─────────────────────────────────────────────
    // 🔥 Commande /ping (réponse instantanée)
    // ─────────────────────────────────────────────
    if (type === 'ping') {
      await sendTelegram("Bot actif ✅");
      return res.status(200).json({ ok: true, message: 'Ping OK' });
    }
    // ─────────────────────────────────────────────

    switch (type) {

      // ── Manual test ──
      case 'test':
        message = `🦅 <b>ValackyPro Dashboard</b>\n\n✅ Connexion Telegram opérationnelle !\nTes alertes institutionnelles sont actives.`;
        break;

      // ── Trade alert from checklist ──
      case 'trade_alert':
        message =
          `🔔 <b>ALERTE TRADE — ValackyPro</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `📌 <b>Paire :</b> ${data.pair}\n` +
          `🎯 <b>Direction :</b> ${data.direction === 'buy' ? '🟢 ACHAT' : '🔴 VENTE'}\n` +
          `📊 <b>Driver :</b> ${data.driver || '—'}\n` +
          `🔄 <b>Cycle :</b> ${data.cycle || '—'}\n` +
          `⚡ <b>Conviction :</b> ${data.conviction}/10\n` +
          `⚖️ <b>R/R :</b> 1:${data.rr || '3'}\n` +
          `🛡 <b>Risque :</b> ${data.risk || '1'}% du capital\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `<i>La macro donne la direction. La technique donne le timing.</i>`;
        break;

      // ── Macro event alert ──
      case 'macro_event':
        const imp = data.impact === 'high' ? '🔴' : data.impact === 'medium' ? '🟡' : '⚪';
        message =
          `📅 <b>ÉVÉNEMENT MACRO</b> ${imp}\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `📌 <b>Événement :</b> ${data.event}\n` +
          `🏳️ <b>Pays/Devise :</b> ${data.country}\n` +
          `⏰ <b>Heure :</b> ${data.time}\n` +
          `📉 <b>Précédent :</b> ${data.previous || '—'}\n` +
          `🎯 <b>Attendu :</b> ${data.estimate || '—'}\n` +
          (data.actual ? `✅ <b>Actuel :</b> <b>${data.actual}</b>\n` : '') +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `<i>Impact attendu sur ${data.country} — surveiller les paires liées.</i>`;
        break;

      // ── Daily briefing ──
      case 'daily_briefing':
        message =
          `🌅 <b>BRIEFING QUOTIDIEN — ValackyPro</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `📅 ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}\n\n` +
          `🏆 <b>Devises fortes :</b> ${data.strong || '—'}\n` +
          `📉 <b>Devises faibles :</b> ${data.weak || '—'}\n` +
          `🔄 <b>Cycle actuel :</b> ${data.cycle || '—'}\n` +
          `📌 <b>Driver dominant :</b> ${data.driver || '—'}\n\n` +
          `🎯 <b>Top paires du jour :</b>\n${data.pairs || '—'}\n\n` +
          `⚡ <b>Événements clés aujourd\'hui :</b>\n${data.events || 'Aucun événement majeur'}\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `<i>ValackyPro Dashboard • Trading institutionnel</i>`;
        break;

      // ── Scoring update ──
      case 'scoring_update':
        message =
          `📊 <b>MISE À JOUR SCORING</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `${data.scoreTable}\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `🏆 Forte : <b>${data.strongest}</b> (+${data.strongScore})\n` +
          `📉 Faible : <b>${data.weakest}</b> (${data.weakScore})\n` +
          `🎯 Paire recommandée : <b>${data.topPair}</b>\n` +
          `<i>Mis à jour le ${new Date().toLocaleString('fr-FR')}</i>`;
        break;

      // ── Checklist complete ──
      case 'checklist_complete':
        message =
          `✅ <b>CHECKLIST COMPLÈTE — TRADE VALIDÉ</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `✔ Driver identifié : ${data.driver}\n` +
          `✔ Cycle : ${data.cycle}\n` +
          `✔ Politique monétaire analysée\n` +
          `✔ Paire : ${data.pair}\n` +
          `✔ Confirmation technique présente\n` +
          `✔ Risque défini\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `⚡ <b>TOUS LES CRITÈRES INSTITUTIONNELS SONT REMPLIS</b>\n` +
          `<i>Tu peux entrer en position.</i>`;
        break;

      default:
        return res.status(400).json({ error: 'Unknown message type' });
    }

    await sendTelegram(message);
    return res.status(200).json({ ok: true, message: 'Alert sent successfully' });

  } catch (err) {
    console.error('Telegram error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
