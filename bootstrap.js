import './auth.js';
import { initWorkspace } from './workspace.js';
import * as data from './data.js';
import { escapeHtml, truncate, toast } from './utils.js';

// Phase 3: the chat is a view inside the workspace shell. Conversations and
// messages persist in Supabase via data.js; the shell (workspace.js) owns
// routing and calls window.ChatView.mountChat on the chat route.

const HISTORY_LIMIT = 20;

let activeConversationId = null;
let mountedKey = null;
let isProcessing = false;
let suppressNextMount = false;

function getEls() {
    return {
        chatContainer: document.querySelector('.chat-container'),
        chatMessages: document.querySelector('.chat-messages'),
        chatInput: document.querySelector('.chat-input'),
        welcomeScreen: document.querySelector('.welcome-screen'),
        featureGrid: document.querySelector('.feature-grid')
    };
}

function ensureToolbar() {
    const { chatContainer } = getEls();
    if (!chatContainer || chatContainer.querySelector('.chat-toolbar')) return;
    const toolbar = document.createElement('div');
    toolbar.className = 'chat-toolbar';
    toolbar.innerHTML = `
        <button type="button" class="btn" data-chat-action="new">New chat</button>
        <span class="spacer"></span>
        <button type="button" class="btn" data-chat-action="pin">Pin</button>
        <button type="button" class="btn" data-chat-action="rename">Rename</button>
        <button type="button" class="btn" data-chat-action="delete">Delete</button>`;
    toolbar.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-chat-action]');
        if (!btn) return;
        handleToolbarAction(btn.dataset.chatAction).catch((error) => toast(error?.message || 'Action failed.'));
    });
    chatContainer.prepend(toolbar);
}

async function handleToolbarAction(action) {
    if (action === 'new') {
        activeConversationId = null;
        mountedKey = null;
        window.location.hash = '#/chat';
        await mountChat(document.getElementById('view-chat'), { conversationId: null });
        return;
    }
    if (!activeConversationId) {
        toast('Start chatting first — the conversation will be saved on send.');
        return;
    }
    if (action === 'pin') {
        const convo = await data.getConversation(activeConversationId);
        await data.setConversationPinned(activeConversationId, !convo?.pinned);
        window.Workspace?.notifyDataChanged();
        toast(convo?.pinned ? 'Unpinned.' : 'Pinned to the sidebar.');
    } else if (action === 'rename') {
        const current = await data.getConversation(activeConversationId);
        const title = window.prompt('Rename conversation:', current?.title || '');
        if (title && title.trim()) {
            await data.renameConversation(activeConversationId, title.trim().slice(0, 200));
            window.Workspace?.notifyDataChanged();
        }
    } else if (action === 'delete') {
        if (window.confirm('Delete this conversation and its messages?')) {
            await data.deleteConversation(activeConversationId);
            activeConversationId = null;
            mountedKey = null;
            window.Workspace?.notifyDataChanged();
            window.location.hash = '#/chat';
        }
    }
}

function formatContent(content) {
    if (typeof content !== 'string') return '';

    // First handle ### headers
    content = content.replace(/### (.*$)/gm, '<h3 class="content-header">$1</h3>');

    // Then handle code blocks with or without language specification
    content = content.replace(/"""\s*([\s\S]*?)"""/g, (match, code) => {
        return `\`\`\`\n${code.trim()}\n\`\`\``;
    });

    // Now handle triple backtick code blocks
    const parts = content.split(/```(\w+)?\n([\s\S]*?)```/g);
    let formattedContent = '';

    for (let i = 0; i < parts.length; i++) {
        if (i % 3 === 0) {
            // Regular text part
            formattedContent += escapeHtml(parts[i])
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/^\d+\.\s+(.*)$/gm, '<li>$1</li>')
                .replace(/(<li>.*<\/li>\n?)+/g, '<ol>$&</ol>');
        } else if (i % 3 === 1) {
            // Language identifier (if any)
            const language = (parts[i] || 'text').replace(/[^a-zA-Z0-9_-]/g, '');
            const code = escapeHtml(parts[i + 1]);
            const id = 'code-' + Math.random().toString(36).substr(2, 9);

            formattedContent += `
                <div class="code-block">
                    <div class="code-header">
                        <span>${language}</span>
                        <button class="copy-button" data-code-id="${id}">
                            <svg viewBox="0 0 24 24" class="copy-icon">
                                <path d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM8 21H19V7H8V21Z"/>
                            </svg>
                            Copy
                        </button>
                    </div>
                    <pre><code id="${id}" class="language-${language || 'text'}">${code.trim()}</code></pre>
                </div>`;
            i++; // Skip the next part as we've already processed it
        }
    }

    return formattedContent;
}

function bindCopyButtons(scope) {
    scope.querySelectorAll('.copy-button').forEach(button => {
        if (button.dataset.bound) return;
        button.dataset.bound = 'true';
        button.addEventListener('click', () => {
            const codeId = button.getAttribute('data-code-id');
            const codeElement = document.getElementById(codeId);
            const code = codeElement.textContent;

            navigator.clipboard.writeText(code).then(() => {
                button.innerHTML = `
                    <svg viewBox="0 0 24 24" class="copy-icon">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                    Copied!
                `;
                setTimeout(() => {
                    button.innerHTML = `
                        <svg viewBox="0 0 24 24" class="copy-icon">
                            <path d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM8 21H19V7H8V21Z"/>
                        </svg>
                        Copy
                    `;
                }, 2000);
            });
        });
    });
}

function renderMessage(content, isUser = false, time = null) {
    const { chatMessages } = getEls();
    const message = document.createElement('div');
    message.className = `message ${isUser ? 'user-message' : ''}`;
    message.innerHTML = `
        <div class="avatar ${isUser ? 'user-avatar' : ''}">
            <svg viewBox="0 0 24 24">
                <path d="${isUser ? 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z' : 'M20 12a8 8 0 0 0-8-8A8 8 0 0 0 4 12a8 8 0 0 0 8 8 8 8 0 0 0 8-8m2 0A10 10 0 0 1 12 22 10 10 0 0 1 2 12 10 10 0 0 1 12 2a10 10 0 0 1 10 10'}"/>
            </svg>
        </div>
        <div class="message-content">
            <div class="message-header">
                <span class="message-sender">${isUser ? 'You' : 'AI'}</span>
                <span class="message-time">${escapeHtml(time || new Date().toLocaleTimeString())}</span>
            </div>
            <div class="message-text">${formatContent(content)}</div>
        </div>
    `;
    bindCopyButtons(message);
    chatMessages.appendChild(message);
    message.scrollIntoView({ behavior: 'smooth' });
    return message;
}

function setWelcomeVisible(visible) {
    const { welcomeScreen, featureGrid } = getEls();
    if (welcomeScreen) welcomeScreen.hidden = !visible;
    if (featureGrid) featureGrid.hidden = !visible;
}

function clearMessages() {
    const { chatMessages } = getEls();
    if (chatMessages) chatMessages.innerHTML = '';
}

async function mountChat(_root, { conversationId }) {
    if (suppressNextMount) {
        suppressNextMount = false;
        return;
    }
    const key = conversationId || 'new';
    if (mountedKey === key) return;
    mountedKey = key;
    activeConversationId = conversationId || null;

    ensureToolbar();
    clearMessages();
    const { chatInput } = getEls();
    if (chatInput) {
        chatInput.value = '';
        chatInput.style.height = 'auto';
    }

    if (!conversationId) {
        setWelcomeVisible(true);
        const pending = sessionStorage.getItem('pendingPrompt');
        if (pending) {
            sessionStorage.removeItem('pendingPrompt');
            const { chatInput } = getEls();
            if (chatInput) {
                chatInput.value = pending;
                sendMessage();
            }
        }
        return;
    }
    try {
        const messages = await data.listMessages(conversationId);
        setWelcomeVisible(messages.length === 0);
        for (const m of messages) {
            renderMessage(m.content, m.role === 'user', m.created_at ? new Date(m.created_at).toLocaleTimeString() : null);
        }
        const pending = sessionStorage.getItem('pendingPrompt');
        if (pending && messages.length === 0) {
            sessionStorage.removeItem('pendingPrompt');
            const { chatInput } = getEls();
            if (chatInput) {
                chatInput.value = pending;
                sendMessage();
            }
        }
    } catch (error) {
        console.error('Failed to load conversation:', error);
        toast('Could not load this conversation.');
        setWelcomeVisible(true);
    }
}

async function buildHistory(conversationId) {
    const messages = await data.listMessages(conversationId, HISTORY_LIMIT);
    // History is passed through as stored — the user's model choice decides
    // what to do with it. No truncation policy beyond the fetch window.
    return messages.map((m) => ({ role: m.role, content: m.content }));
}

async function sendMessage() {
    const { chatInput } = getEls();
    const message = chatInput.value.trim();
    if (!message || isProcessing) return;

    const spamCheck = checkSpam(message);
    if (spamCheck.isSpam) {
        renderMessage(`⚠️ Message blocked: Contains inappropriate or unsafe content.\n\nType: ${spamCheck.reason}\n\nPlease ensure your message follows our content guidelines:\n• No personal information\n• No inappropriate language\n• No spam or advertising\n• No malicious content\n• No links or contact information`, false);
        chatInput.value = '';
        chatInput.style.height = 'auto';
        return;
    }

    isProcessing = true;
    try {
        if (!activeConversationId) {
            const convo = await data.createConversation({ title: truncate(message, 48) || 'New chat' });
            activeConversationId = convo.id;
            mountedKey = convo.id;
            suppressNextMount = true;
            window.location.hash = `#/chat/${convo.id}`;
            window.Workspace?.notifyDataChanged();
        }

        setWelcomeVisible(false);
        renderMessage(message, true);
        await data.appendMessage({ conversationId: activeConversationId, role: 'user', content: message });
        chatInput.value = '';
        chatInput.style.height = 'auto';

        const thinkingMessage = renderMessage('🤔 Thinking...', false);

        const headers = { 'Content-Type': 'application/json' };
        const accessToken = window.AppAuth?.getAccessToken?.();
        if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

        const settings = await data.getSettings().catch(() => null);
        const history = await buildHistory(activeConversationId);

        const response = await fetch('/api/generate', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: settings?.default_model || undefined,
                messages: history
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API request failed with status ${response.status}: ${errorText}`);
        }

        const responseData = await response.json();
        if (responseData.error) throw new Error(responseData.error);

        thinkingMessage.querySelector('.message-text').innerHTML = formatContent(responseData.response || '');
        await data.appendMessage({
            conversationId: activeConversationId,
            role: 'assistant',
            content: responseData.response || '',
            model: responseData.model || settings?.default_model || null
        });
        window.Workspace?.notifyDataChanged();
        thinkingMessage.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        console.error('Error in sendMessage:', error);
        if (error.message.includes('Failed to fetch')) {
            renderMessage('⚠️ Error: Could not connect to server. Please check if the server is running.', false);
        } else if (error.message.includes('401')) {
            renderMessage('⚠️ Error: Your session expired. Please sign out and sign in again.', false);
        } else {
            renderMessage(`⚠️ Error: ${error.message}`, false);
        }
    } finally {
        isProcessing = false;
    }
}

function initComposer() {
    const { chatInput } = getEls();
    if (!chatInput || chatInput.dataset.bound) return;
    chatInput.dataset.bound = 'true';

    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = chatInput.scrollHeight + 'px';
    });
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    const inputBox = chatInput.closest('.input-box');
    if (inputBox && !inputBox.querySelector('#send-btn')) {
        const sendBtn = document.createElement('button');
        sendBtn.id = 'send-btn';
        sendBtn.type = 'button';
        sendBtn.className = 'send-btn input-actions';
        sendBtn.setAttribute('aria-label', 'Send message');
        sendBtn.textContent = '↑';
        sendBtn.addEventListener('click', sendMessage);
        inputBox.appendChild(sendBtn);
    }

    const suggestionsContainer = document.querySelector('.suggestion-chips');
    if (suggestionsContainer && !suggestionsContainer.dataset.bound) {
        suggestionsContainer.dataset.bound = 'true';
        const selectedPrompts = suggestionPrompts
            .sort(() => 0.5 - Math.random())
            .slice(0, 3);
        selectedPrompts.forEach(prompt => {
            const chip = document.createElement('div');
            chip.className = 'suggestion-chip';
            chip.textContent = prompt;
            chip.addEventListener('click', () => {
                chatInput.value = prompt;
                chatInput.focus();
                chatInput.style.height = 'auto';
                chatInput.style.height = chatInput.scrollHeight + 'px';
            });
            suggestionsContainer.appendChild(chip);
        });
    }
}

function initTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle || themeToggle.dataset.bound) return;
    themeToggle.dataset.bound = 'true';
    const modeText = themeToggle.querySelector('.mode-text');
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    if (modeText) modeText.textContent = savedTheme === 'dark' ? 'Light Mode' : 'Dark Mode';

    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        if (modeText) modeText.textContent = newTheme === 'dark' ? 'Light Mode' : 'Dark Mode';
    });
}

// Spam filter patterns (unchanged behavior)
const SPAM_PATTERNS = {
    profanity: /\b(fuck|shit|bitch|asshole|bastard|damn|crap|wanker|douche|slut|whore)\b/i,
    adultContent: /\b(anal|blowjob|deepthroat|nude|porn|xxx|sex|cumshot|dildo|orgasm|escort|fetish|milf|nsfw|boobs|tits|pussy|dick|cock|vagina|penis)\b/i,
    spamPhrases: /\b(free money|earn cash|work from home|win big|special offer|limited time|click here|subscribe now|discount)\b/i,
    phishing: /\b(verify your account|password reset|bank account blocked|urgent action required|claim your prize|congratulations, you won|investment opportunity|crypto giveaway)\b/i,
    cryptoScams: /\b(bitcoin investment|crypto trading|double your money|forex signals|easy profit|no risk)\b/i,
    drugs: /\b(cocaine|heroin|meth|lsd|mdma|ecstasy|weed|cannabis|marijuana|shrooms|buy drugs online)\b/i,
    phoneNumbers: /\b\d{3,4}[-.\s]?\d{3}[-.\s]?\d{4}\b/,
    emails: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    urls: /\bhttps?:\/\/[^\s]+\b/i,
    unicodeTricks: /[\p{So}\p{Cn}]{2,}/u
};

function checkSpam(message) {
    const lowerMessage = message.toLowerCase();
    for (const [type, pattern] of Object.entries(SPAM_PATTERNS)) {
        if (pattern.test(lowerMessage)) {
            return { isSpam: true, reason: type, pattern: pattern.toString() };
        }
    }
    return { isSpam: false };
}

function resetChat() {
    activeConversationId = null;
    mountedKey = null;
    isProcessing = false;
    clearMessages();
    setWelcomeVisible(true);
    const { chatInput } = getEls();
    if (chatInput) {
        chatInput.value = '';
        chatInput.style.height = 'auto';
    }
}

window.ChatView = { mountChat, reset: resetChat, isBusy: () => isProcessing };
initTheme();
initComposer();
initWorkspace();
console.log('Chat interface initialized');
