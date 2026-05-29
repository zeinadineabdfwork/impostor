// src/config/supabaseClient.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl  = process.env.SUPABASE_URL;
const supabaseKey  = process.env.SUPABASE_ANON_KEY;
const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Validação e diagnóstico de arranque ─────────────────────────────────────
if (!supabaseUrl || !supabaseKey) {
  console.error('[Supabase] ❌ SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios.');
  console.error('[Supabase]    SUPABASE_URL presente?     ', !!supabaseUrl);
  console.error('[Supabase]    SUPABASE_ANON_KEY presente?', !!supabaseKey);
  throw new Error('[Supabase] Variáveis de ambiente em falta. Ver logs acima.');
}

// ATENÇÃO: A SUPABASE_URL deve ser a URL base do projecto, SEM /rest/v1/ no final.
// Correcto  : https://xyzxyz.supabase.co
// Incorrecto: https://xyzxyz.supabase.co/rest/v1/
if (supabaseUrl.includes('/rest/v1')) {
  console.error('[Supabase] ❌ SUPABASE_URL contém "/rest/v1/" — isso está ERRADO.');
  console.error('[Supabase]    Valor actual :', supabaseUrl);
  console.error('[Supabase]    Deve ser     :', supabaseUrl.replace(/\/rest\/v1\/?$/, ''));
  console.error('[Supabase]    Corrija a variável de ambiente no Render e volte a fazer deploy.');
  throw new Error('[Supabase] SUPABASE_URL inválida. Ver logs acima.');
}

if (!serviceKey) {
  console.warn('[Supabase] ⚠️  SUPABASE_SERVICE_ROLE_KEY não definida.');
  console.warn('[Supabase]    O cliente admin (supabaseAdmin) NÃO estará disponível.');
  console.warn('[Supabase]    Upload de avatares e operações admin vão falhar.');
}

console.log('[Supabase] ✅ A inicializar cliente para:', supabaseUrl);

// Cliente público — operações autenticadas pelo JWT do utilizador
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

// Cliente de serviço — operações administrativas (bypass RLS)
// Se a service key não existir, exporta null para que os controllers possam verificar
const supabaseAdmin = serviceKey
  ? createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

module.exports = { supabase, supabaseAdmin };
