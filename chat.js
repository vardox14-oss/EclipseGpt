/* ============================================
   ECLIPSEGPT - CHAT JAVASCRIPT (Redesigned)
   ============================================ */

const API_URL = '/api/chat';

// State
const userEmail = localStorage.getItem('eclipsegpt_user_email') || 'default';
const storageKey = `eclipsegpt_conversations_${userEmail}`;
let conversations = JSON.parse(localStorage.getItem(storageKey) || '[]');
let currentConvId = null;
let isGenerating = false;
let currentImageBase64 = null;
let abortController = null;

// DOM Elements
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const newChatBtn = document.getElementById('newChatBtn');
const conversationList = document.getElementById('conversationList');
const welcomeScreen = document.getElementById('welcomeScreen');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebarCollapseBtn = document.getElementById('sidebarCollapseBtn');
const sidebar = document.getElementById('sidebar');
const emptyHistory = document.getElementById('emptyHistory');
const clearHistoryBtn = document.getElementById('clearHistory');
const searchInput = document.getElementById('searchChats');
const modelSelect = document.getElementById('modelSelect');
const imageInput = document.getElementById('imageInput');
const attachBtn = document.getElementById('attachBtn');
const imagePreviewArea = document.getElementById('imagePreviewArea');
const stopBtn = document.getElementById('stopBtn');

// Init
document.addEventListener('DOMContentLoaded', () => {
    renderConversations();
    setupEventListeners();
    autoResizeTextarea();
    renderChat();
});

function setupEventListeners() {
    sendBtn.addEventListener('click', handleSend);
    if (stopBtn) stopBtn.addEventListener('click', stopGeneration);

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    newChatBtn.addEventListener('click', () => {
        currentConvId = null;
        renderChat();
    });

    sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
    });

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('eclipsegpt_auth_token');
            localStorage.removeItem('eclipsegpt_user_email');
            window.location.replace('index.html');
        });
    }

    if (sidebarCollapseBtn) {
        sidebarCollapseBtn.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }

    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', () => {
            if (confirm('Vider tout l\'historique ?')) {
                conversations = [];
                currentConvId = null;
                saveConversations();
                renderConversations();
                renderChat();
            }
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.toLowerCase();
            document.querySelectorAll('.conv-item').forEach(item => {
                const title = item.textContent.toLowerCase();
                item.style.display = title.includes(query) ? 'flex' : 'none';
            });
        });
    }

    // Action buttons toggle (mic, web search, chat)
    document.querySelectorAll('.input-action-btn:not(.attach-btn)').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('active');
        });
    });

    // Attach button (file upload)
    if (attachBtn && imageInput) {
        attachBtn.addEventListener('click', () => {
            imageInput.click();
        });

        imageInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    currentImageBase64 = event.target.result;
                    showImagePreview(currentImageBase64);
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Share modal
    const shareBtn = document.getElementById('shareBtn');
    const shareModal = document.getElementById('shareModal');
    const shareModalClose = document.getElementById('shareModalClose');
    const shareCopyText = document.getElementById('shareCopyText');
    const shareCopyMarkdown = document.getElementById('shareCopyMarkdown');
    const shareDownload = document.getElementById('shareDownload');
    const shareToast = document.getElementById('shareToast');

    function getConvText(mode = 'text') {
        if (!currentConvId) return null;
        const conv = getConversation(currentConvId);
        if (!conv || conv.messages.length === 0) return null;
        if (mode === 'markdown') {
            return `# ${conv.title}\n\n` + conv.messages.map(m => {
                const label = m.role === 'user' ? '**Vous**' : '**EclipseGPT**';
                return `${label}\n\n${m.content}`;
            }).join('\n\n---\n\n');
        }
        return conv.messages.map(m => {
            const label = m.role === 'user' ? 'VOUS' : 'ECLIPSEGPT';
            return `[${label}]\n${m.content}`;
        }).join('\n\n');
    }

    function showToast(msg = '✓ Copié !') {
        shareToast.textContent = msg;
        shareToast.style.display = 'block';
        setTimeout(() => { shareToast.style.display = 'none'; }, 2000);
    }

    if (shareBtn) {
        shareBtn.addEventListener('click', () => {
            if (!currentConvId) {
                alert('Commence une conversation d\'abord !');
                return;
            }
            shareModal.classList.add('open');
        });
    }

    if (shareModalClose) {
        shareModalClose.addEventListener('click', () => shareModal.classList.remove('open'));
    }

    if (shareModal) {
        shareModal.addEventListener('click', (e) => {
            if (e.target === shareModal) shareModal.classList.remove('open');
        });
    }

    if (shareCopyText) {
        shareCopyText.addEventListener('click', () => {
            const text = getConvText('text');
            if (!text) return;
            navigator.clipboard.writeText(text).then(() => showToast('✓ Texte copié !'));
        });
    }

    if (shareCopyMarkdown) {
        shareCopyMarkdown.addEventListener('click', () => {
            const text = getConvText('markdown');
            if (!text) return;
            navigator.clipboard.writeText(text).then(() => showToast('✓ Markdown copié !'));
        });
    }

    if (shareDownload) {
        shareDownload.addEventListener('click', () => {
            const text = getConvText('text');
            if (!text) return;
            const conv = getConversation(currentConvId);
            const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `eclipsegpt-${conv.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('✓ Téléchargement lancé !');
        });
    }

    // Options menu (three dots) — delete conversation
    const optionsBtn = document.getElementById('optionsBtn');
    if (optionsBtn) {
        optionsBtn.addEventListener('click', () => {
            if (currentConvId) {
                if (confirm('Supprimer cette conversation ?')) {
                    conversations = conversations.filter(c => c.id !== currentConvId);
                    currentConvId = null;
                    saveConversations();
                    renderConversations();
                    renderChat();
                }
            } else {
                alert('Aucune conversation à supprimer.');
            }
        });
    }

    // Applications, Abonnement, Paramètres
    const applicationsBtn = document.getElementById('applicationsBtn');
    if (applicationsBtn) {
        applicationsBtn.addEventListener('click', () => {
            alert('L\'écosystème d\'applications EclipseGPT sera bientôt disponible.');
        });
    }

    const abonnementBtn = document.getElementById('abonnementBtn');
    if (abonnementBtn) {
        abonnementBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = 'buy/index.html';
        });
    }

    const parametresBtn = document.getElementById('parametresBtn');
    const settingsModal = document.getElementById('settingsModal');
    const settingsModalClose = document.getElementById('settingsModalClose');
    const settingsTabs = document.querySelectorAll('.settings-tab');
    const settingsPanes = document.querySelectorAll('.settings-pane');

    if (parametresBtn && settingsModal) {
        parametresBtn.addEventListener('click', (e) => {
            e.preventDefault();
            settingsModal.classList.add('open');
        });
    }

    if (settingsModalClose) {
        settingsModalClose.addEventListener('click', () => {
            settingsModal.classList.remove('open');
        });
    }

    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                settingsModal.classList.remove('open');
            }
        });
    }

    // Tab switching logic
    settingsTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs
            settingsTabs.forEach(t => t.classList.remove('active'));
            // Remove active class from all panes
            settingsPanes.forEach(p => p.classList.remove('active'));

            // Add active class to clicked tab
            tab.classList.add('active');

            // Find corresponding pane and activate it
            const targetId = tab.dataset.tab;
            const targetPane = document.getElementById(`pane-${targetId}`);

            if (targetPane) {
                targetPane.classList.add('active');
            } else {
                // If specific pane doesn't exist yet, show the "other" placeholder pane
                const otherPane = document.getElementById('pane-other');
                if (otherPane) otherPane.classList.add('active');
            }
        });
    });

    // Specific settings functions
    const deleteAllChatsBtn = document.getElementById('settingsDeleteAllChats');
    if (deleteAllChatsBtn) {
        deleteAllChatsBtn.addEventListener('click', () => {
            // Using a custom built-in confirm replacing window.confirm
            const isConfirmed = window.confirm('Attention : Êtes-vous sûr de vouloir supprimer TOUT l\'historique de vos conversations ?');
            if (isConfirmed) {
                conversations = [];
                currentConvId = null;
                saveConversations();
                renderConversations();
                renderChat();
                showToast('Tous vos chats ont été supprimés.', true);
                settingsModal.classList.remove('open');
            }
        });
    }

    // Delete Account Params
    const deleteAccountBtn = document.getElementById('settingsDeleteAccountParams');
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', () => {
            const isConfirmed = window.confirm('Es-tu absolument certain de vouloir supprimer définitivement ton compte EclipseGPT ?');
            if (isConfirmed) {
                showToast('Requête de suppression envoyée.', true);
            }
        });
    }

    // Generic Toast Actions
    const toastActionBtns = document.querySelectorAll('.settings-action-btn[data-action="toast"]');
    toastActionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const msg = btn.dataset.message;
            if (msg) showToast(msg);
        });
    });

    // Handle Selects
    const selects = document.querySelectorAll('.settings-select');
    if (selects.length >= 2) {
        // Theme
        selects[0].addEventListener('change', (e) => {
            const val = e.target.value;
            if (val === 'Clair') {
                document.body.style.filter = 'invert(1) hue-rotate(180deg)';
                document.body.style.background = '#ebebe7'; // Inverted dark color approximation
            } else {
                document.body.style.filter = 'none';
                document.body.style.background = '';
            }
            showToast('Thème mis à jour : ' + val);
        });

        // Accent Color
        selects[1].addEventListener('change', (e) => {
            const val = e.target.value;
            if (val === 'Par défaut') {
                document.documentElement.style.setProperty('--accent-red', '#ffffff');
                showToast('Couleur d\'accentuation : Par défaut');
            } else {
                document.documentElement.style.setProperty('--accent-red', '#e53935');
                showToast('Couleur d\'accentuation : Rouge EclipseGPT');
            }
        });
    }

    // Interactive Toggles
    const toggles = document.querySelectorAll('.toggle-switch input[type="checkbox"]');
    toggles.forEach(toggle => {
        toggle.addEventListener('change', (e) => {
            const stateText = e.target.checked ? 'activé' : 'désactivé';
            showToast('Paramètre ' + stateText + '.');
        });
    });
}

// Custom Toast Notification System
function showToast(message, isError = false) {
    let globalToast = document.getElementById('globalToast');

    if (!globalToast) {
        globalToast = document.createElement('div');
        globalToast.id = 'globalToast';
        globalToast.style.position = 'fixed';
        globalToast.style.bottom = '30px';
        globalToast.style.left = '50%';
        globalToast.style.transform = 'translateX(-50%)';
        globalToast.style.padding = '10px 20px';
        globalToast.style.borderRadius = '8px';
        globalToast.style.fontSize = '0.9rem';
        globalToast.style.fontWeight = '500';
        globalToast.style.zIndex = '9999';
        globalToast.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        globalToast.style.opacity = '0';
        globalToast.style.pointerEvents = 'none';
        document.body.appendChild(globalToast);
    }

    // Set styles based on type
    if (isError) {
        globalToast.style.background = 'rgba(229, 57, 53, 0.15)';
        globalToast.style.border = '1px solid rgba(229, 57, 53, 0.4)';
        globalToast.style.color = '#ef4444';
        globalToast.style.boxShadow = '0 4px 12px rgba(229, 57, 53, 0.1)';
    } else {
        globalToast.style.background = '#1a1a20';
        globalToast.style.border = '1px solid #2a2a30';
        globalToast.style.color = '#e0e0e0';
        globalToast.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.4)';
    }

    globalToast.textContent = message;

    globalToast.style.display = 'block';
    // Trigger layout for animation
    globalToast.offsetHeight;
    globalToast.style.opacity = '1';
    globalToast.style.transform = 'translateX(-50%) translateY(0)';

    if (globalToast.hideTimeout) {
        clearTimeout(globalToast.hideTimeout);
    }

    globalToast.hideTimeout = setTimeout(() => {
        globalToast.style.opacity = '0';
        globalToast.style.transform = 'translateX(-50%) translateY(10px)';
        setTimeout(() => {
            globalToast.style.display = 'none';
        }, 200);
    }, 3000);
}

function autoResizeTextarea() {
    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + 'px';
    });
}

/* ---- Conversation Management ---- */
function createConversation(firstMessage) {
    const conv = {
        id: Date.now().toString(),
        title: firstMessage.substring(0, 35) + (firstMessage.length > 35 ? '...' : ''),
        messages: [],
        created: new Date().toISOString()
    };
    conversations.unshift(conv);
    saveConversations();
    return conv.id;
}

function saveConversations() {
    localStorage.setItem(storageKey, JSON.stringify(conversations));
}

function getConversation(id) {
    return conversations.find(c => c.id === id);
}

function renderConversations() {
    // Clear existing items but keep emptyHistory template
    const items = conversationList.querySelectorAll('.conv-item');
    items.forEach(i => i.remove());

    if (conversations.length === 0) {
        if (emptyHistory) emptyHistory.style.display = 'flex';
    } else {
        if (emptyHistory) emptyHistory.style.display = 'none';
        conversations.forEach(conv => {
            const el = document.createElement('div');
            el.className = `conv-item ${conv.id === currentConvId ? 'active' : ''}`;
            el.innerHTML = `<span>—</span> ${conv.title}`;
            el.addEventListener('click', () => {
                currentConvId = conv.id;
                renderChat();
                sidebar.classList.remove('open');
            });
            conversationList.appendChild(el);
        });
    }
}

/* ---- Chat Rendering ---- */
let typewriterTimeout = null;

function startTypewriter() {
    const titleElement = document.querySelector('.welcome-title');
    if (!titleElement) return;

    if (typewriterTimeout) clearTimeout(typewriterTimeout);

    const phrases = ["Que veux-tu savoir ?", "Je suis EclipseGPT"];
    let phraseIndex = 0;
    let charIndex = 0;
    let isDeleting = false;

    function type() {
        // Stop if user navigated away from welcome screen
        if (!document.querySelector('.welcome-title')) return;

        const currentPhrase = phrases[phraseIndex];

        if (isDeleting) {
            titleElement.textContent = currentPhrase.substring(0, charIndex - 1);
            charIndex--;
        } else {
            titleElement.textContent = currentPhrase.substring(0, charIndex + 1);
            charIndex++;
        }

        let speed = isDeleting ? 30 : 60;

        if (!isDeleting && charIndex === currentPhrase.length) {
            speed = 2000; // Pause at end of text
            isDeleting = true;
        } else if (isDeleting && charIndex === 0) {
            isDeleting = false;
            phraseIndex = (phraseIndex + 1) % phrases.length;
            speed = 500; // Pause before typing new text
        }

        typewriterTimeout = setTimeout(type, speed);
    }

    titleElement.textContent = '';
    type();
}

function renderChat() {
    if (!currentConvId) {
        chatMessages.innerHTML = '';
        const ws = document.createElement('div');
        ws.className = 'welcome-screen';
        ws.innerHTML = '<h1 class="welcome-title"></h1>';
        chatMessages.appendChild(ws);
        renderConversations();
        startTypewriter();
        return;
    }

    const conv = getConversation(currentConvId);
    if (!conv) return;

    chatMessages.innerHTML = '';
    conv.messages.forEach(msg => {
        appendMessage(msg.role, msg.content, false);
    });
    scrollToBottom();
    renderConversations();
}

function appendMessage(role, content, animate = true) {
    // Remove welcome screen
    const ws = chatMessages.querySelector('.welcome-screen');
    if (ws) ws.remove();

    const msgEl = document.createElement('div');
    msgEl.className = `message ${role}`;
    if (!animate) msgEl.style.animation = 'none';

    const avatarContent = role === 'user' ? 'U' : '<img src="logo.jpg" alt="EclipseGPT">';
    const roleText = role === 'user' ? 'Vous' : 'EclipseGPT';

    let textContent = '';
    let imageHtml = '';

    if (Array.isArray(content)) {
        content.forEach(part => {
            if (part.type === 'text') textContent += part.text;
            if (part.type === 'image_url') {
                imageHtml += `<img src="${part.image_url.url}" class="message-image" onclick="window.open(this.src)">`;
            }
        });
    } else {
        textContent = content;
    }

    msgEl.innerHTML = `
        <div class="message-avatar">${avatarContent}</div>
        <div class="message-body">
            <div class="message-role">${roleText}</div>
            <div class="message-text">
                ${imageHtml}
                ${formatMessage(textContent)}
            </div>
        </div>
    `;

    chatMessages.appendChild(msgEl);
    return msgEl;
}

function showImagePreview(base64) {
    if (!imagePreviewArea) return;
    imagePreviewArea.innerHTML = `
        <div class="preview-item">
            <img src="${base64}">
            <div class="preview-remove" onclick="clearImagePreview()">✕</div>
        </div>
    `;
    imagePreviewArea.style.display = 'flex';
}

function clearImagePreview() {
    currentImageBase64 = null;
    if (imageInput) imageInput.value = '';
    if (imagePreviewArea) {
        imagePreviewArea.innerHTML = '';
        imagePreviewArea.style.display = 'none';
    }
}

function appendTypingIndicator() {
    const ws = chatMessages.querySelector('.welcome-screen');
    if (ws) ws.remove();

    const el = document.createElement('div');
    el.className = 'message assistant';
    el.id = 'typingMessage';
    el.innerHTML = `
        <div class="message-avatar"><img src="logo.jpg" alt="EclipseGPT"></div>
        <div class="message-body">
            <div class="message-role">EclipseGPT</div>
            <div class="message-text">
                <div class="typing-indicator">
                    <span></span><span></span><span></span>
                </div>
            </div>
        </div>
    `;
    chatMessages.appendChild(el);
    scrollToBottom();
    return el;
}

function removeTypingIndicator() {
    const el = document.getElementById('typingMessage');
    if (el) el.remove();
}

function formatMessage(content) {
    if (!content) return '';
    let text = typeof content === 'string' ? content : '';

    let html = text
        .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .split('\n\n').map(p => `<p>${p}</p>`).join('');

    html = html.replace(/\n/g, '<br>');
    return html;
}

function scrollToBottom(force = false) {
    const threshold = 150; // Seuil de pixels depuis le bas
    const isAtBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < threshold;

    if (force || isAtBottom) {
        chatMessages.scrollTo({
            top: chatMessages.scrollHeight,
            behavior: force ? 'auto' : 'smooth'
        });
    }
}

/* ---- Send Message & API ---- */
async function handleSend() {
    const text = chatInput.value.trim();
    if (!text && !currentImageBase64 || isGenerating) return;

    if (!currentConvId) {
        currentConvId = createConversation(text);
    }
    let messageContent = text;
    if (currentImageBase64) {
        messageContent = [
            { type: "text", text: text },
            { type: "image_url", image_url: { url: currentImageBase64 } }
        ];
    }

    const userMsgEl = appendMessage('user', messageContent);
    const conv = getConversation(currentConvId);
    conv.messages.push({ role: 'user', content: messageContent });
    saveConversations();

    chatInput.value = '';
    autoResizeTextarea();
    clearImagePreview();

    scrollToBottom(true);

    isGenerating = true;
    sendBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'flex';

    appendTypingIndicator();

    // Abort Controller Setup
    abortController = new AbortController();
    const signal = abortController.signal;

    let assistantText = '';

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
            body: JSON.stringify({
                messages: conv.messages,
                mode: modelSelect.value
            })
        });

        if (!response.ok) {
            throw new Error(`Erreur serveur: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        removeTypingIndicator();
        const assistantMsg = appendMessage('assistant', '');
        const textEl = assistantMsg.querySelector('.message-text');

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });

            // On traite chaque ligne du chunk
            const lines = chunk.split('\n');
            for (let line of lines) {
                line = line.trim();
                if (!line) continue;

                // Support du format standard SSE "data: ..."
                let rawData = line;
                if (line.startsWith('data: ')) {
                    rawData = line.slice(6);
                }

                if (rawData === '[DONE]') continue;

                try {
                    const parsed = JSON.parse(rawData);
                    // On cherche le contenu dans différents endroits possibles selon le modèle
                    const content =
                        parsed.choices?.[0]?.delta?.content ||
                        parsed.choices?.[0]?.delta?.reasoning_content ||
                        parsed.choices?.[0]?.text ||
                        parsed.content ||
                        '';

                    if (content) {
                        assistantText += content;
                        textEl.innerHTML = formatMessage(assistantText);
                        scrollToBottom(false);
                    }
                } catch (e) {
                    // Si on n'arrive pas à parser du JSON, on essaie de voir si la ligne contient du JSON
                    // (certains modèles/proxys envoient des trucs bizarres)
                    const jsonMatch = rawData.match(/\{.*\}/);
                    if (jsonMatch) {
                        try {
                            const parsed = JSON.parse(jsonMatch[0]);
                            const content = parsed.choices?.[0]?.delta?.content || parsed.content || '';
                            if (content) {
                                assistantText += content;
                                textEl.innerHTML = formatMessage(assistantText);
                                scrollToBottom(false);
                            }
                        } catch (e2) {
                            // En dernier recours, si ce n'est pas du JSON du tout, on ignore ou on traite comme du texte si c'est propre
                            // On évite d'ajouter du JSON brut (qui commence par {)
                            if (!rawData.startsWith('{')) {
                                assistantText += rawData;
                                textEl.innerHTML = formatMessage(assistantText);
                                scrollToBottom(false);
                            }
                        }
                    }
                    console.warn('Erreur de parsing ou chunk corrompu', e);
                }
            }
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Génération stoppée par l\'utilisateur');
        } else {
            console.error('Erreur:', error);
            appendMessage('assistant', `Erreur: ${error.message}`);
        }
    } finally {
        isGenerating = false;
        sendBtn.style.display = 'flex';
        if (stopBtn) stopBtn.style.display = 'none';
        removeTypingIndicator();

        if (assistantText) {
            conv.messages.push({ role: 'assistant', content: assistantText });
            saveConversations();
        }
    }
    sendBtn.disabled = false;
    renderConversations();
}

function stopGeneration() {
    if (abortController) {
        abortController.abort();
    }
}
