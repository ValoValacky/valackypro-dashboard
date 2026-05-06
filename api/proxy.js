// api/proxy.js
// Serverless proxy — avoids CORS issues when calling Finnhub from the browser
// Also keeps the Finnhub API key hidden from the client

const fetch = require('node-fetch');

const FH_KEY = process.env.FINNHUB_API_KEY;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { endpoint } = req.query;
  if (!endpoint) return res.status(400).json({ error: 'endpoint required' });

  // Whitelist allowed endpoints
  const allowed = [
    'calendar/economic',
    'news',
    'forex/rates',
    'forex/candle'
  ];
  const isAllowed = allowed.some(a => endpoint.startsWith(a));
  if (!isAllowed) return res.status(403).json({ error: 'Endpoint not allowed' });

  // Build remaining query params (excluding endpoint)
  const params = new URLSearchParams(req.query);
  params.delete('endpoint');

  // Use env key if available, fallback to client-provided key header
  const apiKey = FH_KEY || req.headers['x-finnhub-key'] || '';
  if (apiKey) params.set('token', apiKey);

  try {
    const url = `https://finnhub.io/api/v1/${endpoint}?${params.toString()}`;
    const r = await fetch(url);
    const data = await r.json();

    // Cache for 5 minutes
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
