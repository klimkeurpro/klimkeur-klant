// ============================================================
// config.js — Supabase verbinding
// Alleen de anon key. Nooit de service_role key hier gebruiken.
// ============================================================

const SUPABASE_URL = 'https://vyptkeqcibtgyrnrcxrj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_94HAHA4s4elNEiP3-Mmz3g_UZGd4pgu';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
