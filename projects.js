// Projects view: cards overview plus per-project detail (tasks,
// conversations, archive, delete). Deleting a project orphans its tasks and
// conversations via ON DELETE SET NULL — never cascade-deletes user content.
import * as data from './data.js';
import { escapeHtml, truncate, toast } from './utils.js';

function colorDot(color) {
  return `<span class="color-dot" style="background:${escapeHtml(color || '#8957e5')}"></span>`;
}

export async function renderProjects(root, projectId) {
  if (projectId) {
    await renderProjectDetail(root, projectId);
    return;
  }

  const [projects, tasks, conversations] = await Promise.all([
    data.listProjects({ includeArchived: true }),
    data.listTasks(),
    data.listConversations(200)
  ]);

  const openCount = (id) => tasks.filter((t) => t.project_id === id && t.status === 'open').length;
  const chatCount = (id) => conversations.filter((c) => c.project_id === id).length;

  root.innerHTML = `
    <div class="view-head">
      <h1>Projects</h1>
    </div>
    <form id="project-form" class="card-form inline-form">
      <label>Name<input name="name" maxlength="120" required></label>
      <label>Color<input name="color" type="color" value="#8957e5"></label>
      <button type="submit" class="btn primary">New project</button>
    </form>
    <div class="card-grid">
      ${projects.length === 0 ? '<div class="empty-state">No projects yet. Create one above.</div>' : projects.map((p) => `
        <a class="project-card${p.archived ? ' is-archived' : ''}" href="#/projects/${escapeHtml(p.id)}">
          ${colorDot(p.color)}
          <span class="project-name">${escapeHtml(p.name)}</span>
          <span class="project-meta">${openCount(p.id)} open · ${chatCount(p.id)} chats${p.archived ? ' · archived' : ''}</span>
        </a>`).join('')}
    </div>`;

  root.querySelector('#project-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
      await data.createProject({
        name: String(form.get('name') || '').trim(),
        color: String(form.get('color') || '#8957e5')
      });
      window.Workspace?.notifyDataChanged();
      await renderProjects(root, null);
    } catch (error) {
      toast(error?.message || 'Could not create project.');
    }
  });
}

async function renderProjectDetail(root, projectId) {
  const [projects, tasks, conversations] = await Promise.all([
    data.listProjects({ includeArchived: true }),
    data.listTasks({ projectId }),
    data.listConversations(200)
  ]);
  const project = projects.find((p) => p.id === projectId);
  if (!project) {
    root.innerHTML = '<div class="empty-state"><p>Project not found.</p><p><a href="#/projects">Back to projects</a></p></div>';
    return;
  }
  const projectChats = conversations.filter((c) => c.project_id === projectId);
  const open = tasks.filter((t) => t.status === 'open');
  const done = tasks.filter((t) => t.status === 'done');

  root.innerHTML = `
    <div class="view-head">
      <h1>${colorDot(project.color)} ${escapeHtml(project.name)}</h1>
      <div class="view-actions">
        <a class="btn" href="#/chat">New chat here</a>
        <button type="button" class="btn" id="proj-archive">${project.archived ? 'Unarchive' : 'Archive'}</button>
        <button type="button" class="btn danger" id="proj-delete">Delete</button>
      </div>
    </div>
    <p class="muted"><a href="#/projects">← All projects</a> · ${open.length} open tasks · ${projectChats.length} chats${project.archived ? ' · archived' : ''}</p>
    <h2 class="section-title">Open tasks</h2>
    <ul class="task-list">
      ${open.length === 0 ? '<li class="empty-state">No open tasks in this project.</li>' : open.map((t) => `
        <li class="task-row" data-task-id="${escapeHtml(t.id)}">
          <input type="checkbox" data-task-toggle aria-label="Mark ${escapeHtml(t.title)} done">
          <div class="task-main">
            <span class="task-title">${escapeHtml(t.title)}</span>
            <span class="task-meta">${t.due ? escapeHtml(t.due) : 'no due date'}${t.needs_input ? ' · needs input' : ''}</span>
          </div>
        </li>`).join('')}
    </ul>
    <h2 class="section-title">Chats</h2>
    <ul class="task-list">
      ${projectChats.length === 0 ? '<li class="empty-state">No chats in this project yet.</li>' : projectChats.map((c) => `
        <li class="task-row"><div class="task-main">
          <a class="task-title" href="#/chat/${escapeHtml(c.id)}">${escapeHtml(truncate(c.title, 60))}</a>
        </div></li>`).join('')}
    </ul>
    ${done.length > 0 ? `<h2 class="section-title">Done (${done.length})</h2>
    <ul class="task-list">${done.map((t) => `
        <li class="task-row is-done"><div class="task-main"><span class="task-title">${escapeHtml(t.title)}</span></div></li>`).join('')}</ul>` : ''}`;

  root.querySelector('#proj-archive').addEventListener('click', async () => {
    try {
      await data.updateProject(projectId, { archived: !project.archived });
      window.Workspace?.notifyDataChanged();
      await renderProjects(root, projectId);
    } catch (error) {
      toast(error?.message || 'Could not update project.');
    }
  });
  root.querySelector('#proj-delete').addEventListener('click', async () => {
    if (!window.confirm('Delete this project? Its tasks and chats are kept, without a project.')) return;
    try {
      await data.deleteProject(projectId);
      window.Workspace?.notifyDataChanged();
      window.location.hash = '#/projects';
    } catch (error) {
      toast(error?.message || 'Could not delete project.');
    }
  });
  root.querySelector('.task-list')?.addEventListener('click', async (e) => {
    const row = e.target.closest('[data-task-id]');
    if (!row || !e.target.matches('[data-task-toggle]')) return;
    try {
      await data.toggleTask(row.dataset.taskId, e.target.checked);
      window.Workspace?.notifyDataChanged();
      await renderProjects(root, projectId);
    } catch (error) {
      toast(error?.message || 'Task update failed.');
    }
  });
}
