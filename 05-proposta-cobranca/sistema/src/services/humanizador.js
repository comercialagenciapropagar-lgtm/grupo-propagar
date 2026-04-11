// Helpers para fazer as mensagens nao parecerem robo:
// - validacao anti-placeholder quebrado
// - saudacao dinamica pela hora de Brasilia
// - jitter de timing
// - guarda de horario humano

// Retorna a hora atual (0-23) no fuso America/Sao_Paulo.
function horaBrasilia() {
  const agora = new Date();
  // Intl com timeZone America/Sao_Paulo resolve independente do host.
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    hour12: false,
    timeZone: 'America/Sao_Paulo',
  });
  return parseInt(fmt.format(agora), 10);
}

// Saudacao variada por periodo do dia.
// Pequenas variacoes pra nao soar sempre igual.
function saudacao() {
  const h = horaBrasilia();
  const opcoes =
    h < 5
      ? ['Boa madrugada']
      : h < 12
      ? ['Bom dia', 'Bom diaa', 'Oi, bom dia']
      : h < 18
      ? ['Boa tarde', 'Oi, boa tarde']
      : ['Boa noite', 'Oi, boa noite'];
  return opcoes[Math.floor(Math.random() * opcoes.length)];
}

// Lint de mensagem: detecta placeholders nao substituidos.
// Se encontrar {{...}} sobrando, retorna lista — chamador deve abortar envio.
function lintMensagem(texto) {
  if (!texto || typeof texto !== 'string') {
    return ['mensagem vazia'];
  }
  const problemas = [];
  const placeholders = texto.match(/\{\{[^{}]+\}\}/g);
  if (placeholders && placeholders.length) {
    problemas.push(`placeholders nao resolvidos: ${placeholders.join(', ')}`);
  }
  if (texto.trim().length < 10) {
    problemas.push('mensagem muito curta');
  }
  if (texto.length > 4000) {
    // WhatsApp tem limite de ~4096 chars
    problemas.push('mensagem muito longa (> 4000 chars)');
  }
  return problemas;
}

// Sleep com jitter aleatorio. Mais humano que setTimeout fixo.
function jitterSleep(minMs = 2500, maxMs = 5500) {
  const ms = Math.floor(Math.random() * (maxMs - minMs)) + minMs;
  return new Promise((r) => setTimeout(r, ms));
}

// Verifica se agora e horario humano (07-21h).
// Deve ser chamado como defesa contra bugs do cron.
function dentroDeHorarioHumano() {
  const h = horaBrasilia();
  return h >= 7 && h < 21;
}

// Aplica substituicoes padrao + saudacao dinamica.
// Aceita um mapa extra para casos especificos.
function aplicarPlaceholders(template, contexto) {
  if (!template) return '';
  const base = {
    saudacao: saudacao(),
    nome: contexto.nome?.split(' ')[0] || 'tudo bem',
    valor: contexto.valor
      ? Number(contexto.valor).toFixed(2).replace('.', ',')
      : '',
    numero: contexto.numero ?? '',
    total: contexto.total ?? '',
    restantes: contexto.restantes ?? '',
    dias_atraso: contexto.dias_atraso ?? '',
    percentual: contexto.percentual ?? '',
    pix_copiaecola: contexto.pix_copiaecola ?? '',
  };
  let out = template;
  for (const [k, v] of Object.entries(base)) {
    out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
  }
  // Remove triplas quebras de linha (aparecem quando pix_copiaecola e vazio)
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return out;
}

module.exports = {
  horaBrasilia,
  saudacao,
  lintMensagem,
  jitterSleep,
  dentroDeHorarioHumano,
  aplicarPlaceholders,
};
