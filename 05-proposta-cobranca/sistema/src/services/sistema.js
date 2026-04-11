// Kill switch global do sistema.
// Estado guardado na tabela 'configuracoes' (chave='sistema_pausado').
// Consultado antes de cada disparo e cada geracao de cobranca.
// Cache em memoria por 30s para nao bater no banco a cada mensagem.

const supabase = require('../database');
const { logger } = require('../middleware/logger');

let cache = { pausado: false, motivo: null, expiresAt: 0 };

async function carregarEstado() {
  const agora = Date.now();
  if (agora < cache.expiresAt) return cache;
  try {
    const { data, error } = await supabase
      .from('configuracoes')
      .select('chave, valor')
      .in('chave', ['sistema_pausado', 'sistema_pausado_motivo']);
    if (error) {
      logger.warn({ err: error.message }, '[Sistema] Falha ao ler estado');
      return cache;
    }
    const mapa = Object.fromEntries((data || []).map((r) => [r.chave, r.valor]));
    cache = {
      pausado: mapa.sistema_pausado === 'true',
      motivo: mapa.sistema_pausado_motivo || null,
      expiresAt: agora + 30 * 1000,
    };
    return cache;
  } catch (err) {
    logger.warn({ err }, '[Sistema] Erro ao carregar estado');
    return cache;
  }
}

async function estaPausado() {
  const estado = await carregarEstado();
  return { pausado: estado.pausado, motivo: estado.motivo };
}

async function pausar(motivo, usuario) {
  await upsertConfig('sistema_pausado', 'true');
  await upsertConfig('sistema_pausado_motivo', motivo || `pausado por ${usuario || 'manual'}`);
  cache.expiresAt = 0; // invalida cache
  logger.warn({ usuario, motivo }, '[Sistema] SISTEMA PAUSADO');
}

async function retomar(usuario) {
  await upsertConfig('sistema_pausado', 'false');
  await upsertConfig('sistema_pausado_motivo', '');
  cache.expiresAt = 0;
  logger.info({ usuario }, '[Sistema] Sistema retomado');
}

async function upsertConfig(chave, valor) {
  await supabase
    .from('configuracoes')
    .upsert({ chave, valor }, { onConflict: 'chave' });
}

module.exports = { estaPausado, pausar, retomar };
