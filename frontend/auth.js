// Firebase Authentication Logic
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    GoogleAuthProvider, 
    signInWithPopup, 
    onAuthStateChanged, 
    signOut, 
    signInWithEmailAndPassword,
    browserLocalPersistence,
    setPersistence
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js?v=5.1.0";
import { 
    initializeFirestore, 
    persistentLocalCache, 
    persistentMultipleTabManager, 
    doc, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    initializeAppCheck, 
    CustomProvider 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-check.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";

// ... (config remains same)
const firebaseConfig = {
  apiKey: "AIzaSyCPr1UfouQjJXy_cCXU7dbz_XZnu_LXaRc",
  authDomain: "cb-deliverables.firebaseapp.com",
  projectId: "cb-deliverables",
  storageBucket: "cb-deliverables.appspot.com",
  messagingSenderId: "705555810335",
  appId: "1:705555810335:web:b10f7fc0fca566f1fc535b"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// --- Turnstile Setup (Soft Security Only) ---
// Note: App Check enforcement is temporarily disabled to resolve 401 handshake errors on Firefox.
const TURNSTILE_SITE_KEY = '0x4AAAAAADPVsvb4KkbdOWGf';

// 1. Ensure Turnstile Script is loaded
if (typeof window !== 'undefined' && !document.querySelector('script[src*="turnstile/v0/api.js"]')) {
    const script = document.createElement('script');
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    script.setAttribute('data-cfasync', 'false');
    document.head.appendChild(script);
}

// App Check is currently OFF to allow login access.
export const appCheck = null; 
/*
const turnstileAppCheckProvider = new CustomProvider({
    getToken: () => {
        // ... (provider logic preserved for future re-activation)
    }
});
initializeAppCheck(app, { provider: turnstileAppCheckProvider, isTokenAutoRefreshEnabled: true });
*/

// Explicitly setting persistence during login flows instead of global initialization to avoid multi-tab logout races

// Initialize Firestore with robust connection settings
// Note: Persistence is temporarily disabled to resolve 'Backend unreachable' errors in Firefox/Safari partitioned environments.
let db;
try {
    db = initializeFirestore(app, {
        experimentalAutoDetectLongPolling: true,
        useFetchStreams: false // More compatible with restrictive proxies/CSPs
    });
} catch (e) {
    console.warn("[Auth] Firestore initialization failed:", e);
    db = initializeFirestore(app, {});
}
export { db };

const provider = new GoogleAuthProvider();

// Restricted Domain (Optional: Set this to e.g., 'carteblanche.co.za')
const RESTRICTED_DOMAIN = ""; 
const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000; // Increased to 24 hours for better user experience
const DB_LOOKUP_TIMEOUT = 1500; // Reduced from 5000 for Safari performance resilience

/**
 * Handle Google Sign-In
 */
export async function signIn() {
    try {
        await setPersistence(auth, browserLocalPersistence);
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        
        if (RESTRICTED_DOMAIN && !user.email.endsWith(`@${RESTRICTED_DOMAIN}`)) {
            console.warn("[Auth] Login rejected: Unauthorised domain", user.email);
            await signOut(auth);
            throw new Error(`Unauthorised domain. Please use your @${RESTRICTED_DOMAIN} account.`);
        }
        
        localStorage.setItem('login_timestamp', Date.now().toString());
        window.location.href = 'index.html';
    } catch (error) {
        console.error("Login failed:", error);
        alert(error.message);
    }
}

/**
 * Handle Email/Password Sign-In
 */
export async function signInWithEmail(email, password) {
    console.log("Attempting sign-in for:", email);
    
    // Ensure auth is ready in Safari (Firebase v10.8.0 support)
    if (auth.authStateReady) {
        try {
            await auth.authStateReady();
        } catch (e) {
            console.warn("[Auth] authStateReady wait failed:", e);
        }
    }

    try {
        await setPersistence(auth, browserLocalPersistence);
        let userCredential;
        try {
            userCredential = await signInWithEmailAndPassword(auth, email, password);
        } catch (initialError) {
            // Safari Network Error Retry Logic
            if (initialError.code === 'auth/network-request-failed') {
                console.warn("[Auth] Network error detected. Retrying sign-in in 800ms...");
                await new Promise(resolve => setTimeout(resolve, 800));
                userCredential = await signInWithEmailAndPassword(auth, email, password);
            } else {
                throw initialError;
            }
        }

        const user = userCredential.user;
        console.log("Firebase Auth success:", user.uid);

        // Set timestamp BEFORE navigation
        localStorage.setItem('login_timestamp', Date.now().toString());
        console.log("Session timestamp stored. Redirecting to index.html...");
        
        // Use assign to be more explicit, though href is similar
        window.location.assign('index.html');
        
        // Return a promise that never resolves to keep the caller in 'Verifying...' state
        return new Promise(() => {}); 
    } catch (error) {
        console.error("Email login failed:", error.code, error.message);
        let message = "Login failed. Please check your email and password.";
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-email') {
            message = "User not found. Contact administrator.";
        } else if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            message = "Invalid password/credentials.";
        } else if (error.code === 'auth/network-request-failed') {
            message = "Network error. Please check your connection and try again.";
        }
        throw new Error(message);
    }
}

/**
 * Logout
 */
export async function logout(reason = "User initiated") {
    console.log(`[Auth] Logging out. Reason: ${reason}`);
    sessionStorage.clear();
    localStorage.removeItem('login_timestamp');
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('user_profile_')) {
            localStorage.removeItem(key);
        }
    });
    await signOut(auth);
    window.location.href = 'login.html';
}

/**
 * Get Current User
 */
export function getUser() {
    return new Promise((resolve) => {
        onAuthStateChanged(auth, (user) => {
            resolve(user);
        });
    });
}

/**
 * Get Synchronous Current User
 */
export function getCurrentUser() {
    return auth.currentUser;
}

/**
 * Check Authentication State
 * Should be called on every protected page.
 */
export function checkAuth(redirectIfNotLogged = true) {
    return new Promise((resolve) => {
        const executeCheck = () => {
            onAuthStateChanged(auth, async (user) => {
                if (user) {
                // 1. Check for cached profile to resolve instantly
                const cachedProfile = localStorage.getItem(`user_profile_${user.email.toLowerCase()}`);
                if (cachedProfile) {
                    try {
                        const parsed = JSON.parse(cachedProfile);
                        user.role = parsed.role;
                        user.isEnabled = parsed.isEnabled;
                        user.firstName = parsed.firstName || '';
                        user.lastName = parsed.lastName || '';
                        user.displayName = `${user.firstName} ${user.lastName}`.trim() || user.email;

                        // --- MASQUERADE UI OVERRIDE ---
                        const target = getMasqueradeTarget();
                        const realEmail = user.email.toLowerCase(); // Original FB email
                        const isLezanne = realEmail === 'lezanne@carteblanche.co.za';
                        
                        // We attach the ROLE to a separate property to avoid mutating the core Firebase email/role
                        user.displayRole = parsed.role;
                        user.displayEmail = user.email;
                        user.displayDisplayName = user.displayName;

                        if (target && isLezanne) {
                            const isUserView = (target.viewMode || 'user') === 'user';
                            if (isUserView) {
                                user.displayRole = target.role;
                                user.displayEmail = `${target.name} (Masqueraded)`;
                                user.displayDisplayName = target.name;
                                user.isMasquerading = true;
                            } else {
                                user.displayRole = parsed.role;
                                user.displayEmail = `${user.email} (Admin View)`;
                                user.displayDisplayName = user.displayName;
                                user.isMasquerading = true; // Still in masquerade session
                            }
                        }

                        console.log("[Auth] Identity Resolution (Cached):", { email: user.displayEmail, name: user.displayDisplayName, role: user.displayRole, masqueraded: !!target });
                        updateMasqueradeBanner();
                        resolve(user); // Resolve early for instant UI
                    } catch (e) {}
                }

                    // 2. Fetch/Refresh DB Profile in background (or foreground if no cache)
                    try {
                        const fetchDoc = async (id) => {
                            if (!id) return null;
                            return Promise.race([
                                getDoc(doc(db, 'users', id)),
                                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), DB_LOOKUP_TIMEOUT))
                            ]);
                        };

                        let userDoc = null;
                        let lookupSucceeded = false;
                        try {
                            userDoc = await fetchDoc(user.uid);
                            lookupSucceeded = true;
                        } catch (e) {
                            console.warn("[Auth] UID-based profile lookup failed:", e.message);
                            
                            // Safari Optimization: If UID lookup timed out, don't wait for Email lookup
                            // Fall back to API and Cache logic faster.
                            const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
                            const shouldRetryWithEmail = user.email && (!isSafari || e.message !== 'timeout');

                            if (shouldRetryWithEmail) {
                                try {
                                    userDoc = await fetchDoc(user.email.toLowerCase());
                                    lookupSucceeded = true;
                                } catch (e2) {
                                    console.warn("[Auth] Email-based profile lookup failed:", e2.message);
                                }
                            }
                        }

                        let userData = (userDoc && userDoc.exists && userDoc.exists()) ? userDoc.data() : null;
                        const isLezanne = user.email && user.email.toLowerCase() === 'lezanne@carteblanche.co.za';
                        
                        // --- CRITICAL FIX FOR SAFARI ---
                        // Only treat as 'Unauthorised' if we SUCCESSFULLY retrieved a record and isEnabled is explicitly false.
                        // If userData is missing due to a timeout or network error, we trust the cache (if available).
                        if (!isLezanne && userData && userData.isEnabled === false) {
                            console.warn("Account is explicitly disabled:", user.email);
                            localStorage.removeItem(`user_profile_${user.email.toLowerCase()}`);
                            alert("Your account has been disabled. Please contact the administrator.");
                            await logout("Account disabled");
                            return;
                        }

                        // If user doesn't exist in DB and we don't have a cache, THEN it's an unauthorised new user.
                        // IMPORTANT: Only boot the user if the lookup actually succeeded but found no record.
                        // If the lookup failed (e.g. offline), we let them through to the dashboard (which handles offline state).
                        if (!isLezanne && !userData && !cachedProfile && lookupSucceeded) {
                            console.warn("Unauthorised new account (not in whitelist):", user.email);
                            alert("Your account is not authorised. Please contact the administrator.");
                            await logout("Not in whitelist");
                            return;
                        }

                        let role = 'producer';
                        if (isLezanne) {
                            role = 'super-admin';
                        } else if (userData) {
                            role = userData.role || 'producer';
                        }
                        
                        const isEnabled = isLezanne ? true : (userData ? (userData.isEnabled !== false) : true);

                    // Update local user object
                    user.role = role;
                    user.isEnabled = isEnabled;
                    user.firstName = userData ? (typeof userData.firstName === 'string' ? userData.firstName : (typeof userData.name === 'string' ? userData.name : '')) : '';
                    user.lastName = userData ? (typeof userData.lastName === 'string' ? userData.lastName : (typeof userData.surname === 'string' ? userData.surname : '')) : '';

                    if (isLezanne) {
                        user.firstName = 'Lezanne';
                        user.lastName = 'Janse van Rensburg';
                    }

                    user.displayName = (userData && userData.firstName) ? userData.firstName : (user.firstName || user.email.split('@')[0]);

                    // Cache for next time
                    localStorage.setItem(`user_profile_${user.email.toLowerCase()}`, JSON.stringify({ 
                        role, 
                        isEnabled,
                        firstName: user.firstName,
                        lastName: user.lastName
                    }));
                    
                    // --- MASQUERADE UI OVERRIDE ---
                    const target = getMasqueradeTarget();
                    
                    user.displayRole = role;
                    user.displayEmail = user.email;
                    user.displayDisplayName = user.displayName;

                    if (target && isLezanne) {
                        const isUserView = (target.viewMode || 'user') === 'user';
                        if (isUserView) {
                            user.displayRole = target.role;
                            user.displayEmail = `${target.name} (Masqueraded)`;
                            user.displayDisplayName = target.name;
                            user.isMasquerading = true;
                        } else {
                            user.displayRole = role;
                            user.displayEmail = `${user.email} (Admin View)`;
                            user.displayDisplayName = user.displayName;
                            user.isMasquerading = true;
                        }
                    }

                    // Background update from API for decrypted names
                    fetchWithAuth('/api/profile')
                        .then(r => r.json())
                        .then(d => {
                            if (d && d.success && d.profile) {
                                user.firstName = d.profile.name;
                                user.lastName = d.profile.surname;
                                user.displayName = d.profile.name || user.firstName || user.email.split('@')[0];
                                
                                if (d.profile.role) {
                                    user.role = d.profile.role;
                                    user.displayRole = d.profile.role;
                                }

                                const currentTarget = getMasqueradeTarget();
                                if (currentTarget && isLezanne && (currentTarget.viewMode || 'user') === 'user') {
                                    user.displayDisplayName = currentTarget.name;
                                    user.displayRole = currentRole;
                                } else {
                                    user.displayDisplayName = user.displayName;
                                }
                                
                                const nameEl = document.getElementById('userNameDisplay');
                                if (nameEl) nameEl.textContent = user.displayDisplayName;

                                initNavBar(user);
                                updateMasqueradeBanner();

                                localStorage.setItem(`user_profile_${user.email.toLowerCase()}`, JSON.stringify({ 
                                    role: user.role, 
                                    isEnabled: user.isEnabled,
                                    firstName: user.firstName,
                                    lastName: user.lastName
                                }));
                                
                                console.log("[Auth] Identity Refined via API:", user.displayDisplayName, "Role:", user.role);
                                window.dispatchEvent(new CustomEvent('authProfileUpdated', { detail: user }));
                            }
                        })
                        .catch(e => console.warn("[Auth] Profile API failed:", e));

                    console.log("[Auth] Identity Resolution (Final):", { email: user.displayEmail, name: user.displayDisplayName, role: user.displayRole, masqueraded: !!target });
                    updateMasqueradeBanner();
                    
                    // If we didn't resolve early (no cache), resolve now
                    if (!cachedProfile) resolve(user);

                } catch (err) {
                    console.error("Profile lookup failed:", err);
                    if (!cachedProfile) resolve(user); // fallback
                }

                // 2. Check Domain restriction
                if (RESTRICTED_DOMAIN && !user.email.endsWith(`@${RESTRICTED_DOMAIN}`)) {
                    await logout("Unauthorised domain");
                    if (redirectIfNotLogged) window.location.href = 'login.html?error=domain';
                    return;
                }

                // 3. Check Timeout (24 hour limit)
                const loginTime = localStorage.getItem('login_timestamp');
                if (loginTime) {
                    const elapsed = Date.now() - parseInt(loginTime);
                    if (elapsed > SESSION_TIMEOUT_MS) {
                        console.warn("[Auth] Session expired (24 hour limit). Logging out.");
                        alert("Your session has expired for security. Please sign in again.");
                        await logout("Session timeout");
                        return;
                    }
                } else {
                    localStorage.setItem('login_timestamp', Date.now().toString());
                }

                resolve(user);
            } else {
                if (redirectIfNotLogged) {
                    console.log("[Auth] No user found. Redirecting to login...");
                    window.location.href = 'login.html';
                }
                resolve(null);
            }
        });
    };

    if (auth.authStateReady) {
        auth.authStateReady().then(executeCheck).catch(err => {
            console.warn("[Auth] authStateReady failed:", err);
            executeCheck();
        });
    } else {
        executeCheck();
    }
    });
}



/**
 * Get Secure ID Token for API calls
 */
export async function getIdToken() {
    // 1. Resolve immediately if user is already available
    if (auth.currentUser) {
        return await auth.currentUser.getIdToken();
    }

    // 2. Otherwise wait for state change
    return new Promise((resolve) => {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                const token = await user.getIdToken();
                resolve(token);
            } else {
                resolve(null);
            }
        });
    });
}

export function isAdmin(user) {
    if (!user) return false;
    const currentRole = (user.displayRole || user.role || '').toLowerCase();
    const adminRoles = ['admin', 'super-admin'];
    return adminRoles.includes(currentRole);
}

export function isEditorialProduction(user) {
    if (!user) return false;
    const currentRole = (user.displayRole || user.role || '').toLowerCase();
    const editorialRoles = ['editorial-production', 'admin', 'super-admin'];
    return editorialRoles.includes(currentRole);
}

export function isSuperAdmin(user) {
    if (!user) return false;
    const currentRole = (user.displayRole || user.role || '').toLowerCase();
    const superAdminRoles = ['admin', 'super-admin'];
    return superAdminRoles.includes(currentRole);
}

/**
 * GET MASQUERADE TARGET
 */
export function getMasqueradeTarget() {
    const data = sessionStorage.getItem('cb_masquerade');
    if (!data) return null;
    try {
        const obj = JSON.parse(data);
        if (!obj.viewMode) obj.viewMode = 'user';
        return obj;
    } catch(e) { return null; }
}

/**
 * START MASQUERADE
 */
export function startMasquerade(uid, name, role) {
    if (!confirm(`Are you sure you want to masquerade as ${name}? You will see the site exactly as they do.`)) return;
    sessionStorage.setItem('cb_masquerade', JSON.stringify({ uid, name, role }));
    window.location.href = 'index.html';
}

/**
 * STOP MASQUERADE
 */
export function stopMasquerade() {
    console.log("[Auth] Terminating Masquerade...");
    sessionStorage.removeItem('cb_masquerade');
    sessionStorage.removeItem('cb_user_profile');
    localStorage.removeItem(`user_profile_lezanne@carteblanche.co.za`); // SPECIFIC CLEANUP
    window.location.href = 'index.html';
}

/**
 * SWITCH MASQUERADE VIEW MODE
 */
export function setMasqueradeView(mode) {
    const target = getMasqueradeTarget();
    if (target) {
        target.viewMode = mode;
        sessionStorage.setItem('cb_masquerade', JSON.stringify(target));
        window.location.reload();
    }
}

// Update version
console.log("[Auth] Version v5.1.1 Initializing (Global Cache Purge)...");

export const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://127.0.0.1:5001/cb-deliverables/us-central1'
    : window.location.origin;

/**
 * FETCH WITH AUTH (Centralized, Masquerade Aware & Caching)
 */
export async function fetchWithAuth(url, options = {}) {
    // 1. Only cache GET requests
    const isGet = !options.method || options.method.toUpperCase() === 'GET';
    const target = getMasqueradeTarget();
    const masqComponent = (target && target.uid && (target.viewMode || 'user') === 'user') ? `_masq_${target.uid}` : '';
    const cacheKey = `cb_cache${masqComponent}_${url}`;
    
    // 2. Return from session cache if available and not explicitly skipping
    if (isGet && !options.skipCache) {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
            try {
                const { data, timestamp } = JSON.parse(cached);
                // Cache for 2 minutes
                if (Date.now() - timestamp < 120000) {
                    console.log(`[Cache] Serving ${url} from session storage...`);
                    // Return a fake response object
                    return {
                        ok: true,
                        status: 200,
                        json: async () => data,
                        text: async () => JSON.stringify(data),
                        blob: async () => new Blob([JSON.stringify(data)])
                    };
                }
            } catch (e) {
                sessionStorage.removeItem(cacheKey);
            }
        }
    }

    const token = await getIdToken();
    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`
    };

    if (target && target.uid && (target.viewMode || 'user') === 'user') {
        headers['X-Masquerade-UID'] = target.uid;
        if (target.email) {
            headers['X-Masquerade-User'] = target.email;
        }
    }

    // Automatically prepend API_BASE if URL is relative
    let fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
    // Ensure no double slashes if API_BASE is the origin
    if (API_BASE && url.startsWith('/') && API_BASE.endsWith('/')) {
        fullUrl = `${API_BASE.slice(0, -1)}${url}`;
    } else if (API_BASE && !url.startsWith('/') && !API_BASE.endsWith('/')) {
        fullUrl = `${API_BASE}/${url}`;
    }

    // Clear cache on mutations (POST, PUT, DELETE)
    if (!isGet) {
        Object.keys(sessionStorage).forEach(key => {
            if (key.startsWith('cb_cache')) sessionStorage.removeItem(key);
        });
    }

    try {
        const response = await fetch(fullUrl, { ...options, headers });
        
        // 3. Cache successful GET responses
        if (isGet && response.ok && !options.skipCache) {
            try {
                const clone = response.clone();
                const data = await clone.json();
                sessionStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: Date.now() }));
            } catch (e) {}
        }

        return response;
    } catch (fetchErr) {
        console.error(`[Auth] fetchWithAuth CRITICAL ERROR for ${fullUrl}:`, fetchErr);
        throw fetchErr; // Re-throw to be caught by caller
    }
}

/**
 * UPDATE MASQUERADE BANNER UI
 */
export function updateMasqueradeBanner() {
    const target = getMasqueradeTarget();
    const banner = document.getElementById('masqueradeBanner');
    
    if (target) {
        console.log("[Auth] Masquerade is ACTIVE for:", target.name);
        document.body.classList.add('is-masquerading');
        
        if (banner) {
            banner.style.display = 'flex';
            banner.style.setProperty('display', 'flex', 'important');
            banner.classList.remove('hidden');
            const nameEl = document.getElementById('masqueradeName');
            const roleEl = document.getElementById('masqueradeRole');
            const viewActionEl = document.getElementById('masqueradeViewAction');

            const isUserView = (target.viewMode || 'user') === 'user';

            if (nameEl) nameEl.textContent = target.name;
            if (roleEl) roleEl.textContent = isUserView ? target.role : 'ADMIN VIEW';
            
            if (viewActionEl) {
                if (isUserView) {
                    viewActionEl.innerHTML = `<button onclick="window.auth.setMasqueradeView('admin')" class="btn-soft" style="background: rgba(255, 255, 255, 0.1); color: white; border: 1px solid rgba(255, 255, 255, 0.3); padding: 0.35rem 0.7rem; font-size: 0.7rem; border-radius: 4px; cursor: pointer;">Switch to Admin View</button>`;
                } else {
                    viewActionEl.innerHTML = `<button onclick="window.auth.setMasqueradeView('user')" class="btn-soft" style="background: #10b981; color: white; border: none; padding: 0.35rem 0.7rem; font-size: 0.7rem; border-radius: 4px; cursor: pointer; font-weight: bold;">Switch to User View</button>`;
                }
            }
        }
    } else {
        document.body.classList.remove('is-masquerading');
        if (banner) {
            banner.classList.add('hidden');
            banner.style.display = 'none';
        }
    }
}

/**
 * INITIALIZE GLOBAL NAV BAR
 * Standardizes the look and feel across all roles.
 */
export function initNavBar(user) {
    if (!user) return;
    
    // 1. Update User Identity
    const nameEl = document.getElementById('userNameDisplay');
    const emailEl = document.getElementById('userEmailDisplay');
    if (nameEl) {
        let fullName = user.displayDisplayName || user.displayName || user.email;
        let firstName = fullName.split(' ')[0];
        nameEl.textContent = firstName;
    }
    if (emailEl) emailEl.textContent = user.displayEmail || user.email;

    // 2. Manage Navigation Actions
    const actionsContainer = document.querySelector('.gnav-actions');
    if (actionsContainer) {
        // A. Remove BACK Button if it exists (User request: Simplify Dashboard/Nav)
        const backBtn = document.getElementById('gnavBackBtn');
        if (backBtn) backBtn.remove();

        // B. Inject/Manage Dashboard Button
        const path = window.location.pathname.toLowerCase();
        const isDashboardPage = path === '/' || path.endsWith('/index.html') || path.endsWith('/index') || path === '';
        
        let allBtns = actionsContainer.querySelectorAll('.gnav-btn');
        allBtns.forEach(btn => {
            const text = btn.textContent.trim().toUpperCase();
            if (text.includes('HOME')) {
                btn.remove();
            } else if ((text.includes('DASHBOARD') && isDashboardPage) || btn.id === 'gnavAdminDashboardBtn') {
                btn.remove();
            }
        });

        const remainingBtns = actionsContainer.querySelectorAll('.gnav-btn');

        if (!isDashboardPage) {
            let dashBtn = actionsContainer.querySelector('#gnavDynamicDashBtn');
            if (!dashBtn) {
                const hasExistingDash = Array.from(remainingBtns).some(btn => {
                    const text = btn.textContent.trim().toUpperCase();
                    return text.includes('DASHBOARD');
                });
                
                if (!hasExistingDash) {
                    dashBtn = document.createElement('a');
                    dashBtn.id = 'gnavDynamicDashBtn';
                    dashBtn.href = 'index.html';
                    dashBtn.className = 'gnav-btn';
                    dashBtn.title = "Back to Dashboard";
                    dashBtn.innerHTML = `
                        <span>🏠</span>
                        <span>DASHBOARD</span>
                    `;
                    actionsContainer.insertBefore(dashBtn, actionsContainer.firstChild);
                }
            }
        }

        // C. Inject HELP GUIDE button dynamically
        let helpBtn = actionsContainer.querySelector('#gnavHelpBtn');
        if (!helpBtn) {
            helpBtn = document.createElement('a');
            helpBtn.id = 'gnavHelpBtn';
            helpBtn.href = 'guide.html';
            helpBtn.className = 'gnav-btn';
            helpBtn.title = "Help Guide";
            helpBtn.style.border = '1px solid var(--border)';
            helpBtn.innerHTML = `
                <span>📖</span>
                <span>HELP GUIDE</span>
            `;
            const themeBtn = actionsContainer.querySelector('button[onclick="window.toggleTheme()"]');
            if (themeBtn) {
                actionsContainer.insertBefore(helpBtn, themeBtn);
            } else {
                actionsContainer.appendChild(helpBtn);
            }
        }
    }

    // 3. Update Home Link (Always point to the new deliverables hub)
    const homeLinks = document.querySelectorAll('a[href="index.html"]');
    homeLinks.forEach(link => {
        // Only update if it's a "HOME" button, breadcrumb, or footer hub link
        const text = link.textContent.trim().toUpperCase();
        const isHomeBtn = link.classList.contains('gnav-btn') && text === 'HOME';
        const isBreadcrumbHome = text === 'HOME' || link.closest('.breadcrumb');
        const isFooterHubLink = text.includes('BACK TO FORMS HUB');
        
        if (isHomeBtn || isBreadcrumbHome || isFooterHubLink) {
            link.href = 'https://cb-deliverables.web.app/';
            if (isHomeBtn) link.title = "Go to Deliverables Hub";
        }
    });

    // 4. Role-based visibility
    const gnavAdminBtn = document.getElementById('gnavAdminBtn');
    if (gnavAdminBtn) {
        const realRole = (user.role || '').toLowerCase();
        const displayRole = (user.displayRole || '').toLowerCase();
        const isAdmin = realRole === 'super-admin' || displayRole === 'super-admin';
        gnavAdminBtn.style.display = isAdmin ? 'flex' : 'none';
        gnavAdminBtn.classList.toggle('hidden', !isAdmin);
    }

    console.log("[Auth] Nav Bar Standardized for:", user.displayEmail);
    initCleanPaste();
}

/**
 * GLOBAL CLEAN PASTE
 * Strips Word formatting and smart quotes from all inputs and editors.
 */
export function initCleanPaste() {
    if (window._cbCleanPasteInitialized) return;
    window._cbCleanPasteInitialized = true;

    console.log("[Auth] Global Clean Paste Initialized");

    document.addEventListener('paste', (e) => {
        const target = e.target;
        const isRichEditor = target.classList.contains('rich-editor') || target.contentEditable === 'true';
        const isStandardInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
        
        if (!isRichEditor && !isStandardInput) return;

        const html = e.clipboardData.getData('text/html');
        const text = e.clipboardData.getData('text/plain');

        // 1. Handle Rich Text (HTML) Clean Paste for contenteditable
        if (isRichEditor && html && (html.includes('MsoNormal') || html.includes('style=') || html.includes('<P '))) {
            // Only prevent default if we actually have HTML to clean
            e.preventDefault();
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            
            const clean = (el) => {
                el.removeAttribute('class');
                el.removeAttribute('style');
                el.removeAttribute('lang');
                for (let child of el.children) {
                    if (child.nodeType === 1) clean(child);
                }
            };
            clean(tempDiv);
            
            if (target.tagName === 'TEXTAREA') {
                // If it's a textarea being used as an HTML editor
                const start = target.selectionStart;
                const end = target.selectionEnd;
                const val = target.value;
                target.value = val.substring(0, start) + tempDiv.innerHTML + val.substring(end);
                target.selectionStart = target.selectionEnd = start + tempDiv.innerHTML.length;
                target.dispatchEvent(new Event('input'));
            } else {
                document.execCommand('insertHTML', false, tempDiv.innerHTML);
            }
            return;
        }

        // 2. Handle Smart Quotes and special Word characters for all fields (Plain Text)
        if (text && /[\u2018\u2019\u201C\u201D\u2013\u2014\u2026]/.test(text)) {
            e.preventDefault();
            const cleaned = text
                .replace(/[\u2018\u2019]/g, "'")
                .replace(/[\u201C\u201D]/g, '"')
                .replace(/\u2013/g, "-")
                .replace(/\u2014/g, "--")
                .replace(/\u2026/g, "...");

            if (isRichEditor && target.tagName !== 'TEXTAREA') {
                document.execCommand('insertText', false, cleaned);
            } else {
                const start = target.selectionStart;
                const end = target.selectionEnd;
                const val = target.value;
                target.value = val.substring(0, start) + cleaned + val.substring(end);
                target.selectionStart = target.selectionEnd = start + cleaned.length;
                target.dispatchEvent(new Event('input'));
            }
        }
    });
}

// Export functions to window for use in non-module scripts
window.auth = {
    signIn,
    signInWithEmail,
    logout,
    getUser,
    getCurrentUser,
    checkAuth,
    getIdToken,
    isAdmin,
    isSuperAdmin,
    isEditorialProduction,
    fetchWithAuth,
    getMasqueradeTarget,
    startMasquerade,
    stopMasquerade,
    setMasqueradeView,
    updateMasqueradeBanner,
    initNavBar,
    isLezanne: (user) => {
        if (!user) return false;
        const email = (user.email || '').toLowerCase();
        return email === 'lezanne@carteblanche.co.za';
    }
};

// GLOBAL SAFETY CHECK: Ensure banner is processed even if auth resolves before DOM
window.addEventListener('load', () => {
    updateMasqueradeBanner();
});

// EMERGENCY RECOVERY: Ctrl + Shift + X to stop masquerade
window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'x' || e.key === 'X')) {
        console.log("[Auth] Emergency Shortcut Triggered (Ctrl+Shift+X)");
        stopMasquerade();
    }
});

