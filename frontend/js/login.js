import { signInWithEmail, checkAuth } from '../auth.js?v=5.1.1';

// Mark status as ready
const dot = document.getElementById('statusDot');
const text = document.getElementById('statusText');
if (dot) dot.style.background = '#22c55e';
if (text) text.textContent = 'System Ready (v=5.1.1)';

// Cloudflare Turnstile Callback
window.onTurnstileSuccess = (token) => {
    window.turnstileToken = token;
};

const loginForm = document.getElementById('emailLoginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleLoginSubmit();
    });
}

// Global handler for the button
async function handleLoginSubmit() {
    const emailInput = document.getElementById('emailInput');
    const passInput = document.getElementById('passwordInput');
    const btn = document.getElementById('emailLoginBtn');
    const err = document.getElementById('errorMessage');

    if (!emailInput || !passInput || !btn) return;

    const email = emailInput.value;
    const pass = passInput.value;

    if (!email || !pass) {
        showError("Please enter both email and password.");
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Verifying...';
    if (err) err.style.display = 'none';

    try {
        await signInWithEmail(email, pass);
    } catch (error) {
        console.error("Login component error:", error);
        showError(error.message);
        btn.disabled = false;
        btn.textContent = 'Sign In';
    }
}

function showError(msg) {
    const err = document.getElementById('errorMessage');
    if (err) {
        err.textContent = msg;
        err.style.display = 'block';
    }
}

// --- 1. Guard: If already logged in, skip to dashboard ---
checkAuth(false).then(user => {
    if (user) {
        window.location.href = 'index.html';
    }
});

// --- 4. Handle External Error Params ---
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('error') === 'domain') {
    showError("Please use your authorized work account.");
}
