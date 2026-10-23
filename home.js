// Home dashboard ("Your day, handled") plus the right rail. Everything is
// rendered from the signed-in user's Supabase rows; empty states hide
// sections instead of inventing content. ?demo=1 inserts clearly labelled,
// one-click-removable demo rows for reviewers.
import * as data from './data.js';
import { escapeHtml, truncate, formatDate, toast } from './utils.js';

const HOME_TEMPLATES = [
  'Plan my day: ',
  'Break this into tasks: ',
  'Summarize: ',
  'Draft an outline for: '
];

function greeting(name) {
  const hour = new Date().getHours();
  const part = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${name}.` : `${part}.`;
}

export async function renderHome(root) {
  const [profile, tasks, conversations] = await Promise.all([
    data.getProfile().catch(() => null),
    data.listTasks(),
    data.listConversations(50)
  ]);

  const open = tasks.filter((t) => t.status === 'open');
  const doneToday = tasks.filter((t) => {
    if (t.status !== 'done' || !t.completed_at) return false;
    const d = new Date(t.completed_at);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  });
  const needsInput = data.selectNeedsInput(tasks);
  const upcoming = data.selectUpcoming(open, 3);
  const busy = Boolean(window.ChatView?.isBusy?.());

  const params = new URLSearchParams(window.location.search);

  root.innerHTML = `
    <div class="view-head">
      <div>
        <h1>${escapeHtml(greeting(profile?.display_name))}</h1>
        <p class="muted">${escapeHtml(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))} · ${open.length} open · ${doneToday.length} done today · ${needsInput.length} need input</p>
      </div>
      ${params.get('demo') === '1' ? '<button type="button" class="btn" id="demo-seed">Load demo data</button>' : ''}
    </div>
    <div class="summary-cards">
      <div class="summary-card"><span class="summary-num">${open.length}</span><span class="summary-label">Open tasks${upcoming[0]?.due ? ` · next due ${escapeHtml(upcoming[0].due)}` : ''}</span></div>
      <div class="summary-card"><span class="summary-num">${doneToday.length}</span><span class="summary-label">Done today</span></div>
      <div class="summary-card"><span class="summary-num">${needsInput.length}</span><span class="summary-label">Need your input</span></div>
    </div>
    <form id="home-composer" class="composer">
      <textarea name="prompt" rows="2" placeholder="Ask anything. Or tell me what you want done..."></textarea>
      <button type="submit" class="btn primary">Send</button>
    </form>
    <div class="chip-row">
      ${HOME_TEMPLATES.map((t) => `<button type="button" class="suggestion-chip" data-template="${escapeHtml(t)}">${escapeHtml(t.replace(/: $/, ''))}</button>`).join('')}
    </div>
    <div id="day-feed">
      ${needsInput.length > 0 ? `
      <div class="feed-card">
        <h2>Needs your input</h2>
        <ul class="task-list">
          ${needsInput.slice(0, 5).map((t) => `
          <li class="task-row" data-task-id="${escapeHtml(t.id)}">
            <div class="task-main">
              <span class="task-title">${escapeHtml(t.title)}</span>
              ${t.notes ? `<p class="task-notes">${escapeHtml(t.notes)}</p>` : ''}
            </div>
            ${t.conversation_id ? `<a class="btn small" href="#/chat/${escapeHtml(t.conversation_id)}">Review</a>` : ''}
            <button type="button" class="btn small" data-notnow>Not now</button>
          </li>`).join('')}
        </ul>
      </div>` : ''}
      ${busy ? `
      <div class="feed-card">
        <h2>Running in background</h2>
        <p class="muted">A chat answer is being generated. <a href="#/chat">Open chat</a></p>
      </div>` : ''}
      ${upcoming.length > 0 ? `
      <div class="feed-card">
        <h2>Coming up</h2>
        <ul class="task-list">
          ${upcoming.map((t) => `
          <li class="task-row">
            <div class="task-main">
              <span class="task-title">${escapeHtml(t.title)}</span>
              <span class="task-meta">${escapeHtml(t.due || '')}</span>
            </div>
          </li>`).join('')}
        </ul>
      </div>` : ''}
      ${needsInput.length === 0 && upcoming.length === 0 && !busy ? `
      <div class="empty-state">
        <p>Nothing scheduled. Your day is clear.</p>
        <p><a class="btn primary" href="#/tasks">New task</a> <a class="btn" href="#/chat">Start chat</a></p>
      </div>` : ''}
    </div>`;

  const composer = root.querySelector('#home-composer');
  composer.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = String(new FormData(composer).get('prompt') || '').trim();
    if (!text) return;
    try {
      const convo = await data.createConversation({ title: text.slice(0, 48) || 'New chat' });
      window.Workspace?.notifyDataChanged();
      sessionStorage.setItem('pendingPrompt', text);
      window.location.hash = `#/chat/${convo.id}`;
    } catch (error) {
      toast(error?.message || 'Could not start chat.');
    }
  });
  root.querySelectorAll('[data-template]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const area = composer.querySelector('textarea');
      area.value = chip.dataset.template;
      area.focus();
    });
  });
  root.querySelector('#day-feed')?.addEventListener('click', async (e) => {
    const row = e.target.closest('[data-task-id]');
    if (!row || !e.target.matches('[data-notnow]')) return;
    try {
      await data.updateTask(row.dataset.taskId, { needs_input: false });
      window.Workspace?.notifyDataChanged();
      await renderHome(root);
    } catch (error) {
      toast(error?.message || 'Could not update task.');
    }
  });

  const demoBtn = root.querySelector('#demo-seed');
  if (demoBtn) demoBtn.addEventListener('click', async () => {
    try {
      await seedDemo();
      window.Workspace?.notifyDataChanged();
      await renderHome(root);
      toast('Demo data loaded. Clear it from Settings → demo section.');
    } catch (error) {
      toast(error?.message || 'Demo seed failed.');
    }
  });
}

export async function renderRail(rail) {
  const tasks = await data.listTasks().catch(() => []);
  const open = tasks.filter((t) => t.status === 'open');
  const today = data.selectToday(tasks);
  const upcoming = data.selectUpcoming(open, 1);
  const recent = tasks
    .filter((t) => t.status === 'done' && t.completed_at)
    .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
    .slice(0, 5);

  rail.innerHTML = `
    <div class="rail-section"><h2>Today</h2>
      ${today.length === 0 ? '<p class="side-empty">Nothing due today.</p>' : `<ul class="rail-list">${today.map((t) => `
        <li data-task-id="${escapeHtml(t.id)}"><label><input type="checkbox" data-rail-toggle> ${escapeHtml(truncate(t.title, 48))}</label></li>`).join('')}</ul>'}
    </div>
    <div class="rail-section"><h2>Next up</h2>
      ${upcoming.length === 0 ? '<p class="side-empty">Nothing scheduled.</p>' : `<p>${escapeHtml(upcoming[0].title)}<br><span class="muted">${escapeHtml(upcoming[0].due || '')}</span></p>`}
    </div>
    <div class="rail-section"><h2>Recently completed</h2>
      ${recent.length === 0 ? '<p class="side-empty">Nothing completed yet.</p>' : `<ul class="rail-list">${recent.map((t) => `<li>${escapeHtml(truncate(t.title, 48))}</li>`).join('')}</ul>`}
    </div>`;

  rail.querySelectorAll('[data-rail-toggle]').forEach((box) => {
    box.addEventListener('change', async () => {
      const id = box.closest('[data-task-id]').dataset.taskId;
      try {
        await data.toggleTask(id, box.checked);
        window.Workspace?.notifyDataChanged();
        await renderRail(rail);
      } catch (error) {
        toast(error?.message || 'Task update failed.');
      }
    });
  });
}

export function isDemoRequest() {
  return new URLSearchParams(window.location.search).get('demo') === '1';
}

export async function seedDemo() {
  const p1 = await data.createProject({ name: 'Demo: Website relaunch', color: '#8957e5' });
  const p2 = await data.createProject({ name: 'Demo: Japan trip', color: '#2b9db3' });
  await data.createTask({ title: 'Demo: Review homepage copy', projectId: p1.id, due: new Date().toISOString().slice(0, 10), needsInput: true, notes: 'Two options compared, recommendation ready.' });
  await data.createTask({ title: 'Demo: Confirm hotel dates', projectId: p2.id, due: new Date(Date.now() + 86400000).toISOString().slice(0, 10) });
  await data.createTask({ title: 'Demo: Dentist appointment', due: new Date().toISOString().slice(0, 10) });
  await data.createTask({ title: 'Demo: Old done task', projectId: p1.id });
  const tasks = await data.listTasks();
  const doneOne = tasks.find((t) => t.title === 'Demo: Old done task');
  if (doneOne) await data.toggleTask(doneOne.id, true);
  await data.createConversation({ title: 'Demo: Q4 messaging', projectId: p1.id });
}

export async function clearDemo() {
  const [projects, tasks, conversations] = await Promise.all([
    data.listProjects({ includeArchived: true }),
    data.listTasks(),
    data.listConversations(200)
  ]);
  for (const t of tasks.filter((t) => t.title.startsWith('Demo:'))) await data.deleteTask(t.id);
  for (const c of conversations.filter((c) => (c.title || '').startsWith('Demo:'))) await data.deleteConversation(c.id);
  for (const p of projects.filter((p) => p.name.startsWith('Demo:'))) await data.deleteProject(p.id);
}
