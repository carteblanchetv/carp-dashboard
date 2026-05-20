/**
 * theme.js?v=5.1.0 (v=2.5.5)
 * Manages light/dark mode switching and persistence for Carte Blanche Forms.
 */

console.log("[Theme] theme.js?v=5.1.1 loaded (v=2.5.6)");

(function() {
    // Default is dark mode in style.css?v=5.1.1. Toggle 'light-mode' class to switch.
    const savedTheme = localStorage.getItem('cb_theme') || 'dark';
    if (savedTheme === 'light') {
        document.documentElement.classList.add('light-mode');
    }

    window.toggleTheme = function() {
        const isLight = document.documentElement.classList.toggle('light-mode');
        const newTheme = isLight ? 'light' : 'dark';
        localStorage.setItem('cb_theme', newTheme);
        updateToggleIcons();
    };

    function updateToggleIcons() {
        const icons = document.querySelectorAll('.theme-toggle-icon');
        const isLight = document.documentElement.classList.contains('light-mode');
        icons.forEach(icon => {
            if (icon) {
                // If it's light, show Moon to switch to dark. If dark, show Sun to switch to light.
                icon.textContent = isLight ? '🌙' : '☀️';
            }
        });
    }

    window.addEventListener('DOMContentLoaded', updateToggleIcons);
    updateToggleIcons();
})();














