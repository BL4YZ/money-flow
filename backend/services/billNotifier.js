const cron = require('node-cron');
const axios = require('axios');
const db    = require('../db');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function isExpoPushToken(token) {
  return typeof token === 'string' && token.startsWith('ExponentPushToken[');
}

function daysUntil(dueDay) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), dueDay);
  const target = thisMonth > today
    ? thisMonth
    : new Date(today.getFullYear(), today.getMonth() + 1, dueDay);
  return Math.round((target - today) / 86400000);
}

async function sendBillReminders() {
  console.log('[billNotifier] Running bill reminder check...');
  try {
    const { rows: bills } = await db.query(`
      SELECT b.*, u.push_token
      FROM bills b
      JOIN users u ON u.id = b.user_id
      WHERE b.is_active = true AND u.push_token IS NOT NULL
    `);

    const messages = [];
    for (const bill of bills) {
      if (!isExpoPushToken(bill.push_token)) continue;
      const days = daysUntil(bill.due_day);
      if (days !== parseInt(bill.reminder_days)) continue;

      const amountStr = bill.amount
        ? ` — $${parseFloat(bill.amount).toLocaleString('es-UY', { maximumFractionDigits: 0 })}`
        : '';

      messages.push({
        to:    bill.push_token,
        sound: 'default',
        title: `Recordatorio: ${bill.name}`,
        body:  `Vence en ${days} día${days !== 1 ? 's' : ''} (día ${bill.due_day})${amountStr}`,
        data:  { billId: bill.id },
      });
    }

    if (messages.length === 0) {
      console.log('[billNotifier] No reminders to send today.');
      return;
    }

    // Expo Push API accepts up to 100 messages per request
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      const { data } = await axios.post(EXPO_PUSH_URL, chunk, {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      });
      console.log(`[billNotifier] Sent ${chunk.length} notifications:`, JSON.stringify(data?.data?.map(r => r.status)));
    }
  } catch (err) {
    console.error('[billNotifier] Error:', err.message);
  }
}

function startBillNotifier() {
  cron.schedule('0 9 * * *', sendBillReminders, { timezone: 'America/Montevideo' });
  console.log('[billNotifier] Scheduled daily at 09:00 America/Montevideo');
}

module.exports = { startBillNotifier, sendBillReminders };
