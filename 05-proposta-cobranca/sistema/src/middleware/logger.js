const pino = require('pino');
const pinoHttp = require('pino-http');
const config = require('../config');

// Logger estruturado. Em desenvolvimento usa pretty-print, em producao NDJSON.
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'cobrai-app', env: config.nodeEnv },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport:
    config.nodeEnv === 'development'
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
        }
      : undefined,
});

// Middleware HTTP: loga cada requisicao com duracao, status, metodo.
const httpLogger = pinoHttp({
  logger,
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  // Nao logar acessos ao dashboard estatico e health (muito ruido).
  autoLogging: {
    ignore: (req) =>
      req.url === '/api/health' ||
      req.url === '/favicon.ico' ||
      req.url.startsWith('/assets'),
  },
});

module.exports = { logger, httpLogger };
