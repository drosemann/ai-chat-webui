// Workspace shell: sidebar navigation, view router, and right rail.
// The existing header/chat markup from index.html is adopted (not duplicated):
// the header becomes the content topbar and .chat-container moves into the
// chat view. Views other than chat render placeholders until their phase.
import { getSupabaseClient, onAuthChange } from './supabaseClient.js';
import * as data from './data.js';
import { escapeHtml, truncate, toast } from './utils.js';
import { renderTasks } from './tasks.js';
import { renderProjects } from './projects.js';
import { renderHome, renderRail } from './home.js';
import { renderMemory } from './memory.js';
import { renderModels } from './models.js';
import { renderSettings } from './settings.js';

// Phase 3 loads the workspace stylesheet dynamically so index.html stays
// untouched; the <link> will move into <head> in the Phase 8 cleanup.
if (!document.querySelector('link[data-workspace-styles]')) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'styles.css';
  link.dataset.workspaceStyles = 'true';
  document.head.appendChild(link);
}

let shellBuilt = false;
let views = {};
let sidebarEls = {};
let lastUserId = null;

const VIEW_NAMES = ['home', 'chat', 'projects', 'tasks', 'memory', 'models', 'settings'];

export async function setSignedIn(signedIn) {
  const shell = document.getElementById('shell');
  if (shell) shell.hidden = !signedIn;
  if (!signedIn) {
    lastUserId = null;
    return;
  }
  try {
    const supabase = await getSupabaseClient();
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id || null;
    if (lastUserId && userId && userId !== lastUserId && window.ChatView?.reset) {
      window.ChatView.reset();
      if (window.location.hash.startsWith('#/chat/')) {
        window.location.hash = '#/chat';
      }
    }
    lastUserId = userId;
  } catch (error) {
    console.error('Session check failed:', error);
  }
  render();
}

function buildShell() {
  if (shellBuilt) return;
  shellBuilt = true;

  const header = document.querySelector('header');
  const main = document.querySelector('main');

  const shell = document.createElement('div');
  shell.id = 'shell';
  shell.hidden = true;

  const sidebar = document.createElement('aside');
  sidebar.id = 'sidebar';
  sidebar.innerHTML = `
    <div class="brand"><span class="brand-mark">AI</span><span>Workspace</span>
      <button id="menu-close" aria-label="Close navigation">✕</button>
    </div>
    <nav id="main-nav" aria-label="Workspace">
      <a href="#/home" data-route="home">Home</a>
      <a href="#/chat" data-route="chat">Chat</a>
      <a href="#/projects" data-route="projects">Projects</a>
      <a href="#/tasks" data-route="tasks">Tasks</a>
      <a href="#/memory" data-route="memory">Memory</a>
      <a href="#/models" data-route="models">Models</a>
    </nav>
    <div class="side-section">
      <h2>Projects</h2>
      <div id="projects-list"><p class="side-empty">No projects yet.</p></div>
    </div>
    <div class="side-section">
      <h2>Pinned</h2>
      <div id="pinned-list"><p class="side-empty">Nothing pinned yet.</p></div>
    </div>
    <div class="side-section">
      <h2>Today</h2>
      <div id="today-list"><p class="side-empty">Nothing due today.</p></div>
    </div>
    <div class="sidebar-footer">
      <div id="user-chip"></div>
      <div class="sidebar-actions">
        <a href="#/settings">Settings</a>
        <button id="signout-btn" type="button">Sign out</button>
      </div>
    </div>`;

  const content = document.createElement('div');
  content.id = 'content';
  const topbar = document.createElement('div');
  topbar.id = 'topbar';
  topbar.innerHTML = '<button id="menu-btn" aria-label="Open navigation">☰</button><div id="model-picker"></div>';
  const viewRoot = document.createElement('div');
  viewRoot.id = 'view-root';
  for (const name of VIEW_NAMES) {
    const section = document.createElement('section');
    section.id = `view-${name}`;
    section.hidden = true;
    viewRoot.appendChild(section);
    views[name] = section;
  }

  const chatContainer = main ? main.querySelector('.chat-container') : null;
  if (chatContainer) views.chat.appendChild(chatContainer);

  if (header) content.appendChild(header);
  content.appendChild(topbar);
  content.appendChild(viewRoot);

  const rail = document.createElement('aside');
  rail.id = 'rail';
  rail.hidden = true;

  shell.append(sidebar, content, rail);
  document.body.appendChild(shell);
  if (main) main.remove();

  sidebarEls = {
    projects: sidebar.querySelector('#projects-list'),
    pinned: sidebar.querySelector('#pinned-list'),
    today: sidebar.querySelector('#today-list'),
    userChip: sidebar.querySelector('#user-chip')
  };

  sidebar.querySelector('#signout-btn').addEventListener('click', async () => {
    try {
      const supabase = await getSupabaseClient();
      await supabase.auth.signOut();
      window.location.hash = '#/login';
    } catch (error) {
      toast(error?.message || 'Sign out failed.');
    }
  });
  sidebar.querySelector('#menu-close').addEventListener('click', () => document.body.classList.remove('nav-open'));
  topbar.querySelector('#menu-btn').addEventListener('click', () => document.body.classList.toggle('nav-open'));

  window.addEventListener('hashchange', render);
  document.addEventListener('workspace:data-changed', () => refreshSidebar());
}

function parseRoute() {
  const hash = window.location.hash || '#/';
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts.length === 0) return { view: 'home', param: null };
  if (VIEW_NAMES.includes(parts[0])) return { view: parts[0], param: parts[1] || null };
  if (parts[0] === 'login' || parts[0] === 'signup' || parts[0] === 'forgot' || parts[0] === 'reset') {
    return { view: '__auth', param: null };
  }
  return { view: 'home', param: null };
}

function placeholderView(title, phase, blurb) {
  return `
    <div class="view-head"><h1>${escapeHtml(title)}</h1></div>
    <div class="empty-state">
      <p>${escapeHtml(blurb)}</p>
      <p class="muted">Arrives in Phase ${phase}.</p>
    </div>`;
}

export async function render() {
  if (!shellBuilt) return;
  const { view, param } = parseRoute();
  if (view === '__auth') return;

  document.querySelectorAll('#main-nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === view);
  });
  for (const name of VIEW_NAMES) views[name].hidden = name !== view;

  const rail = document.getElementById('rail');
  const railVisible = view === 'home' || view === 'chat';
  if (rail) rail.hidden = !railVisible;
  if (rail && railVisible) {
    try {
      await renderRail(rail);
    } catch (error) {
      console.error('Rail render failed:', error);
    }
  }

  try {
    if (view === 'chat') {
      if (window.ChatView?.mountChat) {
        await window.ChatView.mountChat(views.chat, { conversationId: param });
      }
    } else if (view === 'home') {
      await renderHome(views.home);
    } else if (view === 'projects') {
      await renderProjects(views.projects, param);
    } else if (view === 'tasks') {
      await renderTasks(views.tasks);
    } else if (view === 'memory') {
      await renderMemory(views.memory);
    } else if (view === 'models') {
      await renderModels(views.models);
    } else if (view === 'settings') {
      await renderSettings(views.settings);
    }
  } catch (error) {
    console.error('View render failed:', error);
    views[view].innerHTML = `<div class="empty-state"><p>Could not load this view.</p><p class="muted">${escapeHtml(error?.message || '')}</p></div>`;
  }

  refreshSidebar();
}

export async function refreshSidebar() {
  if (!shellBuilt || !sidebarEls.pinned) return;
  try {
    const [conversations, tasks, profile, projects] = await Promise.all([
      data.listConversations(50),
      data.listTasks({ status: 'open' }),
      data.getProfile().catch(() => null),
      data.listProjects().catch(() => [])
    ]);

    if (sidebarEls.projects) {
      sidebarEls.projects.innerHTML = projects.length === 0
        ? '<p class="side-empty">No projects yet.</p>'
        : projects.slice(0, 8).map((p) => `<a class="side-item" href="#/projects/${escapeHtml(p.id)}">${escapeHtml(truncate(p.name, 40))}</a>`).join('');
    }

    if (profile && sidebarEls.userChip) {
      sidebarEls.userChip.innerHTML = `<span class="avatar-sm">${escapeHtml((profile.display_name || '?').slice(0, 1).toUpperCase())}</span><span>${escapeHtml(profile.display_name || '')}</span>`;
    }

    const pinned = conversations.filter((c) => c.pinned);
    sidebarEls.pinned.innerHTML = pinned.length === 0
      ? '<p class="side-empty">Nothing pinned yet.</p>'
      : pinned.map((c) => `<a class="side-item" href="#/chat/${escapeHtml(c.id)}">${escapeHtml(truncate(c.title, 40))}</a>`).join('');

    const today = data.selectToday(tasks);
    sidebarEls.today.innerHTML = today.length === 0
      ? '<p class="side-empty">Nothing due today.</p>'
      : today.slice(0, 8).map((t) => `<a class="side-item" href="#/tasks">${escapeHtml(truncate(t.title, 40))}</a>`).join('');
  } catch (error) {
    console.error('Sidebar refresh failed:', error);
  }
}

export function notifyDataChanged() {
  document.dispatchEvent(new CustomEvent('workspace:data-changed'));
}

export async function initWorkspace() {
  buildShell();
  if (!window.Workspace) window.Workspace = {};
  window.Workspace.setSignedIn = setSignedIn;
  window.Workspace.refreshSidebar = refreshSidebar;
  window.Workspace.notifyDataChanged = notifyDataChanged;

  onAuthChange(({ accessToken }) => setSignedIn(Boolean(accessToken)));
  const supabase = await getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  setSignedIn(Boolean(data.session));
}
