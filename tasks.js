// Tasks view: filterable list plus create/edit form. All user content is
// escaped at render time; Mutations go through data.js.
import * as data from './data.js';
import { escapeHtml, toast } from './utils.js';

let currentFilter = { status: 'open', projectId: '' };

function taskRow(t, projects) {
  const project = projects.find((p) => p.id === t.project_id);
  return `
    <li class="task-row${t.status === 'done' ? ' is-done' : ''}" data-task-id="${escapeHtml(t.id)}">
      <input type="checkbox" data-task-toggle ${t.status === 'done' ? 'checked' : ''} aria-label="Mark ${escapeHtml(t.title)} ${t.status === 'done' ? 'open' : 'done'}">
      <div class="task-main">
        <span class="task-title">${escapeHtml(t.title)}</span>
        <span class="task-meta">
          ${project ? `<a href="#/projects/${escapeHtml(project.id)}">${escapeHtml(project.name)}</a> · ` : ''}
          ${t.due ? escapeHtml(t.due) : 'no due date'}${t.needs_input ? ' · needs input' : ''}
        </span>
        ${t.notes ? `<p class="task-notes">${escapeHtml(t.notes)}</p>` : ''}
      </div>
      <button type="button" class="btn small" data-task-edit>Edit</button>
      <button type="button" class="btn small danger" data-task-delete>Delete</button>
    </li>`;
}

export async function renderTasks(root) {
  const [tasks, projects] = await Promise.all([data.listTasks(), data.listProjects({ includeArchived: false })]);

  const filtered = tasks.filter((t) => {
    if (currentFilter.status !== 'all' && t.status !== currentFilter.status) return false;
    if (currentFilter.projectId && t.project_id !== currentFilter.projectId) return false;
    return true;
  });

  root.innerHTML = `
    <div class="view-head">
      <h1>Tasks</h1>
    </div>
    <form id="task-form" class="card-form">
      <h2>New task</h2>
      <label>Title<input name="title" maxlength="200" required></label>
      <label>Notes<textarea name="notes" rows="2"></textarea></label>
      <div class="form-row">
        <label>Due date<input name="due" type="date"></label>
        <label>Project
          <select name="projectId">
            <option value="">No project</option>
            ${projects.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </label>
        <label class="check"><input name="needsInput" type="checkbox"> Needs input</label>
      </div>
      <button type="submit" class="btn primary">Add task</button>
    </form>
    <div class="filter-row">
      <label>Status
        <select id="task-filter-status">
          <option value="open">Open</option>
          <option value="done">Done</option>
          <option value="all">All</option>
        </select>
      </label>
      <label>Project
        <select id="task-filter-project">
          <option value="">All projects</option>
          ${projects.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('')}
        </select>
      </label>
    </div>
    <ul class="task-list">
      ${filtered.length === 0 ? '<li class="empty-state">No tasks match this filter.</li>' : filtered.map((t) => taskRow(t, projects)).join('')}
    </ul>`;

  root.querySelector('#task-filter-status').value = currentFilter.status;
  root.querySelector('#task-filter-project').value = currentFilter.projectId;
  root.querySelector('#task-filter-status').addEventListener('change', (e) => {
    currentFilter.status = e.target.value;
    renderTasks(root).catch((err) => toast(err?.message || 'Could not load tasks.'));
  });
  root.querySelector('#task-filter-project').addEventListener('change', (e) => {
    currentFilter.projectId = e.target.value;
    renderTasks(root).catch((err) => toast(err?.message || 'Could not load tasks.'));
  });

  root.querySelector('#task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
      await data.createTask({
        title: String(form.get('title') || '').trim(),
        notes: String(form.get('notes') || ''),
        due: String(form.get('due') || '') || null,
        projectId: String(form.get('projectId') || '') || null,
        needsInput: form.get('needsInput') === 'on'
      });
      window.Workspace?.notifyDataChanged();
      await renderTasks(root);
    } catch (error) {
      toast(error?.message || 'Could not create task.');
    }
  });

  root.querySelector('.task-list').addEventListener('click', async (e) => {
    const row = e.target.closest('[data-task-id]');
    if (!row) return;
    const id = row.dataset.taskId;
    try {
      if (e.target.matches('[data-task-toggle]')) {
        await data.toggleTask(id, e.target.checked);
      } else if (e.target.matches('[data-task-delete]')) {
        if (!window.confirm('Delete this task?')) return;
        await data.deleteTask(id);
      } else if (e.target.matches('[data-task-edit]')) {
        const current = tasks.find((t) => t.id === id);
        const title = window.prompt('Task title:', current?.title || '');
        if (title === null) return;
        const notes = window.prompt('Notes:', current?.notes || '');
        await data.updateTask(id, { title: title.trim().slice(0, 200) || current.title, notes: notes ?? '' });
      } else {
        return;
      }
      window.Workspace?.notifyDataChanged();
      await renderTasks(root);
    } catch (error) {
      toast(error?.message || 'Task update failed.');
    }
  }, { once: true });
}
