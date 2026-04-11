const jwt = require('jsonwebtoken');
const config = require('../config');

// Gera um JWT assinado com o segredo da aplicação.
// Validade: 12 horas (renovável via /api/login).
function assinarToken(payload) {
  if (!config.security.jwtSecret) {
    throw new Error('JWT_SECRET nao configurado no .env');
  }
  return jwt.sign(payload, config.security.jwtSecret, { expiresIn: '12h' });
}

// Verifica o token do header Authorization: Bearer <token>.
// Retorna o payload decodificado ou null se invalido.
function verificarToken(token) {
  try {
    return jwt.verify(token, config.security.jwtSecret);
  } catch (_err) {
    return null;
  }
}

// Middleware Express: bloqueia requisição se token ausente/invalido.
// Injeta req.usuario com { usuario, nome }.
function exigirAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token ausente' });
  }
  const token = header.slice(7);
  const payload = verificarToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Token invalido ou expirado' });
  }
  req.usuario = { usuario: payload.usuario, nome: payload.nome };
  next();
}

module.exports = { assinarToken, verificarToken, exigirAuth };
