// ============================================================
// config.js — Supabase verbinding
// Alleen de anon key. Nooit de service_role key hier gebruiken.
// ============================================================

const SUPABASE_URL = 'https://vyptkeqcibtgyrnrcxrj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5cHRrZXFjaWJ0Z3lybnJjeHJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NzExMTcsImV4cCI6MjA4ODE0NzExN30.BnzphDOgDB038qraKao2Lx5SpAz4oCSMBWDvNzeIIaM';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
