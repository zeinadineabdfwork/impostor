// src/middlewares/errorHandler.js
// Middleware centralizado de tratamento de erros e logs

/**
 * Middleware de erros do Express (4 parâmetros obrigatórios).
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Erro interno do servidor.';

  // Não expor stack em produção
  const body = {
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  };

  console.error(`[ErrorHandler] ${status} — ${req.method} ${req.path} — ${message}`);
  return res.status(status).json(body);
}

/**
 * Handler para rotas não encontradas (404).
 */
function notFoundHandler(req, res) {
  return res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.path}` });
}

module.exports = { errorHandler, notFoundHandler };
