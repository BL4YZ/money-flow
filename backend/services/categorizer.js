const RULES = [
  { pattern: /netflix|spotify|disney[\s+]|hbo|amazon prime|apple tv|youtube premium|paramount|star\+|tidal|deezer/i, category: 'Streaming' },
  { pattern: /supermercado|disco|devoto|g[eé]ant|tienda inglesa|walmart|ta-ta|ta ta|multiahorro|el dorado/i, category: 'Supermercado' },
  { pattern: /ute\b|antel|ancap|osse|saneamiento|abl\b|agua|luz\b|gas\b/i, category: 'Servicios' },
  { pattern: /uber|cabify|bolt|taxi|cut[cs]a|omnibus|bus\b|peaje|acv\b/i, category: 'Transporte' },
  { pattern: /farmacia|m[eé]dica|hospital|cl[ií]nica|doctor|mutualista|fonasa|smi\b|cam\b/i, category: 'Salud' },
  { pattern: /restaurant|delivery|pedidosya|rappi|pizza|burger|mcdonald|kfc|burger king|sushi|grill/i, category: 'Restaurantes' },
  { pattern: /gym|gimnasio|smart ?fit|megatlon|bodytech/i, category: 'Deporte' },
  { pattern: /cine|teatro|cinema|entretenimiento/i, category: 'Entretenimiento' },
  { pattern: /salario|sueldo|haberes|remuneraci[oó]n/i, category: 'Salario' },
  { pattern: /transfer|dep[oó]sito|ingreso/i, category: 'Transferencia' },
  { pattern: /alquiler|arrendamiento|renta\b/i, category: 'Vivienda' },
  { pattern: /cuota|pr[eé]stamo|hipoteca|cr[eé]dito/i, category: 'Préstamos' },
  { pattern: /ropa|zapatillas|calzado|vestuario|zara|h&m|koaj/i, category: 'Ropa' },
  { pattern: /educaci[oó]n|colegio|universidad|curso|capacitaci[oó]n/i, category: 'Educación' },
  { pattern: /seguro|p[oó]liza/i, category: 'Seguros' },
];

function categorize(description) {
  for (const rule of RULES) {
    if (rule.pattern.test(description)) return rule.category;
  }
  return 'Otros';
}

module.exports = { categorize };
