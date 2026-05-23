const fs = require('fs');

let htmlContent = fs.readFileSync('frontend/index.html', 'utf8');

const quickLinksHtml = `
        <!-- QUICK LINKS SECTION -->
        <style>
        .quick-link-btn {
            font-size: 0.85rem; 
            padding: 0.6rem 1rem; 
            background: var(--bg-card); 
            border: 1px solid var(--border); 
            border-radius: var(--radius-md); 
            color: var(--text-main); 
            text-decoration: none; 
            display: flex; 
            align-items: center; 
            gap: 0.5rem; 
            transition: all 0.2s;
            font-weight: 500;
        }
        .quick-link-btn:hover {
            background: rgba(0, 143, 190, 0.05);
            border-color: var(--primary);
            color: var(--primary);
            transform: translateY(-2px);
            box-shadow: var(--shadow-sm);
        }
        </style>
        <section class="quick-links-section" style="margin-top: 1rem; margin-bottom: 3rem; animation: fadeIn 0.5s ease-out;">
            <h3 style="font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 1rem; padding-left: 0.2rem;">Legal &amp; Admin Forms</h3>
            <div style="display: flex; flex-wrap: wrap; gap: 0.75rem;">
                <a href="https://www.jotform.com/sign/260763371107050/invite/01km0dqb2232a24be7490f0a04" target="_blank" class="quick-link-btn">
                    <span>📄</span> Participant Release Form 2026
                </a>
                <a href="https://www.jotform.com/sign/260762990035056/invite/01km0d8mgn4e71c19b68f949e7" target="_blank" class="quick-link-btn">
                    <span>📄</span> Minor Release Form 2026
                </a>
                <a href="https://www.jotform.com/sign/260763146699066/invite/01km0cy3bz5b59e0a83f355ccc" target="_blank" class="quick-link-btn">
                    <span>📍</span> Location Agreement 2026
                </a>
                <a href="https://www.jotform.com/sign/260763666304056/invite/01km0cre8pff83aabb2b02d9b3" target="_blank" class="quick-link-btn">
                    <span>🎞️</span> Footage Agreement 2026
                </a>
                <a href="https://www.jotform.com/sign/260763435351052/invite/01km0djfr7f789223f7dbe66ad" target="_blank" class="quick-link-btn">
                    <span>🎵</span> Music Agreement 2026
                </a>
                <a href="https://www.jotform.com/sign/260802072507046/invite/01kma9gwngb63206105d92078f" target="_blank" class="quick-link-btn">
                    <span>📝</span> Insert Sheet 2026
                </a>
            </div>
        </section>

        <!-- MY STORIES SECTION -->`;

if (htmlContent.includes('<!-- QUICK LINKS SECTION -->')) {
    console.log('Already added');
} else {
    htmlContent = htmlContent.replace('<!-- MY STORIES SECTION -->', quickLinksHtml);
    fs.writeFileSync('frontend/index.html', htmlContent);
    console.log('Added quick links');
}
