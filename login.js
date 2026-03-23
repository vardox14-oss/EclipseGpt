document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const toggleModeBtn = document.getElementById('toggleAuthMode');
    const headerTitle = document.querySelector('.login-header h2');
    const submitBtn = document.querySelector('.auth-btn');
    const footerText = document.querySelector('.login-footer p');

    let isLoginMode = true;

    // Toggle between Login and Register using Event Delegation on Footer
    const footerContainer = document.querySelector('.login-footer');
    footerContainer.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'toggleAuthMode') {
            e.preventDefault();
            isLoginMode = !isLoginMode;

            if (isLoginMode) {
                headerTitle.textContent = 'Re-bonjour';
                submitBtn.textContent = 'Se connecter';
                footerText.innerHTML = `Vous n'avez pas de compte ? <a href="#" id="toggleAuthMode">S'inscrire</a>`;
            } else {
                headerTitle.textContent = 'Créer un compte';
                submitBtn.textContent = 'Créer un compte';
                footerText.innerHTML = `Vous avez déjà un compte ? <a href="#" id="toggleAuthMode">Se connecter</a>`;
            }
        }
    });

    // Handle Form Submission
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        if (!email || !password) {
            showToast('Veuillez remplir tous les champs', true);
            return;
        }

        if (!isLoginMode && password.length < 6) {
            showToast('Le mot de passe doit faire au moins 6 caractères', true);
            return;
        }

        // Simulate network delay
        submitBtn.style.opacity = '0.7';
        submitBtn.textContent = isLoginMode ? 'Connexion en cours...' : 'Création en cours...';
        submitBtn.disabled = true;

        setTimeout(() => {
            // Success Auth - Save token to localStorage to simulate logged-in state
            localStorage.setItem('eclipsegpt_auth_token', 'simulated_secure_token_' + Date.now());
            localStorage.setItem('eclipsegpt_user_email', email);

            showToast(isLoginMode ? 'Connexion réussie !' : 'Compte créé avec succès !');

            // Redirect to chat
            setTimeout(() => {
                window.location.href = 'chat.html';
            }, 800);
        }, 1200);
    });
});

// Toast System
let toastTimeout;
function showToast(message, isError = false) {
    let toast = document.getElementById('authToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'authToast';
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    if (isError) {
        toast.classList.add('error');
    } else {
        toast.classList.remove('error');
    }

    toast.classList.add('show');

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
