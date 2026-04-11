const { Router } = require('express');
const config = require('../config');
const billing = require('../services/billing');
const { logger } = require('../middleware/logger');

const router = Router();

// ============================================
// WEBHOOK ASAAS - Confirmação de Pagamento
// ============================================
router.post('/asaas', async (req, res) => {
  // Validacao OBRIGATORIA do token.
  const token = req.headers['asaas-access-token'];
  if (!token || token !== config.asaas.webhookToken) {
    logger.warn(
      { ip: req.ip, tokenPresente: !!token },
      'Webhook Asaas com token invalido'
    );
    return res.status(401).json({ error: 'Token invalido' });
  }

  const { event, payment } = req.body || {};
  if (!event || !payment?.id) {
    return res.status(400).json({ error: 'Payload invalido' });
  }

  logger.info(
    { event, paymentId: payment.id },
    'Webhook Asaas recebido'
  );

  try {
    switch (event) {
      case 'PAYMENT_RECEIVED':
      case 'PAYMENT_CONFIRMED': {
        // A idempotencia e tratada dentro de billing.processarPagamento:
        // se a parcela ja estiver como 'pago', nao reenvia confirmacao nem
        // incrementa contador.
        const resultado = await billing.processarPagamento(payment.id);
        return res.json({ received: true, idempotente: !resultado });
      }

      case 'PAYMENT_REFUNDED':
      case 'PAYMENT_REFUND_IN_PROGRESS':
        // Reverte a parcela se ja estava paga.
        await billing.reverterPagamento(payment.id);
        return res.json({ received: true });

      case 'PAYMENT_OVERDUE':
        logger.info({ paymentId: payment.id }, 'Asaas reportou pagamento vencido');
        return res.json({ received: true });

      default:
        logger.debug({ event }, 'Evento Asaas ignorado');
        return res.json({ received: true, ignored: true });
    }
  } catch (err) {
    logger.error({ err, event, paymentId: payment.id }, 'Erro ao processar webhook');
    return res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
