const fs = require('fs');

let jsContent = fs.readFileSync('frontend/admin.js', 'utf8');

const oldLogic = `        let storiesHtml = '';
        if (matchingStories.length > 0) {
            storiesHtml += '<div style="margin-top: 1.5rem; border-top: 1px solid #e2e8f0; padding-top: 1.2rem;">';
            storiesHtml += '<h4 style="margin-bottom: 0.8rem; color: var(--text-dark); font-size: 1rem; font-weight: 600;">Stories in this Episode</h4>';
            storiesHtml += '<ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem;">';
            matchingStories.forEach(story => {
                storiesHtml += \`<li style="padding: 0.6rem 0.8rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; display: flex; align-items: center; gap: 0.8rem; transition: border-color 0.2s;"><span class="comm-num" style="font-size: 0.85rem; color: var(--text-light); font-weight: 600; min-width: 45px;">#\${story.commissionNumber || '—'}</span> <a href="proposal?id=\${story.id}&view=admin" target="_blank" class="story-title" style="color: var(--primary); text-decoration: none; font-weight: 500; cursor: pointer; transition: color 0.2s;" onmouseover="this.style.color='var(--primary-dark)'; this.style.textDecoration='underline'" onmouseout="this.style.color='var(--primary)'; this.style.textDecoration='none'">\${story.story_title || 'Untitled'}</a></li>\`;
            });
            storiesHtml += '</ul></div>';
        }

        if (fcc) {
            // Update Title with Metadata from FCC
            if (modalTitle) {
                modalTitle.innerHTML = \`
                    Episode: \${txDate}
                    <div style="font-size: 0.95rem; color: var(--text-light); font-weight: 500; margin-top: 0.4rem; letter-spacing: 0.5px;">
                        UID: \${fcc.uid || '—'} &nbsp;&bull;&nbsp; Season: \${fcc.season || '—'} &nbsp;&bull;&nbsp; Episode: \${fcc.episode || '—'}
                    </div>
                \`;
            }

            // Inject iFrame and Stories
            if (modalList) {
                const token = await window.auth.getIdToken();
                modalList.innerHTML = \`<iframe src="/api/admin/get-file?path=\${encodeURIComponent(fcc.storagePath)}&inline=true&token=\${token}" class="fcc-iframe"></iframe>\` + storiesHtml;
            }
        } else {
            if (modalList) {
                modalList.innerHTML = '<div style="padding: 2.5rem; text-align: center; color: var(--text-muted); background: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1; margin-bottom: 1rem;">No FCC Document has been uploaded for this broadcast yet.</div>' + storiesHtml;
            }
        }`;

const newLogic = `        let storiesHtml = '';
        if (matchingStories.length > 0) {
            storiesHtml += '<div style="margin-bottom: 1.5rem; border-bottom: 1px solid var(--border); padding-bottom: 1.2rem;">';
            storiesHtml += '<h4 style="margin-bottom: 0.8rem; color: var(--text-main); font-size: 1rem; font-weight: 600;">Stories in this Episode</h4>';
            storiesHtml += '<ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem;">';
            matchingStories.forEach(story => {
                storiesHtml += \`<li style="padding: 0.6rem 0.8rem; background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border); border-radius: var(--radius-sm); display: flex; align-items: center; gap: 0.8rem; transition: border-color 0.2s;"><span class="comm-num" style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600; min-width: 45px;">#\${story.commissionNumber || '—'}</span> <a href="proposal?id=\${story.id}&view=admin" target="_blank" class="story-title" style="color: var(--primary); text-decoration: none; font-weight: 500; cursor: pointer; transition: color 0.2s;" onmouseover="this.style.color='var(--primary-hover)'; this.style.textDecoration='underline'" onmouseout="this.style.color='var(--primary)'; this.style.textDecoration='none'">\${story.story_title || 'Untitled'}</a></li>\`;
            });
            storiesHtml += '</ul></div>';
        }

        if (fcc) {
            // Update Title with Metadata from FCC
            if (modalTitle) {
                modalTitle.innerHTML = \`
                    Episode: \${txDate}
                    <div style="font-size: 0.95rem; color: var(--text-muted); font-weight: 500; margin-top: 0.4rem; letter-spacing: 0.5px;">
                        UID: \${fcc.uid || '—'} &nbsp;&bull;&nbsp; Season: \${fcc.season || '—'} &nbsp;&bull;&nbsp; Episode: \${fcc.episode || '—'}
                    </div>
                \`;
            }

            // Inject Stories and then iFrame
            if (modalList) {
                const token = await window.auth.getIdToken();
                modalList.innerHTML = storiesHtml + \`<iframe src="/api/admin/get-file?path=\${encodeURIComponent(fcc.storagePath)}&inline=true&token=\${token}" class="fcc-iframe"></iframe>\`;
            }
        } else {
            if (modalList) {
                modalList.innerHTML = storiesHtml + '<div style="padding: 2.5rem; text-align: center; color: var(--text-muted); background: rgba(255, 255, 255, 0.02); border-radius: var(--radius-md); border: 1px dashed var(--border); margin-bottom: 1rem;">No FCC Document has been uploaded for this broadcast yet.</div>';
            }
        }`;

if (jsContent.includes(oldLogic)) {
    jsContent = jsContent.replace(oldLogic, newLogic);
} else {
    jsContent = jsContent.replace(oldLogic.replace(/\n/g, '\r\n'), newLogic);
}

fs.writeFileSync('frontend/admin.js', jsContent);
console.log('Fixed JS logic for modal arrangement and styling');
