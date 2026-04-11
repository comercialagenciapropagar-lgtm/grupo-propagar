const supabase = require('../database');
const { logger } = require('../middleware/logger');

// Registra uma linha na tabela audit_log. Best-effort: se a tabela nao existir,
// apenas loga o erro e segue — nao deve quebrar a requisicao principal.
async function registrarAuditoria({
  usuario,
  acao,
  entidade = null,
  entidade_id = null,
  detalhes = null,
}) {
  try {
    const { error } = await supabase.from('audit_log').insert({
      usuario,
      acao,
      entidade,
      entidade_id,
      detalhes: detalhes ? JSON.stringify(detalhes) : null,
    });
    if (error) {
      logger.warn({ error: error.message, acao }, 'Falha ao registrar auditoria');
    }
  } catch (err) {
    logger.warn({ err, acao }, 'Falha ao registrar auditoria');
  }
}

module.exports = { registrarAuditoria };
