// Loads supabase-js from a pinned CDN ESM build (no bundler, no import map
// needed) and exposes a single client plus a minimal session bridge for the
// classic chat script in app.js.

const SUPABASE_JS_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

let clientPromise = null;

async function loadClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const configResponse = await fetch('/config.json', { cache: 'no-store' });
      if (!configResponse.ok) {
        throw new Error('Could not load app configuration (/config.json).');
      }
      const config = await configResponse.json();
      if (!config.supabaseUrl || !config.supabaseAnonKey) {
        throw new Error('Supabase is not configured on the server.');
      }
      const { createClient } = await import(SUPABASE_JS_URL);
      return createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
    })();
  }
  return clientPromise;
}

let accessToken = null;
let currentUser = null;
const listeners = new Set();

function notify() {
  listeners.forEach((listener) => {
    try {
      listener({ accessToken, user: currentUser });
    } catch {
      // Listener errors must never break session tracking.
    }
  });
}

loadClient()
  .then((client) => {
    client.auth.getSession().then(({ data }) => {
      accessToken = data.session?.access_token || null;
      currentUser = data.session?.user || null;
      notify();
    });
    client.auth.onAuthStateChange((_event, session) => {
      accessToken = session?.access_token || null;
      currentUser = session?.user || null;
      notify();
    });
  })
  .catch((error) => {
    console.error('Supabase client failed to initialize:', error);
  });

export function getSupabaseClient() {
  return loadClient();
}

export function getAccessToken() {
  return accessToken;
}

export function getCurrentUser() {
  return currentUser;
}

export function onAuthChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (!window.AppAuth) {
  window.AppAuth = {};
}
window.AppAuth.getSupabaseClient = getSupabaseClient;
window.AppAuth.getAccessToken = getAccessToken;
window.AppAuth.getCurrentUser = getCurrentUser;
window.AppAuth.onAuthChange = onAuthChange;
