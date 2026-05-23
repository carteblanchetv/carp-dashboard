const fs = require('fs');
let jsContent = fs.readFileSync('frontend/admin.js', 'utf8');

const oldLi = `li.innerHTML = \`<span class="comm-num">#\${story.commissionNumber || '—'}</span> <span class="story-title">\${story.story_title || 'Untitled'}</span>\`;`;
const newLi = `li.innerHTML = \`<span class="comm-num">#\${story.commissionNumber || '—'}</span> <a href="proposal?id=\${story.id}&view=preview" class="story-title" style="color: var(--primary); text-decoration: underline; font-weight: 500; cursor: pointer;">\${story.story_title || 'Untitled'}</a>\`;`;

if (jsContent.includes(oldLi)) {
    jsContent = jsContent.replace(oldLi, newLi);
} else {
    jsContent = jsContent.replace(oldLi.replace(/\n/g, '\r\n'), newLi);
}

fs.writeFileSync('frontend/admin.js', jsContent);
console.log('Made titles clickable');
