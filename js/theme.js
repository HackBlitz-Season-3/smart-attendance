const themeToggleBtn = document.getElementById('themeToggle');
const themeIcon = document.getElementById('themeIcon');

// Theme Initialization
let isDark = localStorage.getItem('theme') === 'dark';

function applyTheme() {
    if (!themeIcon) return; // fail safe for un-mounted auth pages

    if (isDark) {
        document.body.classList.add("dark");
        themeIcon.src = "assets/moon.svg";
    } else {
        document.body.classList.remove("dark");
        themeIcon.src = "assets/sun.svg";
    }
}

if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        isDark = !isDark;
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        applyTheme();
    });
} else {
    // If auth pages don't have the button, still apply body colors
    if (isDark) document.body.classList.add("dark");
}

window.addEventListener('DOMContentLoaded', applyTheme);
