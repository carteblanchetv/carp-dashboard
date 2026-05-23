const fs = require('fs');

let cssContent = fs.readFileSync('frontend/style.css', 'utf8');

const oldCss = `.col-story-title {
    width: 45%;
    min-width: 250px;
}`;

const newCss = `.col-story-title {
    width: 55% !important;
    min-width: 400px !important;
    text-align: left !important;
}
.data-table td:nth-child(2) {
    text-align: left !important;
}`;

if (cssContent.includes(oldCss)) {
    cssContent = cssContent.replace(oldCss, newCss);
} else {
    cssContent = cssContent.replace(oldCss.replace(/\n/g, '\r\n'), newCss);
}

fs.writeFileSync('frontend/style.css', cssContent);

// Wait, the "Story Title" column isn't always nth-child(2).
// In Delivered, it's nth-child(3).
// In Pending, it's nth-child(2).
// Let's modify admin.js to inject class="col-story-title" into the <td> for story titles.

let jsContent = fs.readFileSync('frontend/admin.js', 'utf8');

const replaceAll = (str, find, replace) => {
    return str.split(find).join(replace);
};

// Pending table
jsContent = replaceAll(jsContent, 
    `<td data-label="Story Title"><a href="proposal?id=\${p.id}&view=admin" class="story-title-link">\${p.story_title}</a></td>`, 
    `<td data-label="Story Title" class="col-story-title"><a href="proposal?id=\${p.id}&view=admin" class="story-title-link">\${p.story_title}</a></td>`
);

// Commissioned table
jsContent = replaceAll(jsContent, 
    `<td data-label="Story Title">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <a href="proposal?id=\${p.id}&view=admin" class="story-title-link">\${p.story_title}</a>`, 
    `<td data-label="Story Title" class="col-story-title">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <a href="proposal?id=\${p.id}&view=admin" class="story-title-link">\${p.story_title}</a>`
);

// Delivered table
jsContent = replaceAll(jsContent, 
    `<td data-label="Story Title"><a href="proposal?id=\${p.id}&view=admin" class="story-title-link">\${p.story_title}</a></td>`, 
    `<td data-label="Story Title" class="col-story-title"><a href="proposal?id=\${p.id}&view=admin" class="story-title-link">\${p.story_title}</a></td>`
);

// Decommissioned table
jsContent = replaceAll(jsContent, 
    `<td data-label="Story Title"><a href="proposal?id=\${p.id}&view=admin" class="story-title-link">\${p.story_title}</a></td>`, 
    `<td data-label="Story Title" class="col-story-title"><a href="proposal?id=\${p.id}&view=admin" class="story-title-link">\${p.story_title}</a></td>`
);

fs.writeFileSync('frontend/admin.js', jsContent);
console.log('Fixed Story Title column width with !important and <td> classes');
