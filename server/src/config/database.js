// src/config/database.js
// Inicialização do pool PostgreSQL via pg
require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('[DB] FATAL: DATABASE_URL não está definida nas variáveis de ambiente!');
  process.exit(1);
}

const isProduction = process.env.NODE_ENV === 'production';



pool.on('connect', () => {
  console.log('[DB] Nova conexão estabelecida com o pool PostgreSQL.');
});

pool.on('error', (err) => {
  console.error('[DB] ERRO inesperado no pool PostgreSQL:', err.message);
  console.error('[DB] Stack:', err.stack);
});

// Testar conexão ao iniciar — falha rápida com mensagem clara
pool.query('SELECT NOW()')
  .then(res => console.log(`[DB] Conexão OK — servidor PostgreSQL: ${res.rows[0].now}`))
  .catch(err => {
    console.error('[DB] FALHA ao conectar ao PostgreSQL!');
    console.error('[DB] Mensagem:', err.message);
    console.error('[DB] Código do erro:', err.code);
    console.error('[DB] Verifique DATABASE_URL e se o IP está permitido no Supabase.');
    // Não damos process.exit aqui para deixar o servidor subir e mostrar o erro via /health
  });

/**
 * Executa uma query parametrizada.
 * @param {string} text  — SQL com placeholders ($1, $2…)
 * @param {Array}  params — Valores para os placeholders
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (!isProduction) {
      console.log(`[DB] query(${duration}ms, rows:${res.rowCount}) — ${text.substring(0,80)}`);
    }
    return res;
  } catch (err) {
    const duration = Date.now() - start;
    console.error(`[DB] ERRO na query (${duration}ms):`);
    console.error(`[DB]   SQL: ${text}`);
    console.error(`[DB]   Params: ${JSON.stringify(params)}`);
    console.error(`[DB]   Código: ${err.code} | Mensagem: ${err.message}`);
    throw err;
  }
}

async function getClient() {
  try {
    const client = await pool.connect();
    const originalQuery = client.query.bind(client);
    const release = client.release.bind(client);

    client.query = (...args) => {
      client.lastQuery = args;
      return originalQuery(...args);
    };
    client.release = () => {
      client.query = originalQuery;
      client.release = release;
      return release();
    };
    return client;
  } catch (err) {
    console.error('[DB] ERRO ao obter cliente do pool:', err.message);
    throw err;
  }
}

module.exports = { query, getClient, pool };
