// Base de datos de suscripciones conocidas con sus URLs de cancelación
const KNOWN_SUBSCRIPTIONS = [
  // Streaming
  { pattern: /netflix/i, name: 'Netflix', cancelUrl: 'https://www.netflix.com/cancelplan', category: 'Streaming' },
  { pattern: /spotify/i, name: 'Spotify', cancelUrl: 'https://www.spotify.com/account/subscription/cancel', category: 'Streaming' },
  { pattern: /disney[\s+]?plus|disney\+/i, name: 'Disney+', cancelUrl: 'https://www.disneyplus.com/account', category: 'Streaming' },
  { pattern: /hbo|max\s/i, name: 'HBO Max', cancelUrl: 'https://www.hbomax.com/account', category: 'Streaming' },
  { pattern: /amazon prime|prime video/i, name: 'Amazon Prime', cancelUrl: 'https://www.amazon.com/mc/pipelines/cancellation', category: 'Streaming' },
  { pattern: /apple tv|appletv/i, name: 'Apple TV+', cancelUrl: 'https://appleid.apple.com/account/manage', category: 'Streaming' },
  { pattern: /youtube premium/i, name: 'YouTube Premium', cancelUrl: 'https://www.youtube.com/paid_memberships', category: 'Streaming' },
  { pattern: /paramount/i, name: 'Paramount+', cancelUrl: 'https://www.paramountplus.com/account/', category: 'Streaming' },
  { pattern: /star\+|star plus/i, name: 'Star+', cancelUrl: 'https://www.starplus.com/account', category: 'Streaming' },

  // Música
  { pattern: /apple music/i, name: 'Apple Music', cancelUrl: 'https://appleid.apple.com/account/manage', category: 'Música' },
  { pattern: /tidal/i, name: 'Tidal', cancelUrl: 'https://account.tidal.com/', category: 'Música' },
  { pattern: /deezer/i, name: 'Deezer', cancelUrl: 'https://www.deezer.com/account', category: 'Música' },

  // Cloud / Software
  { pattern: /icloud/i, name: 'iCloud', cancelUrl: 'https://appleid.apple.com/account/manage', category: 'Almacenamiento' },
  { pattern: /google one|google drive/i, name: 'Google One', cancelUrl: 'https://one.google.com/storage', category: 'Almacenamiento' },
  { pattern: /dropbox/i, name: 'Dropbox', cancelUrl: 'https://www.dropbox.com/account/plan', category: 'Almacenamiento' },
  { pattern: /microsoft 365|office 365|microsoft office/i, name: 'Microsoft 365', cancelUrl: 'https://account.microsoft.com/services', category: 'Software' },
  { pattern: /adobe/i, name: 'Adobe Creative Cloud', cancelUrl: 'https://account.adobe.com/plans', category: 'Software' },

  // Juegos
  { pattern: /playstation|ps plus|psn/i, name: 'PlayStation Plus', cancelUrl: 'https://www.playstation.com/account/subscription/', category: 'Juegos' },
  { pattern: /xbox|game pass/i, name: 'Xbox Game Pass', cancelUrl: 'https://account.microsoft.com/services', category: 'Juegos' },
  { pattern: /nintendo/i, name: 'Nintendo Switch Online', cancelUrl: 'https://accounts.nintendo.com/', category: 'Juegos' },
  { pattern: /ea play|origin/i, name: 'EA Play', cancelUrl: 'https://www.ea.com/account', category: 'Juegos' },

  // Gym / Salud
  { pattern: /gym|gimnasio|smart fit|smartfit/i, name: 'Gimnasio', cancelUrl: null, category: 'Salud' },

  // Comida
  { pattern: /pedidosya|pedidos ya/i, name: 'PedidosYa+', cancelUrl: 'https://www.pedidosya.com.uy/', category: 'Comida' },
  { pattern: /rappi prime/i, name: 'Rappi Prime', cancelUrl: 'https://www.rappi.com.uy/', category: 'Comida' },

  // Noticias
  { pattern: /new york times|nytimes/i, name: 'NY Times', cancelUrl: 'https://myaccount.nytimes.com/seg', category: 'Noticias' },
  { pattern: /the economist/i, name: 'The Economist', cancelUrl: 'https://www.economist.com/account', category: 'Noticias' },
];

/**
 * Detecta suscripciones en un array de transacciones
 * @param {Array} transactions - [{description, amount, date, type}]
 * @returns {Array} suscripciones detectadas
 */
function detectSubscriptions(transactions) {
  const detected = new Map();

  const debits = transactions.filter(t => t.type === 'debit');

  for (const tx of debits) {
    for (const sub of KNOWN_SUBSCRIPTIONS) {
      if (sub.pattern.test(tx.description)) {
        const key = sub.name;
        if (!detected.has(key)) {
          detected.set(key, {
            name: sub.name,
            amount: parseFloat(tx.amount),
            cancelUrl: sub.cancelUrl,
            category: sub.category,
            lastCharged: tx.date,
            frequency: 'monthly',
            autoDetected: true,
            transactions: [tx],
          });
        } else {
          const existing = detected.get(key);
          existing.transactions.push(tx);
          // Tomar el monto más reciente
          if (new Date(tx.date) > new Date(existing.lastCharged)) {
            existing.lastCharged = tx.date;
            existing.amount = parseFloat(tx.amount);
          }
        }
        break;
      }
    }
  }

  return Array.from(detected.values()).map(({ transactions: _, ...sub }) => sub);
}

module.exports = { detectSubscriptions };
