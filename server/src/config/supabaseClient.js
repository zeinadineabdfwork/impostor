// src/config/supabaseClient.js
// Instância singleton do SDK do Supabase para operações de Auth e Storage
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

let supabaseUrl  = process.env.SUPABASE_URL;
const supabaseKey  = process.env.SUPABASE_ANON_KEY;
const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[Supabase] FATAL: SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios no .env');
  process.exit(1);
}

// CORREÇÃO: O SDK do Supabase espera apenas a URL base do projeto,
// NÃO a URL da REST API (sem /rest/v1/ no final)
if (supabaseUrl.includes('/rest/v1')) {
  const original = supabaseUrl;
  supabaseUrl = supabaseUrl.replace(/\/rest\/v1\/?$/, '');
  console.warn(`[Supabase] AVISO: SUPABASE_URL continha /rest/v1/ — corrigido automaticamente.`);
  console.warn(`[Supabase]   Original : ${original}`);
  console.warn(`[Supabase]   Corrigido: ${supabaseUrl}`);
  console.warn(`[Supabase]   → Corrija o valor no .env / variáveis de ambiente do Render!`);
}

console.log(`[Supabase] A inicializar cliente com URL: ${supabaseUrl}`);

// Cliente público — operações autenticadas pelo JWT do utilizador
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

// Cliente de serviço — operações administrativas (bypass RLS)
const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

module.exports = { supabase, supabaseAdmin };
