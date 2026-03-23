const API = {
    async call(url, method = 'GET', body = null) {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (body) options.body = JSON.stringify(body);
        const res = await fetch(url, options);
        if (res.status === 403 || res.status === 401) {
            if (url !== '/api/admin/verify') {
                showUnauthorizedModal();
                throw new Error("Unauthorized");
            }
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur API');
        return data;
    }
};

let allConversations = [];

const unauthorizedOverlay = document.getElementById('unauthorizedOverlay');

const navItems = document.querySelectorAll('.nav-item[data-target]');
const sections = document.querySelectorAll('.admin-section');

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await API.call('/api/admin/verify');
        unauthorizedOverlay.classList.remove('active');
        loadAllData();
    } catch (e) {
        showUnauthorizedModal();
    }
});

function showUnauthorizedModal() {
    unauthorizedOverlay.classList.add('active');
}

navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(n => n.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));
        item.classList.add('active');
        document.getElementById(item.dataset.target).classList.add('active');
    });
});

async function loadAllData() {
    loadKeys();
    loadBans();
    loadConversations();
}

async function loadKeys() {
    try {
        const keys = await API.call('/api/admin/keys');
        const tbody = document.querySelector('#keysTable tbody');
        tbody.innerHTML = '';
        let activeCount = 0;

        keys.forEach(k => {
            if (k.status === 'active') activeCount++;
            let badgeClass = k.status === 'active' ? 'active' : (k.status === 'expired' ? 'expired' : 'banned');
            let tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="key-copy" title="Copier" onclick="navigator.clipboard.writeText('${k.key}'); showToast('Clé copiée !')">${k.key}</span></td>
                <td>${k.duration_days === 0 ? 'À vie' : k.duration_days + ' j'}</td>
                <td><span class="badge ${badgeClass}">${k.status.toUpperCase()}</span></td>
                <td>${new Date(k.created_at).toLocaleDateString('fr-FR')}</td>
                <td>${k.expires_at ? new Date(k.expires_at).toLocaleDateString('fr-FR') : '-'}</td>
                <td>
                    ${k.status !== 'banned' ? `<button class="action-btn" onclick="updateKeyStatus('${k.key}', 'banned')">Bannir</button>` : `<button class="action-btn" onclick="updateKeyStatus('${k.key}', 'active')">Débannir</button>`}
                </td>
            `;
            tbody.appendChild(tr);
        });
        document.getElementById('statKeys').innerText = activeCount;
    } catch(e) { console.error(e); }
}

async function loadBans() {
    try {
        const bans = await API.call('/api/admin/bans');
        const tbody = document.querySelector('#bansTable tbody');
        tbody.innerHTML = '';
        bans.forEach(b => {
            let tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${b.ip}</td>
                <td>${b.reason}</td>
                <td>${new Date(b.banned_at).toLocaleString('fr-FR')}</td>
                <td><button class="action-btn delete" onclick="unbanIp('${b.ip}')">Débannir</button></td>
            `;
            tbody.appendChild(tr);
        });
        document.getElementById('statBans').innerText = bans.length;
    } catch(e) { console.error(e); }
}

async function loadConversations() {
    try {
        allConversations = await API.call('/api/admin/conversations');
        const tbody = document.querySelector('#convsTable tbody');
        tbody.innerHTML = '';
        allConversations.forEach(c => {
            let tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${c.title}</td>
                <td>${c.license_key}</td>
                <td>${new Date(c.updated_at).toLocaleString('fr-FR')}</td>
                <td><button class="action-btn" onclick="viewChat('${c.id}', '${c.title.replace(/'/g, "\\'")}')">Voir le Chat</button></td>
            `;
            tbody.appendChild(tr);
        });
        document.getElementById('statConvs').innerText = allConversations.length;
    } catch(e) { console.error(e); }
}

async function updateKeyStatus(key, status) {
    try {
        await API.call(`/api/admin/keys/${key}/status`, 'PUT', { status });
        showToast(`Clé marquée comme ${status}`);
        loadKeys();
    } catch(e) { showToast(e.message); }
}

async function unbanIp(ip) {
    try {
        await API.call(`/api/admin/bans/${ip}`, 'DELETE');
        showToast('IP débannie');
        loadBans();
    } catch(e) { showToast(e.message); }
}

document.getElementById('banSubmitBtn').addEventListener('click', async () => {
    const ip = document.getElementById('banIpInput').value.trim();
    const reason = document.getElementById('banReasonInput').value.trim();
    if (!ip) return;
    try {
        await API.call('/api/admin/bans', 'POST', { ip, reason });
        document.getElementById('banIpInput').value = '';
        document.getElementById('banReasonInput').value = '';
        showToast('IP bannie avec succès');
        loadBans();
    } catch(e) { showToast(e.message); }
});

const generateModal = document.getElementById('generateModal');
document.getElementById('openGenerateModal').onclick = () => generateModal.classList.add('active');
document.getElementById('closeGenerateModal').onclick = () => generateModal.classList.remove('active');

document.getElementById('submitGenerateKey').addEventListener('click', async () => {
    const duration = document.getElementById('keyDuration').value;
    const count = document.getElementById('keyCount').value;
    try {
        await API.call('/api/admin/keys', 'POST', { duration_days: duration, count });
        generateModal.classList.remove('active');
        showToast(`${count} clé(s) générée(s)`);
        loadKeys();
    } catch(e) { showToast(e.message); }
});

const viewChatModal = document.getElementById('viewChatModal');
const chatMsgsContainer = document.getElementById('chatViewMessages');

document.getElementById('closeChatModal').onclick = () => viewChatModal.classList.remove('active');

async function viewChat(id, title) {
    document.getElementById('chatViewTitle').innerText = title;
    viewChatModal.classList.add('active');
    chatMsgsContainer.innerHTML = '<div class="loading-spinner">Chargement...</div>';

    try {
        const messages = await API.call(`/api/admin/conversations/${id}/messages`);
        chatMsgsContainer.innerHTML = '';
        if (messages.length === 0) {
            chatMsgsContainer.innerHTML = '<p>Aucun message dans cette conversation.</p>';
            return;
        }

        messages.forEach(m => {
            const div = document.createElement('div');
            div.className = `chat-msg ${m.role}`;

            let safeContent = m.content.replace(/</g, '<').replace(/>/g, '>');
            
            div.innerHTML = `<div class="chat-bubble">${safeContent}</div>`;
            chatMsgsContainer.appendChild(div);
        });
        chatMsgsContainer.scrollTop = chatMsgsContainer.scrollHeight;
    } catch(e) {
        chatMsgsContainer.innerHTML = `<p class="error-msg">${e.message}</p>`;
    }
}

function showToast(msg) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}
