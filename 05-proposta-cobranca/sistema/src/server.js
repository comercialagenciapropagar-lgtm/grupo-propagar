const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const apiRoutes = require('./routes/api');
const webhookRoutes = require('./routes/webhooks');
const scheduler = require('./services/scheduler');

const app = express();

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// ROTAS
// ============================================
app.use('/api', apiRoutes);
app.use('/webhooks', webhookRoutes);

// Dashboard (SPA fallback)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// INICIAR
// ============================================
app.listen(config.port, () => {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║     Cobrai.app - Sistema de          ║');
  console.log('║     Cobranca Inteligente              ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');
  console.log(`Servidor rodando na porta ${config.port}`);
  console.log(`Dashboard: http://localhost:${config.port}`);
  console.log(`API: http://localhost:${config.port}/api`);
  console.log(`Webhook Asaas: http://localhost:${config.port}/webhooks/asaas`);
  console.log(`Ambiente: ${config.nodeEnv}`);
  console.log('');

  // Iniciar scheduler de cobranças
  scheduler.iniciar();
});
