// src/config/database.js
// Inicialização do pool PostgreSQL via pg
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
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
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DB] query executed in ${duration}ms — rows: ${res.rowCount}`);
    }
    return res;
  } catch (err) {
    console.error('[DB] Query error:', err.message, '| SQL:', text);
    throw err;
  }
}

async function getClient() {
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
}

module.exports = { query, getClient, pool };
