import { db, ref, set, get, child } from './firebase.js';

// Helper to encode email for firebase paths
const encodeEmail = (email) => email.replace(/\./g, ',');
const decodeEmail = (id) => id.replace(/,/g, '.');

// DOM Elements
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const loginError = document.getElementById('login-error');
const signupError = document.getElementById('signup-error');
const logoutBtn = document.getElementById('logout-btn');

const showError = (element, message) => {
    if (element) {
        element.textContent = message;
        setTimeout(() => element.textContent = '', 5000);
    }
};

// Handle Signup
if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const role = document.getElementById('role').value;

        if (!role) {
            showError(signupError, "Please select a role.");
            return;
        }

        const submitBtn = signupForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;

        try {
            const encoded = encodeEmail(email);
            const userRef = ref(db, 'users/' + encoded);
            const snapshot = await get(userRef);

            if (snapshot.exists()) {
                showError(signupError, "Email is already registered.");
                submitBtn.disabled = false;
                return;
            }

            const newUser = { email, password, role };
            await set(userRef, newUser);

            localStorage.setItem('currentUser', JSON.stringify(newUser));
            window.location.href = 'index.html';
        } catch (error) {
            showError(signupError, error.message);
            submitBtn.disabled = false;
        }
    });
}

// Handle Login
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        const submitBtn = loginForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;

        try {
            const encoded = encodeEmail(email);
            const userRef = ref(db, 'users/' + encoded);
            const snapshot = await get(userRef);

            if (snapshot.exists()) {
                const user = snapshot.val();
                if (user.password === password) {
                    localStorage.setItem('currentUser', JSON.stringify(user));
                    window.location.href = 'index.html';
                    return;
                }
            }
            
            showError(loginError, 'Invalid email or password.');
            submitBtn.disabled = false;
        } catch (error) {
            showError(loginError, error.message);
            submitBtn.disabled = false;
        }
    });
}

// Handle Logout
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('currentUser');
        window.location.href = 'login.html';
    });
}

let currentUserRole = null;
let currentUser = null;

// Auth State Check purely on load
window.addEventListener('DOMContentLoaded', () => {
    const isAuthPage = window.location.pathname.includes('login.html') || window.location.pathname.includes('signup.html');
    const isIndexPage = window.location.pathname.includes('index.html') || window.location.pathname.endsWith('/');

    const userObj = localStorage.getItem('currentUser');
    const user = userObj ? JSON.parse(userObj) : null;

    if (user) {
        if (isAuthPage) {
            window.location.href = 'index.html';
            return;
        }

        if (isIndexPage) {
            currentUser = user;
            currentUserRole = user.role;
            
            // Dispatch custom event indicating auth is ready
            window.dispatchEvent(new CustomEvent('authReady', {
                detail: { user, role: currentUserRole }
            }));
        }
    } else {
        if (isIndexPage) {
            window.location.href = 'login.html';
        }
    }
});

export const getCurrentUser = () => currentUser;
export const getCurrentUserRole = () => currentUserRole;