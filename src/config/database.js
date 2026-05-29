// src/config/database.js
require('dotenv').config();
const { Pool } = require('pg');

const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  max: 10, // Render free tier: reduzido de 20 para não esgotar conexões do Supabase pooler
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000, // aumentado: Render pode ter latência maior na cold start
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
  console.error('[DB] Stack:', err.stack);
});

// ── Teste de conexão ao arrancar ─────────────────────────────────────────────
// Falha rápida e visível no terminal do Render se DATABASE_URL estiver errado
pool.connect((err, client, release) => {
  if (err) {
    console.error('[DB] ❌ FALHA AO CONECTAR À BASE DE DADOS:');
    console.error('[DB]    Mensagem :', err.message);
    console.error('[DB]    Código   :', err.code);
    console.error('[DB]    DATABASE_URL configurada? :', !!process.env.DATABASE_URL);
    // Não fazer process.exit aqui — deixar o servidor arrancar para o health check funcionar
    // mas o erro fica bem visível no log do Render
    return;
  }
  console.log('[DB] ✅ Conexão à base de dados estabelecida com sucesso.');
  release();
});

async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (!isProduction) {
      console.log(`[DB] query(${duration}ms) rows=${res.rowCount} — ${text.slice(0, 80)}`);
    }
    return res;
  } catch (err) {
    console.error('[DB] ❌ Query error:');
    console.error('[DB]    Mensagem :', err.message);
    console.error('[DB]    Código   :', err.code);
    console.error('[DB]    SQL      :', text);
    console.error('[DB]    Params   :', JSON.stringify(params));
    throw err;
  }
}

async function getClient() {
  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    console.error('[DB] ❌ Falha ao obter client do pool:', err.message);
    throw err;
  }
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
}

module.exports = { query, getClient, pool };
