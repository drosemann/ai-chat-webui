// Settings view: profile, theme (synced to the server), model default,
// data export, demo cleanup, and account data deletion. Deleting the Auth
// user itself is an operator step in Supabase Auth; this view deletes every
// row the user owns and documents that step instead of faking it.
import * as data from './data.js';
import { clearDemo, isDemoRequest } from './home.js';
import { escapeHtml, toast } from './utils.js';

export async function renderSettings(root) {
  const [profile, settings] = await Promise.all([
    data.getProfile().catch(() => null),
    data.getSettings().catch(() => null)
  ]);
  const usageBytes = JSON.stringify({ profile, settings }).length;

  root.innerHTML = `
    <div class="view-head"><h1>Settings</h1></div>
    <div class="card-form">
      <h2>Profile</h2>
      <form id="profile-form" class="card-form" style="border:none;padding:0;margin:0">
        <label>Display name<input name="displayName" maxlength="60" value="${escapeHtml(profile?.display_name || '')}" required></label>
        <button type="submit" class="btn primary">Save profile</button>
      </form>
    </div>
    <div class="card-form">
      <h2>Appearance</h2>
      <label>Theme
        <select id="theme-select">
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
    </div>
    <div class="card-form">
      <h2>Your data</h2>
      <p class="muted">Local profile snapshot: ~${usageBytes} bytes. Full export downloads everything you own.</p>
      <div class="view-actions">
        <button type="button" class="btn" id="export-btn">Export my data (JSON)</button>
        ${isDemoRequest() ? '<button type="button" class="btn" id="demo-clear-btn">Clear demo data</button>' : ''}
        <button type="button" class="btn danger" id="wipe-btn">Delete all my data</button>
      </div>
      <p class="muted">Deleting removes all projects, tasks, conversations, messages, memories, and settings rows owned by this account. The login itself is then removed by the operator in Supabase Auth (see runbook) — this button never pretends to do that part.</p>
    </div>`;

  const themeSelect = root.querySelector('#theme-select');
  themeSelect.value = document.documentElement.getAttribute('data-theme') || 'light';
  themeSelect.addEventListener('change', async () => {
    document.documentElement.setAttribute('data-theme', themeSelect.value);
    localStorage.setItem('theme', themeSelect.value);
    try {
      await data.updateSettings({ theme: themeSelect.value });
    } catch (error) {
      toast(error?.message || 'Theme saved locally only.');
    }
  });

  root.querySelector('#profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = String(new FormData(e.target).get('displayName') || '').trim();
    if (!name) return;
    try {
      await data.updateDisplayName(name.slice(0, 60));
      window.Workspace?.refreshSidebar();
      toast('Profile saved.');
    } catch (error) {
      toast(error?.message || 'Could not save profile.');
    }
  });

  root.querySelector('#export-btn').addEventListener('click', async () => {
    try {
      const [projects, tasks, conversations, memories, userSettings] = await Promise.all([
        data.listProjects({ includeArchived: true }),
        data.listTasks(),
        data.listConversations(500),
        data.listMemories(),
        data.getSettings()
      ]);
      const messages = [];
      for (const c of conversations) {
        messages.push({ conversation_id: c.id, messages: await data.listMessages(c.id, 1000) });
      }
      const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), projects, tasks, conversations, messages, memories, userSettings }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'workspace-export.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (error) {
      toast(error?.message || 'Export failed.');
    }
  });

  root.querySelector('#demo-clear-btn')?.addEventListener('click', async () => {
    if (!window.confirm('Delete all Demo: rows?')) return;
    try {
      await clearDemo();
      window.Workspace?.notifyDataChanged();
      toast('Demo data cleared.');
    } catch (error) {
      toast(error?.message || 'Demo cleanup failed.');
    }
  });

  root.querySelector('#wipe-btn').addEventListener('click', async () => {
    const confirmText = window.prompt('Type DELETE to remove all data owned by this account:');
    if (confirmText !== 'DELETE') return;
    try {
      const [projects, tasks, conversations, memories] = await Promise.all([
        data.listProjects({ includeArchived: true }),
        data.listTasks(),
        data.listConversations(500),
        data.listMemories()
      ]);
      for (const t of tasks) await data.deleteTask(t.id);
      for (const c of conversations) await data.deleteConversation(c.id);
      for (const p of projects) await data.deleteProject(p.id);
      for (const m of memories) await data.deleteMemory(m.id);
      window.Workspace?.notifyDataChanged();
      toast('All owned rows deleted. Ask the operator to remove the login in Supabase Auth.');
    } catch (error) {
      toast(error?.message || 'Deletion failed partway; some rows may remain.');
    }
  });
}
