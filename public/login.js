document.addEventListener('DOMContentLoaded', () => {
    const discordSection = document.getElementById('discordSection');
    const licenseSection = document.getElementById('licenseSection');
    const userAvatar = document.getElementById('userAvatar');
    const welcomeUsername = document.getElementById('welcomeUsername');

    fetch('/api/session', { credentials: 'include' })
        .then(r => r.json())
        .then(data => {
            if (data.discordLogged && data.licenseValid) {
                
                window.location.href = 'chat.html';
                return;
            }

            if (data.discordLogged && !data.licenseValid) {
                
                discordSection.classList.add('hidden');
                licenseSection.classList.remove('hidden');

                if (data.discordUser) {
                    userAvatar.src = data.discordUser.avatar;
                    userAvatar.style.display = 'block';
                    welcomeUsername.innerText = `Bienvenue, ${data.discordUser.username}`;
                }
            } else {
                
                discordSection.classList.remove('hidden');
                licenseSection.classList.add('hidden');
            }
        })
        .catch(() => { });

    const loginBtn = document.getElementById('licenseLoginBtn');
    const licenseInput = document.getElementById('licenseInput');
    const errObj = document.getElementById('loginErrorMessage');

    if (loginBtn && licenseInput) {
        loginBtn.addEventListener('click', async () => {
            const key = licenseInput.value.trim();
            if (!key) {
                errObj.innerText = 'Veuillez entrer une clé.';
                return;
            }

            loginBtn.innerText = 'Vérification...';
            loginBtn.disabled = true;

            try {
                const res = await fetch('/api/auth/license', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key })
                });

                const data = await res.json();
                
                if (data.success) {
                    window.location.href = 'chat.html';
                } else {
                    errObj.innerText = data.error || 'Clé non valide.';
                    loginBtn.innerText = 'Vérifier la clé';
                    loginBtn.disabled = false;
                }
            } catch (e) {
                errObj.innerText = 'Erreur serveur. Réessayez.';
                loginBtn.innerText = 'Vérifier la clé';
                loginBtn.disabled = false;
            }
        });

        licenseInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                loginBtn.click();
            }
        });
    }

    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    if (error) {
        window.history.replaceState({}, '', '/login.html');
        
        let toast = document.getElementById('authToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'authToast';
            document.body.appendChild(toast);
        }
        toast.textContent = `Erreur: ${error.replace('_', ' ')}`;
        toast.className = 'show error';
        setTimeout(() => toast.classList.remove('show'), 4000);
    }
});
