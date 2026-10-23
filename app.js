// Session gate for the self-hosted workspace. auth.js hides the chat until
// sign-in and exposes the access token on window.AppAuth; the chat below
// attaches it to every /api/generate request.
import('./auth.js').catch((error) => {
    console.error('Auth module failed to load:', error);
});

document.addEventListener('DOMContentLoaded', () => {
    // Theme toggle functionality
    const themeToggle = document.getElementById('theme-toggle');
    const modeText = themeToggle.querySelector('.mode-text');

    // Check for saved theme preference or default to light
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    modeText.textContent = savedTheme === 'dark' ? 'Light Mode' : 'Dark Mode';

    // Theme toggle handler
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        modeText.textContent = newTheme === 'dark' ? 'Light Mode' : 'Dark Mode';

        // Optional: Add smooth transition
        document.documentElement.style.transition = 'background-color 0.3s ease, color 0.3s ease';
        setTimeout(() => {
            document.documentElement.style.transition = '';
        }, 300);
    });

    const chatContainer = document.querySelector('.chat-container');
    const chatMessages = document.querySelector('.chat-messages');
    const chatInput = document.querySelector('.chat-input');
    const welcomeScreen = document.querySelector('.welcome-screen');

    let isProcessing = false;

    console.log('Chat interface initialized');

    // System prompt for thinking process
    const SYSTEM_PROMPT = `
    You are a helpful AI assistant. When you receive a question, first think about it and provide your thinking process in "think" tags.

    Content Guidelines:
    - No personal information or names
    - No inappropriate or adult content
    - No financial advice or cryptocurrency
    - No medical advice
    - No malicious content or hacking
    - Keep responses family-friendly
    - Focus on educational and constructive content

    Example:
    Question: What is the capital of France?
    Answer: <think>
    The capital of France is Paris. Paris is known for the Eiffel Tower and is one of the largest cities in Europe.
    </think>
    The capital of France is Paris.

    Always keep your thoughts within these <think></think> tags and your final answer outside these tags.
    `;

    // Auto-resize textarea
    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = chatInput.scrollHeight + 'px';
    });

    // Send message on Enter (without Shift)
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            console.log('Enter key pressed');
            e.preventDefault();
            sendMessage();
        }
    });


function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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

    function addMessage(content, isUser = false) {
        if (welcomeScreen) {
            welcomeScreen.remove();
        }

        const message = document.createElement('div');
        message.className = `message ${isUser ? 'user-message' : ''}`;

        const formattedContent = formatContent(content);

        message.innerHTML = `
            <div class="avatar ${isUser ? 'user-avatar' : ''}">
                <svg viewBox="0 0 24 24">
                    <path d="${isUser ? 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z' : 'M20 12a8 8 0 0 0-8-8A8 8 0 0 0 4 12a8 8 0 0 0 8 8 8 8 0 0 0 8-8m2 0A10 10 0 0 1 12 22 10 10 0 0 1 2 12 10 10 0 0 1 12 2a10 10 0 0 1 10 10'}"/>
                </svg>
            </div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-sender">${isUser ? 'You' : 'AI'}</span>
                    <span class="message-time">${new Date().toLocaleTimeString()}</span>
                </div>
                <div class="message-text">${formattedContent}</div>
            </div>
        `;

        // Add copy functionality to code blocks
        message.querySelectorAll('.copy-button').forEach(button => {
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

        chatMessages.appendChild(message);
        message.scrollIntoView({ behavior: 'smooth' });
        return message;
    }

    async function sendMessage() {
        const message = chatInput.value.trim();
        console.log('Attempting to send message:', message);

        if (!message || isProcessing) return;

        // Add spam check
        const spamCheck = checkSpam(message);
        if (spamCheck.isSpam) {
            // Add a warning message
            const warningMessage = addMessage(`⚠️ Message blocked: Contains inappropriate or unsafe content.

Type: ${spamCheck.reason}

Please ensure your message follows our content guidelines:
• No personal information
• No inappropriate language
• No spam or advertising
• No malicious content
• No links or contact information`, false);

            chatInput.value = '';
            chatInput.style.height = 'auto';
            return;
        }

        isProcessing = true;
        console.log('Processing started');

        const userMessageElement = addMessage(message, true);
        chatInput.value = '';
        chatInput.style.height = 'auto';

        const thinkingMessage = addMessage('🤔 Thinking...', false);

        try {
            console.log('Sending request to server...');

            const headers = {
                'Content-Type': 'application/json',
            };
            const accessToken = window.AppAuth?.getAccessToken?.();
            if (accessToken) {
                headers['Authorization'] = `Bearer ${accessToken}`;
            }

            const response = await fetch('/api/generate', { // Changed to use relative URL
                method: 'POST',
                headers,
                body: JSON.stringify({
                    prompt: message
                })
            });

            console.log('Response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('API Error Response:', errorText);
                throw new Error(`API request failed with status ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            console.log('API Response:', data);

            if (data.error) {
                throw new Error(data.error);
            }

            thinkingMessage.querySelector('.message-text').innerHTML = formatContent(data.response || '');
            thinkingMessage.scrollIntoView({ behavior: 'smooth' });

        } catch (error) {
            console.error('Error in sendMessage:', {
                name: error.name,
                message: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });

            let errorMessage = '⚠️ Error: ';

            if (error.message.includes('Failed to fetch')) {
                errorMessage += 'Could not connect to server. Please check if the server is running.';
            } else {
                errorMessage += `${error.message}\n\nPlease check the browser console for more details.`;
            }

            thinkingMessage.querySelector('.message-text').innerHTML = errorMessage;
        } finally {
            console.log('Processing complete');
            isProcessing = false;
        }
    }

    // Initialize suggestion chips
    const suggestionsContainer = document.querySelector('.suggestion-chips');
    if (suggestionsContainer) {
        const selectedPrompts = suggestionPrompts
            .sort(() => 0.5 - Math.random())
            .slice(0, 3);

        selectedPrompts.forEach(prompt => {
            const chip = document.createElement('div');
            chip.className = 'suggestion-chip';
            chip.textContent = prompt;
            // Changed: Only set the input value, don't send immediately
            chip.addEventListener('click', () => {
                chatInput.value = prompt;
                chatInput.focus(); // Focus the input so user can edit
                // Adjust input height to content
                chatInput.style.height = 'auto';
                chatInput.style.height = chatInput.scrollHeight + 'px';
            });
            suggestionsContainer.appendChild(chip);
        });
    }

    console.log('Chat interface ready');
});

// Spam filter patterns
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
    // Convert to lowercase for case-insensitive matching
    const lowerMessage = message.toLowerCase();

    // Check each pattern
    for (const [type, pattern] of Object.entries(SPAM_PATTERNS)) {
        if (pattern.test(lowerMessage)) {
            return {
                isSpam: true,
                reason: type,
                pattern: pattern.toString()
            };
        }
    }

    return {
        isSpam: false
    };
}
