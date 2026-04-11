const cron = require('node-cron');
const config = require('../config');
const billing = require('./billing');
const { ehFeriadoHoje } = require('./feriados');
const { rodarBackupCompleto } = require('./backup');
const { logger } = require('../middleware/logger');

function parsarHorario(horario) {
  const [hora, minuto] = horario.split(':');
  return { hora: parseInt(hora), minuto: parseInt(minuto) };
}

// Guard: pula execucao se hoje for feriado nacional.
async function comGuardaFeriado(nome, fn) {
  if (await ehFeriadoHoje()) {
    logger.info({ task: nome }, '[Scheduler] Feriado hoje - pulando task');
    return;
  }
  return fn();
}

function iniciar() {
  logger.info('[Scheduler] Iniciando agendamentos...');

  // ============================================
  // 06:00 - Gerar cobranças do dia no Asaas
  // ============================================
  cron.schedule(
    '0 6 * * 1-6',
    () =>
      comGuardaFeriado('gerar-cobrancas', async () => {
        logger.info('[Scheduler] === 06:00 - Gerando cobranças do dia ===');
        try {
          await billing.atualizarAtrasados();
          await billing.moverParaFilaHumana();
          await billing.gerarCobrancasDoDia();
        } catch (err) {
          logger.error({ err }, '[Scheduler] Erro na geração de cobranças');
        }
      }),
    { timezone: 'America/Sao_Paulo' }
  );

  // ============================================
  // DISPAROS DE WHATSAPP NOS 4 HORÁRIOS
  // ============================================
  const horarios = config.cobranca.horarios;

  horarios.forEach((horario, index) => {
    const { hora, minuto } = parsarHorario(horario);
    const tipo = `cobranca_${index + 1}`;

    cron.schedule(
      `${minuto} ${hora} * * 1-6`,
      () =>
        comGuardaFeriado(`disparo-${tipo}`, async () => {
          logger.info({ tipo, horario }, `[Scheduler] === ${horario} - Disparo ${tipo} ===`);
          try {
            await billing.dispararMensagens(tipo);
          } catch (err) {
            logger.error({ err, tipo }, `[Scheduler] Erro no disparo ${tipo}`);
          }
        }),
      { timezone: 'America/Sao_Paulo' }
    );

    logger.info({ tipo, horario }, `[Scheduler] ✓ Agendado: ${tipo} às ${horario}`);
  });

  // ============================================
  // 19:30 - Mover não pagos para fila humana
  // ============================================
  cron.schedule(
    '30 19 * * 1-6',
    () =>
      comGuardaFeriado('fila-humana', async () => {
        logger.info('[Scheduler] === 19:30 - Movendo para fila humana ===');
        try {
          await billing.atualizarAtrasados();
          await billing.moverParaFilaHumana();
        } catch (err) {
          logger.error({ err }, '[Scheduler] Erro no resumo do dia');
        }
      }),
    { timezone: 'America/Sao_Paulo' }
  );

  // ============================================
  // 03:00 - Backup diario do banco (todos os dias, inclusive domingo e feriado)
  // ============================================
  cron.schedule(
    '0 3 * * *',
    async () => {
      logger.info('[Scheduler] === 03:00 - Backup diario ===');
      try {
        const resultado = await rodarBackupCompleto(30);
        logger.info(
          {
            destino: resultado.destino,
            linhas: resultado.metadata.total_linhas,
            retencao_apagados: resultado.retencao.apagados,
          },
          '[Scheduler] Backup diario concluido'
        );
      } catch (err) {
        logger.error({ err }, '[Scheduler] Erro no backup diario');
      }
    },
    { timezone: 'America/Sao_Paulo' }
  );

  logger.info('[Scheduler] ✓ Backup diario agendado: 03:00 (retencao 30 dias)');
  logger.info('[Scheduler] ✓ Todos os agendamentos configurados.');
  logger.info({ horarios }, '[Scheduler] Horários de cobrança');
}

module.exports = { iniciar };
