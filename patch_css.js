const fs = require('fs');

const cssToAppend = `

/* === LAYOUT: SIDEBAR & MAIN === */
.admin-layout-wrapper {
    display: flex;
    gap: 2rem;
    max-width: 1600px;
    margin: 0 auto;
    align-items: flex-start;
    padding-right: 1rem;
}

.episodes-sidebar {
    flex: 0 0 250px;
    background: var(--bg-card);
    border-right: 1px solid var(--border);
    border-radius: 0 8px 8px 0;
    padding: 1.5rem 1rem;
    position: sticky;
    top: 2rem;
    max-height: calc(100vh - 4rem);
    overflow-y: auto;
    box-shadow: 2px 0 8px rgba(0,0,0,0.05);
    margin-top: 2rem;
}

.admin-main-content {
    flex: 1;
    min-width: 0;
    padding-left: 0;
}

.episodes-sidebar h3 {
    font-size: 1.1rem;
    color: var(--text);
    margin-bottom: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 2px solid var(--border);
    padding-bottom: 0.5rem;
}

.episodes-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

.episodes-list li {
    display: block;
}

.episodes-list button {
    width: 100%;
    text-align: left;
    background: none;
    border: 1px solid transparent;
    padding: 0.6rem 0.8rem;
    border-radius: 6px;
    cursor: pointer;
    color: var(--text-light);
    font-size: 0.95rem;
    font-weight: 500;
    transition: all 0.2s;
}

.episodes-list button:hover {
    background: rgba(0, 143, 190, 0.05);
    color: var(--primary);
}

.episodes-list button.active {
    background: rgba(0, 143, 190, 0.1);
    color: var(--primary);
    border-color: rgba(0, 143, 190, 0.2);
    font-weight: 600;
}

@media (max-width: 1024px) {
    .admin-layout-wrapper {
        flex-direction: column;
    }
    .episodes-sidebar {
        flex: none;
        width: 100%;
        max-height: 200px;
        position: static;
        border-radius: 8px;
        border-right: none;
        border-bottom: 1px solid var(--border);
        margin: 1rem 1rem 0;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    .admin-main-content {
        padding-left: 1rem;
    }
}
`;

fs.appendFileSync('frontend/style.css', cssToAppend);
console.log('Appended CSS');
