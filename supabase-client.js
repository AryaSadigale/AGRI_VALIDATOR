// ========================================
// SUPABASE CLIENT — Shared across all pages
// ========================================

const SUPABASE_URL = 'https://ribrbnmrhkvqftdryaln.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpYnJibm1yaGt2cWZ0ZHJ5YWxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTE4MDYsImV4cCI6MjA4ODcyNzgwNn0.NdHoXJW7-dgyJUUF27tpCgoTuyaaEYhRQYhTZHT4yIQ';

const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Get current session (returns null if not logged in)
async function getSupabaseSession() {
  const { data: { session } } = await _supabase.auth.getSession();
  return session;
}

// Get current user with profile metadata
async function getSupabaseUser() {
  const session = await getSupabaseSession();
  if (!session) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.user_metadata?.name || 'User',
    role: session.user.user_metadata?.role || 'farmer',
    accessToken: session.access_token,
  };
}

// Get access token for API calls
async function getAccessToken() {
  const session = await getSupabaseSession();
  return session?.access_token || null;
}

// Authenticated fetch — auto-attaches Bearer token
async function authFetch(url, options = {}) {
  const token = await getAccessToken();
  const headers = {
    ...(options.headers || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(url, { ...options, headers });
}

// Sign out
async function supabaseSignOut() {
  await _supabase.auth.signOut();
  window.location.href = '/login';
}
