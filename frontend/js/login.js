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

// Forgot Password UI Toggling & Submission
const forgotPasswordLink = document.getElementById('forgotPasswordLink');
const backToLoginLink = document.getElementById('backToLoginLink');
const emailLoginForm = document.getElementById('emailLoginForm');
const forgotPasswordView = document.getElementById('forgotPasswordView');
const loginSubtitle = document.getElementById('loginSubtitle');

if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', (e) => {
        e.preventDefault();
        emailLoginForm.style.display = 'none';
        forgotPasswordView.style.display = 'block';
        if (loginSubtitle) {
            loginSubtitle.textContent = 'Reset your password via custom email destination.';
        }
        const err = document.getElementById('errorMessage');
        if (err) err.style.display = 'none';
    });
}

if (backToLoginLink) {
    backToLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        forgotPasswordView.style.display = 'none';
        emailLoginForm.style.display = 'block';
        if (loginSubtitle) {
            loginSubtitle.textContent = 'Please sign in with your work account to continue.';
        }
        const err = document.getElementById('errorMessage');
        if (err) err.style.display = 'none';
    });
}

const forgotPasswordForm = document.getElementById('forgotPasswordForm');
if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const resetAccountEmail = document.getElementById('resetAccountEmail');
        const resetDestinationEmail = document.getElementById('resetDestinationEmail');
        const btn = document.getElementById('forgotPasswordSubmitBtn');
        const err = document.getElementById('errorMessage');
        
        if (!resetAccountEmail || !resetDestinationEmail || !btn) return;
        
        const email = resetAccountEmail.value.trim();
        const destinationEmail = resetDestinationEmail.value.trim();
        
        if (!email || !destinationEmail) {
            showError("Please fill in both fields.");
            return;
        }
        
        btn.disabled = true;
        btn.textContent = 'Sending...';
        if (err) err.style.display = 'none';
        
        try {
            let apiBase = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
                ? 'http://127.0.0.1:5001/cb-deliverables/us-central1'
                : window.location.origin;
            
            const response = await fetch(`${apiBase}/api/forgot-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, destinationEmail })
            });
            
            const res = await response.json();
            
            if (res.success) {
                alert(`Password reset email successfully sent to ${destinationEmail}!`);
                forgotPasswordForm.reset();
                forgotPasswordView.style.display = 'none';
                emailLoginForm.style.display = 'block';
                if (loginSubtitle) {
                    loginSubtitle.textContent = 'Please sign in with your work account to continue.';
                }
            } else {
                throw new Error(res.error || 'Failed to send reset email.');
            }
        } catch (error) {
            console.error("Forgot password error:", error);
            showError(error.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Send Reset Link';
        }
    });
}
