const supabase = require('../database');
const { logger } = require('../middleware/logger');

// Cache em memoria: evita consultar a cada disparo. Invalida a cada 1h.
let cache = { data: null, expiresAt: 0 };

async function carregarFeriados() {
  const agora = Date.now();
  if (cache.data && agora < cache.expiresAt) return cache.data;

  try {
    const { data, error } = await supabase
      .from('feriados')
      .select('data, nome')
      .eq('ativo', true);
    if (error) {
      // Se a tabela ainda nao existe, nao trava: retorna lista vazia.
      logger.warn({ err: error.message }, '[Feriados] Falha ao carregar, retornando vazio');
      return [];
    }
    cache = { data: data || [], expiresAt: agora + 60 * 60 * 1000 };
    return cache.data;
  } catch (err) {
    logger.warn({ err }, '[Feriados] Falha ao carregar');
    return [];
  }
}

async function ehFeriadoHoje() {
  const hoje = new Date().toISOString().split('T')[0];
  const feriados = await carregarFeriados();
  return feriados.some((f) => f.data === hoje);
}

module.exports = { carregarFeriados, ehFeriadoHoje };
