import { checkAuth } from '../auth.js?v=5.1.1';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Authenticate user
    checkAuth(false).then(user => {
        console.log("[Guide] Authenticated user:", user);
    }).catch(err => {
        console.error("[Guide] Auth error:", err);
    });

    // 2. Handle sidebar menu section switching
    const menuItems = document.querySelectorAll('.menu-item');
    const sections = document.querySelectorAll('.guide-section');

    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetSectionId = item.getAttribute('data-section');
            if (!targetSectionId) return;

            // Remove active class from all menu items and add to clicked one
            menuItems.forEach(mi => mi.classList.remove('active'));
            item.classList.add('active');

            // Remove active class from all sections and add to target one
            sections.forEach(sec => sec.classList.remove('active'));
            const targetSection = document.getElementById(targetSectionId);
            if (targetSection) {
                targetSection.classList.add('active');
                // Scroll to top of content card on mobile/tab switching
                const contentCard = document.querySelector('.guide-content-card');
                if (contentCard && window.innerWidth <= 900) {
                    contentCard.scrollIntoView({ behavior: 'smooth' });
                }
            }
        });
    });

    // 3. Theme-aware screenshot swapping
    // Each screenshot <img> has data-dark and data-light attributes.
    // When the theme changes, we swap all screenshot src values to match.
    function syncThemeImages() {
        const isLight = document.documentElement.classList.contains('light-mode');
        document.querySelectorAll('img[data-dark]').forEach(img => {
            const darkSrc = img.getAttribute('data-dark');
            const lightSrc = img.getAttribute('data-light');
            // Use light image if available and in light mode, otherwise use dark
            img.src = (isLight && lightSrc) ? lightSrc : darkSrc;
        });
    }

    // Run immediately on page load
    syncThemeImages();

    // Patch the global toggleTheme so image swap runs after every theme toggle
    const originalToggle = window.toggleTheme;
    window.toggleTheme = function() {
        if (originalToggle) originalToggle();
        syncThemeImages();
    };
});
