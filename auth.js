import { getSupabaseClient, onAuthChange } from './supabaseClient.js';

// Phase 2 session gate. The workspace shell (Phase 3) will own this DOM;
// until then this module builds a temporary auth overlay and hides the
// single-user chat until a session exists.

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ensureOverlay() {
  let overlay = document.getElementById('auth-root');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'auth-root';
    document.body.prepend(overlay);
  }
  return overlay;
}

function setAppVisible(visible) {
  // Phase 3: the workspace shell owns visibility. Before the shell exists
  // (very first load), fall back to hiding the legacy header/main nodes.
  const shell = document.getElementById('shell');
  if (shell) {
    shell.hidden = !visible;
  } else {
    document.querySelectorAll('header, main').forEach((el) => {
      el.hidden = !visible;
    });
  }
  if (window.Workspace?.setSignedIn) {
    window.Workspace.setSignedIn(visible);
  }
}

function showError(overlay, message) {
  const box = overlay.querySelector('[data-auth-error]');
  if (box) {
    box.hidden = false;
    box.textContent = message;
  }
}

function renderAuthView(overlay, route) {
  const safeRoute = route === '#/signup' || route === '#/forgot' || route === '#/reset' ? route : '#/login';
  const nameField = safeRoute === '#/signup'
    ? '<label>Display name<input name="displayName" maxlength="60" autocomplete="nickname" required></label>'
    : '';
  const passwordField = safeRoute === '#/forgot'
    ? ''
    : '<label>Password<input name="password" type="password" autocomplete="current-password" required></label>';
  const submitLabel = safeRoute === '#/signup'
    ? 'Create account'
    : safeRoute === '#/forgot'
      ? 'Send reset link'
      : safeRoute === '#/reset'
        ? 'Set new password'
        : 'Sign in';

  overlay.innerHTML = `
    <div class="auth-card">
      <h1>AI Chat Workspace</h1>
      <p>Sign in to your self-hosted workspace.</p>
      <div data-auth-error class="auth-error" hidden></div>
      <form data-auth-form>
        ${nameField}
        <label>Email<input name="email" type="email" autocomplete="email" required></label>
        ${passwordField}
        <button type="submit">${escapeHtml(submitLabel)}</button>
      </form>
      <nav class="auth-links">
        <a href="#/login">Sign in</a>
        <a href="#/signup">Create account</a>
        <a href="#/forgot">Forgot password</a>
      </nav>
    </div>`;
}

function validDisplayName(value) {
  const name = String(value || '').trim();
  return name.length >= 1 && name.length <= 60 ? name : null;
}

async function ensureProfile(supabase, displayNameFromSignup) {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('id', user.id)
    .maybeSingle();
  if (profile) return profile;

  const fallback = validDisplayName(displayNameFromSignup || user.user_metadata?.display_name || '') || 'New member';
  const { data: created, error } = await supabase
    .from('profiles')
    .upsert({ id: user.id, display_name: fallback }, { onConflict: 'id' })
    .select('id, display_name')
    .single();
  if (error) throw error;
  return created;
}

async function handleAuthSubmit(event, overlay, supabase) {
  event.preventDefault();
  const box = overlay.querySelector('[data-auth-error]');
  if (box) {
    box.hidden = true;
    box.textContent = '';
  }
  const form = new FormData(event.target);
  const email = String(form.get('email') || '').trim();
  const password = String(form.get('password') || '');
  const displayName = validDisplayName(form.get('displayName'));
  const hash = window.location.hash || '#/login';

  try {
    if (hash === '#/signup') {
      if (!displayName) throw new Error('Please enter a display name with 1–60 characters.');
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } }
      });
      if (error) throw error;
      await ensureProfile(supabase, displayName);
    } else if (hash === '#/forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/#/reset`
      });
      if (error) throw error;
      showError(overlay, 'If that address has an account, a reset link is on its way.');
      return;
    } else if (hash === '#/reset') {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await ensureProfile(supabase, '');
    }
  } catch (error) {
    showError(overlay, error?.message || 'Authentication failed.');
  }
}

async function initAuth() {
  const overlay = ensureOverlay();
  const supabase = await getSupabaseClient();

  const applySession = (session) => {
    const signedIn = Boolean(session);
    overlay.hidden = signedIn;
    setAppVisible(signedIn);
    if (signedIn) {
      if (window.location.hash === '#/login' || window.location.hash === '#/signup') {
        window.location.hash = '#/';
      }
    } else if (!window.location.hash.startsWith('#/')) {
      window.location.hash = '#/login';
    }
  };

  renderAuthView(overlay, window.location.hash);
  overlay.addEventListener('submit', (event) => {
    if (event.target.matches('[data-auth-form]')) handleAuthSubmit(event, overlay, supabase);
  });
  window.addEventListener('hashchange', () => {
    if (!overlay.hidden) renderAuthView(overlay, window.location.hash);
  });

  const { data } = await supabase.auth.getSession();
  applySession(data.session);
  if (data.session) {
    try {
      await ensureProfile(supabase, '');
    } catch (error) {
      showError(overlay, error?.message || 'Could not load your profile.');
    }
  }
  onAuthChange(async ({ accessToken }) => {
    const { data: current } = await supabase.auth.getSession();
    applySession(current.session);
    if (current.session && accessToken) {
      try {
        await ensureProfile(supabase, '');
      } catch (error) {
        showError(overlay, error?.message || 'Could not load your profile.');
      }
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initAuth().catch(console.error));
} else {
  initAuth().catch(console.error);
}
