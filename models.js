// Models view: Ollama models actually installed on the operator's server,
// plus the user's default-model preference. Unreachable Ollama is an
// explicit error state, not a spinner.
import * as data from './data.js';
import { escapeHtml, toast } from './utils.js';

async function fetchModels() {
  const token = window.AppAuth?.getAccessToken?.();
  const response = await fetch('/api/models', {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Models request failed: ${response.status}`);
  return body;
}

export async function renderModels(root) {
  let payload = null;
  let loadError = '';
  try {
    payload = await fetchModels();
  } catch (error) {
    loadError = error?.message || 'Could not load models.';
  }
  const settings = await data.getSettings().catch(() => null);
  const models = payload?.models || [];

  root.innerHTML = `
    <div class="view-head"><h1>Models</h1></div>
    ${loadError ? `<div class="empty-state"><p>${escapeHtml(loadError)}</p><p class="muted">Is Ollama running at the configured URL?</p></div>` : ''}
    <div class="card-form">
      <label>Default model
        <select id="default-model">
          <option value="">Server default${payload?.defaultModel ? ` (${escapeHtml(payload.defaultModel)})` : ''}</option>
          ${models.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('')}
        </select>
      </label>
      <p class="muted">Used for new chats. You choose the model; the app never overrides your choice.</p>
    </div>
    <h2 class="section-title">Installed on this Ollama server</h2>
    <ul class="task-list">
      ${models.length === 0 && !loadError ? '<li class="empty-state">No models reported.</li>' : models.map((m) => `
      <li class="task-row"><div class="task-main"><span class="task-title">${escapeHtml(m)}</span>
      ${settings?.default_model === m ? '<span class="task-meta">default</span>' : ''}</div></li>`).join('')}
    </ul>`;

  const select = root.querySelector('#default-model');
  if (select) {
    select.value = settings?.default_model || '';
    select.addEventListener('change', async () => {
      try {
        await data.updateSettings({ default_model: select.value || null });
        window.Workspace?.notifyDataChanged();
        toast('Default model saved.');
      } catch (error) {
        toast(error?.message || 'Could not save default model.');
      }
    });
  }
}
