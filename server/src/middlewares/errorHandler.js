// src/middlewares/errorHandler.js
// Middleware centralizado de tratamento de erros e logs

/**
 * Middleware de erros do Express (4 parâmetros obrigatórios).
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Erro interno do servidor.';

  // Log detalhado sempre no terminal (nunca no UI)
  console.error(`[ErrorHandler] ${status} — ${req.method} ${req.path}`);
  console.error(`[ErrorHandler] Mensagem: ${message}`);
  if (err.code)  console.error(`[ErrorHandler] Código: ${err.code}`);
  if (err.stack) console.error(`[ErrorHandler] Stack:\n${err.stack}`);

  // Resposta ao cliente: nunca expõe detalhes técnicos em produção
  const body = {
    error: status >= 500 && process.env.NODE_ENV === 'production'
      ? 'Erro interno do servidor.'
      : message,
  };

  return res.status(status).json(body);
}

/**
 * Handler para rotas não encontradas (404).
 */
function notFoundHandler(req, res) {
  console.warn(`[NotFound] ${req.method} ${req.path} — 404`);
  return res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.path}` });
}

module.exports = { errorHandler, notFoundHandler };
