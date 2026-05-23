const fs = require('fs');
let content = fs.readFileSync('frontend/admin_dashboard.html', 'utf8');

const target1 = `    <div class="dashboard-container wide">`;
const replacement1 = `    <div class="admin-layout-wrapper">
        <aside class="episodes-sidebar">
            <h3>Episodes</h3>
            <ul id="episodesSidebarList" class="episodes-list">
                <!-- Populated by JS -->
            </ul>
        </aside>

        <div class="dashboard-container wide admin-main-content">`;

content = content.replace(target1, replacement1);

// We need to close the `admin-layout-wrapper` at the very end of the document
// The last few lines of the document are likely closing tags:
const target2 = `    </div>

    <!-- Firebase SDKs -->`;
const replacement2 = `        </div>
    </div> <!-- /admin-layout-wrapper -->

    <!-- Firebase SDKs -->`;
content = content.replace(target2, replacement2);

fs.writeFileSync('frontend/admin_dashboard.html', content);
console.log('Patched HTML');
