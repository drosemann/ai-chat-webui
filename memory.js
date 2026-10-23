// Memory view: user-authored notes the assistant should keep in mind.
// Memories are plain text the user writes; nothing is extracted automatically.
import * as data from './data.js';
import { escapeHtml, toast } from './utils.js';

export async function renderMemory(root) {
  const memories = await data.listMemories();

  root.innerHTML = `
    <div class="view-head"><h1>Memory</h1></div>
    <p class="muted" style="margin-bottom:1rem">Notes you write here can be included in chat context. Nothing is added automatically.</p>
    <form id="memory-form" class="card-form">
      <label>New memory<textarea name="text" rows="3" maxlength="4000" required></textarea></label>
      <label class="check"><input name="includeInChat" type="checkbox" checked> Include in chat context</label>
      <button type="submit" class="btn primary">Save memory</button>
    </form>
    <ul class="task-list">
      ${memories.length === 0 ? '<li class="empty-state">No memories yet.</li>' : memories.map((m) => `
      <li class="task-row" data-memory-id="${escapeHtml(m.id)}">
        <div class="task-main">
          <p class="task-notes" style="color:var(--light)">${escapeHtml(m.text)}</p>
          <span class="task-meta">${m.include_in_chat ? 'included in chat' : 'excluded from chat'}${m.pinned ? ' · pinned' : ''}</span>
        </div>
        <button type="button" class="btn small" data-memory-toggle>${m.include_in_chat ? 'Exclude' : 'Include'}</button>
        <button type="button" class="btn small danger" data-memory-delete>Delete</button>
      </li>`).join('')}
    </ul>`;

  root.querySelector('#memory-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
      await data.createMemory({
        text: String(form.get('text') || '').trim(),
        includeInChat: form.get('includeInChat') === 'on'
      });
      await renderMemory(root);
    } catch (error) {
      toast(error?.message || 'Could not save memory.');
    }
  });

  root.querySelector('.task-list').addEventListener('click', async (e) => {
    const row = e.target.closest('[data-memory-id]');
    if (!row) return;
    const id = row.dataset.memoryId;
    try {
      if (e.target.matches('[data-memory-delete]')) {
        if (!window.confirm('Delete this memory?')) return;
        await data.deleteMemory(id);
      } else if (e.target.matches('[data-memory-toggle]')) {
        const current = memories.find((m) => m.id === id);
        await data.updateMemory(id, { include_in_chat: !current?.include_in_chat });
      } else {
        return;
      }
      await renderMemory(root);
    } catch (error) {
      toast(error?.message || 'Memory update failed.');
    }
  });
}
