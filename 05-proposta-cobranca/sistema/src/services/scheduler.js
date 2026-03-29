const cron = require('node-cron');
const config = require('../config');
const billing = require('./billing');

function parsarHorario(horario) {
  const [hora, minuto] = horario.split(':');
  return { hora: parseInt(hora), minuto: parseInt(minuto) };
}

function iniciar() {
  console.log('[Scheduler] Iniciando agendamentos...');

  // ============================================
  // 06:00 - Gerar cobranças do dia no Asaas
  // ============================================
  cron.schedule('0 6 * * *', async () => {
    console.log('[Scheduler] === 06:00 - Gerando cobranças do dia ===');
    try {
      await billing.atualizarAtrasados();
      await billing.moverParaFilaHumana();
      await billing.gerarCobrancasDoDia();
    } catch (err) {
      console.error('[Scheduler] Erro na geração de cobranças:', err);
    }
  }, { timezone: 'America/Sao_Paulo' });

  // ============================================
  // DISPAROS DE WHATSAPP NOS 4 HORÁRIOS
  // ============================================
  const horarios = config.cobranca.horarios;

  horarios.forEach((horario, index) => {
    const { hora, minuto } = parsarHorario(horario);
    const tipo = `cobranca_${index + 1}`;

    cron.schedule(`${minuto} ${hora} * * *`, async () => {
      console.log(`[Scheduler] === ${horario} - Disparo ${tipo} ===`);
      try {
        await billing.dispararMensagens(tipo);
      } catch (err) {
        console.error(`[Scheduler] Erro no disparo ${tipo}:`, err);
      }
    }, { timezone: 'America/Sao_Paulo' });

    console.log(`[Scheduler] ✓ Agendado: ${tipo} às ${horario}`);
  });

  // ============================================
  // 19:30 - Mover não pagos para fila humana
  // ============================================
  cron.schedule('30 19 * * *', async () => {
    console.log('[Scheduler] === 19:30 - Movendo para fila humana ===');
    try {
      await billing.atualizarAtrasados();
      await billing.moverParaFilaHumana();
    } catch (err) {
      console.error('[Scheduler] Erro no resumo do dia:', err);
    }
  }, { timezone: 'America/Sao_Paulo' });

  console.log('[Scheduler] ✓ Todos os agendamentos configurados.');
  console.log('[Scheduler] Horários de cobrança:', horarios.join(', '));
}

module.exports = { iniciar };
