// src/config/supabaseClient.js
// Instância singleton do SDK do Supabase para operações de Auth e Storage
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl  = process.env.SUPABASE_URL;
const supabaseKey  = process.env.SUPABASE_ANON_KEY;
const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('[Supabase] SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios no .env');
}

// Cliente público — operações autenticadas pelo JWT do utilizador
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

// Cliente de serviço — operações administrativas (bypass RLS)
const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

module.exports = { supabase, supabaseAdmin };
