// Single data-access layer for the workspace. Views never query Supabase
// directly; they go through these functions so RLS, ordering, and limits
// stay consistent in one place.
import { getSupabaseClient } from './supabaseClient.js';

async function client() {
  return getSupabaseClient();
}

async function currentUserId(supabase) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Not signed in.');
  return data.user.id;
}

function raise(error) {
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Profiles & settings
// ---------------------------------------------------------------------------

export async function getProfile() {
  const supabase = await client();
  const userId = await currentUserId(supabase);
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('id', userId)
    .maybeSingle();
  raise(error);
  return data;
}

export async function updateDisplayName(displayName) {
  const supabase = await client();
  const userId = await currentUserId(supabase);
  const { data, error } = await supabase
    .from('profiles')
    .update({ display_name: displayName })
    .eq('id', userId)
    .select('id, display_name')
    .single();
  raise(error);
  return data;
}

export async function getSettings() {
  const supabase = await client();
  const userId = await currentUserId(supabase);
  const { data, error } = await supabase
    .from('user_settings')
    .select('user_id, default_model, theme, prefs')
    .eq('user_id', userId)
    .maybeSingle();
  raise(error);
  return data || { user_id: userId, default_model: null, theme: 'light', prefs: {} };
}

export async function updateSettings(patch) {
  const supabase = await client();
  const userId = await currentUserId(supabase);
  const { data, error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' })
    .select()
    .single();
  raise(error);
  return data;
}

// ---------------------------------------------------------------------------
// Conversations & messages
// ---------------------------------------------------------------------------

export async function listConversations(limit = 100) {
  const supabase = await client();
  const { data, error } = await supabase
    .from('conversations')
    .select('id, title, project_id, pinned, updated_at')
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(limit);
  raise(error);
  return data;
}

export async function getConversation(id) {
  const supabase = await client();
  const { data, error } = await supabase
    .from('conversations')
    .select('id, title, project_id, pinned, updated_at')
    .eq('id', id)
    .maybeSingle();
  raise(error);
  return data;
}

export async function createConversation({ title, projectId = null }) {
  const supabase = await client();
  const userId = await currentUserId(supabase);
  const { data, error } = await supabase
    .from('conversations')
    .insert({ user_id: userId, title, project_id: projectId })
    .select('id, title, project_id, pinned, updated_at')
    .single();
  raise(error);
  return data;
}

export async function renameConversation(id, title) {
  const supabase = await client();
  const { data, error } = await supabase
    .from('conversations')
    .update({ title })
    .eq('id', id)
    .select('id, title')
    .single();
  raise(error);
  return data;
}

export async function setConversationPinned(id, pinned) {
  const supabase = await client();
  const { error } = await supabase
    .from('conversations')
    .update({ pinned })
    .eq('id', id);
  raise(error);
}

export async function deleteConversation(id) {
  const supabase = await client();
  const { error } = await supabase.from('conversations').delete().eq('id', id);
  raise(error);
}

export async function listMessages(conversationId, limit = 200) {
  const supabase = await client();
  const { data, error } = await supabase
    .from('messages')
    .select('id, role, content, model, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit);
  raise(error);
  return data;
}

export async function appendMessage({ conversationId, role, content, model = null }) {
  const supabase = await client();
  const userId = await currentUserId(supabase);
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, user_id: userId, role, content, model })
    .select('id, role, content, model, created_at')
    .single();
  raise(error);
  await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
  return data;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function listProjects({ includeArchived = false } = {}) {
  const supabase = await client();
  let query = supabase.from('projects').select('id, name, color, archived, updated_at').order('updated_at', { ascending: false });
  if (!includeArchived) query = query.eq('archived', false);
  const { data, error } = await query;
  raise(error);
  return data;
}

export async function createProject({ name, color }) {
  const supabase = await client();
  const userId = await currentUserId(supabase);
  const { data, error } = await supabase
    .from('projects')
    .insert({ user_id: userId, name, color })
    .select()
    .single();
  raise(error);
  return data;
}

export async function updateProject(id, patch) {
  const supabase = await client();
  const { data, error } = await supabase
    .from('projects')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  raise(error);
  return data;
}

export async function deleteProject(id) {
  // Conversations/tasks referencing the project are orphaned (FK set null),
  // never cascade-deleted.
  const supabase = await client();
  const { error } = await supabase.from('projects').delete().eq('id', id);
  raise(error);
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function listTasks({ status = null, projectId = null } = {}) {
  const supabase = await client();
  let query = supabase
    .from('tasks')
    .select('id, title, notes, due, status, needs_input, project_id, conversation_id, created_at, completed_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (status) query = query.eq('status', status);
  if (projectId) query = query.eq('project_id', projectId);
  const { data, error } = await query;
  raise(error);
  return data;
}

export async function createTask({ title, notes = '', due = null, projectId = null, conversationId = null, needsInput = false }) {
  const supabase = await client();
  const userId = await currentUserId(supabase);
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      user_id: userId, title, notes, due, project_id: projectId,
      conversation_id: conversationId, needs_input: needsInput
    })
    .select()
    .single();
  raise(error);
  return data;
}

export async function updateTask(id, patch) {
  const supabase = await client();
  const { data, error } = await supabase
    .from('tasks')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  raise(error);
  return data;
}

export async function toggleTask(id, done) {
  return updateTask(id, {
    status: done ? 'done' : 'open',
    completed_at: done ? new Date().toISOString() : null
  });
}

export async function deleteTask(id) {
  const supabase = await client();
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  raise(error);
}

export function selectToday(tasks) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return tasks.filter((t) => t.status === 'open' && t.due && new Date(t.due) < new Date(start.getTime() + 86400000));
}

export function selectNeedsInput(tasks) {
  return tasks.filter((t) => t.status === 'open' && t.needs_input);
}

export function selectUpcoming(tasks, count = 3) {
  return tasks
    .filter((t) => t.status === 'open' && t.due)
    .sort((a, b) => new Date(a.due) - new Date(b.due))
    .slice(0, count);
}

// ---------------------------------------------------------------------------
// Memories
// ---------------------------------------------------------------------------

export async function listMemories() {
  const supabase = await client();
  const { data, error } = await supabase
    .from('memories')
    .select('id, text, include_in_chat, pinned, created_at')
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200);
  raise(error);
  return data;
}

export async function createMemory({ text, includeInChat = true }) {
  const supabase = await client();
  const userId = await currentUserId(supabase);
  const { data, error } = await supabase
    .from('memories')
    .insert({ user_id: userId, text, include_in_chat: includeInChat })
    .select()
    .single();
  raise(error);
  return data;
}

export async function updateMemory(id, patch) {
  const supabase = await client();
  const { data, error } = await supabase
    .from('memories')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  raise(error);
  return data;
}

export async function deleteMemory(id) {
  const supabase = await client();
  const { error } = await supabase.from('memories').delete().eq('id', id);
  raise(error);
}
