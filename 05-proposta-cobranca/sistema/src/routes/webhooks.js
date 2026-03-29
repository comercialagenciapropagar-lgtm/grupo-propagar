const { Router } = require('express');
const config = require('../config');
const billing = require('../services/billing');

const router = Router();

// ============================================
// WEBHOOK ASAAS - Confirmação de Pagamento
// ============================================
router.post('/asaas', async (req, res) => {
  // Validar token do webhook
  const token = req.headers['asaas-access-token'];
  if (config.asaas.webhookToken && token !== config.asaas.webhookToken) {
    console.warn('[Webhook] Token inválido recebido.');
    return res.status(401).json({ error: 'Token inválido' });
  }

  const { event, payment } = req.body;

  console.log(`[Webhook] Evento recebido: ${event} | Payment: ${payment?.id}`);

  try {
    switch (event) {
      case 'PAYMENT_RECEIVED':
      case 'PAYMENT_CONFIRMED':
        await billing.processarPagamento(payment.id);
        break;

      case 'PAYMENT_OVERDUE':
        console.log(`[Webhook] Pagamento vencido: ${payment.id}`);
        break;

      default:
        console.log(`[Webhook] Evento ignorado: ${event}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[Webhook] Erro ao processar:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
