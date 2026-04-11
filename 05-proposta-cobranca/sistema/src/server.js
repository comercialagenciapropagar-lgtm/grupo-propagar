const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const config = require('./config');
const { logger, httpLogger } = require('./middleware/logger');
const apiRoutes = require('./routes/api');
const webhookRoutes = require('./routes/webhooks');
const scheduler = require('./services/scheduler');

// Validacoes criticas de inicializacao.
if (!config.security.jwtSecret) {
  logger.fatal('JWT_SECRET nao definido no .env. Abortando.');
  process.exit(1);
}
if (!config.asaas.webhookToken) {
  logger.fatal('ASAAS_WEBHOOK_TOKEN nao definido no .env. Abortando.');
  process.exit(1);
}
if (!config.security.users.length) {
  logger.fatal('AUTH_USERS_JSON vazio. Cadastre pelo menos um usuario.');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);

// ============================================
// MIDDLEWARE
// ============================================

// Headers de seguranca (desativa CSP pois o index.html tem inline scripts).
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS restrito: libera apenas a origem configurada em CORS_ORIGIN.
// Aceita lista separada por virgula.
const origins = config.security.corsOrigin.split(',').map((s) => s.trim());
app.use(
  cors({
    origin: origins.length > 1 ? origins : origins[0],
    credentials: true,
  })
);

app.use(httpLogger);
app.use(express.json({ limit: '10mb' }));
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

// Handler global de erro.
app.use((err, req, res, _next) => {
  logger.error({ err, path: req.path }, 'Erro nao tratado');
  res.status(500).json({ error: 'Erro interno' });
});

// ============================================
// INICIAR
// ============================================
const httpServer = app.listen(config.port, '0.0.0.0', () => {
  logger.info(
    {
      port: config.port,
      env: config.nodeEnv,
      dashboard: `http://localhost:${config.port}`,
    },
    'Cobrai.app iniciado'
  );

  // Iniciar scheduler de cobranças
  try {
    scheduler.iniciar();
  } catch (err) {
    logger.error({ err }, 'Erro ao iniciar scheduler');
  }
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
// Render envia SIGTERM antes de matar o container. Se estivermos no meio
// de um disparo de WhatsApp, precisamos terminar antes de fechar. Damos 25s
// (Render corta em 30s) e forcamos saida se nao terminar.
let shuttingDown = false;
function shutdown(sinal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.warn({ sinal }, 'Shutdown iniciado - parando de aceitar conexoes');

  const timer = setTimeout(() => {
    logger.error('Timeout de shutdown - forcando saida');
    process.exit(1);
  }, 25000);

  httpServer.close((err) => {
    clearTimeout(timer);
    if (err) {
      logger.error({ err }, 'Erro ao fechar HTTP server');
      process.exit(1);
    }
    logger.info('HTTP server fechado, saindo');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Nao deixa excecao nao-tratada derrubar o processo silenciosamente.
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  // Saida controlada: Render reinicia automaticamente.
  shutdown('uncaughtException');
});
