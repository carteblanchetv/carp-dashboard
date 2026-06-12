const fs = require('fs');
const PNG = require('pngjs').PNG;

function findButtons(imagePath) {
    const data = fs.readFileSync(imagePath);
    const png = PNG.sync.read(data);
    const width = png.width;
    const height = png.height;

    // We search for border colors of the three buttons:
    // 1. Footage Declaration: orange border (#f59e0b) -> rgb(245, 158, 11)
    // 2. Call Sheet: green border (#10b981) -> rgb(16, 185, 129)
    // 3. Final Script: purple border (#7c3aed) -> rgb(124, 58, 237)

    const matches = {
        footage: { xMin: width, xMax: 0, yMin: height, yMax: 0 },
        callsheet: { xMin: width, xMax: 0, yMin: height, yMax: 0 },
        script: { xMin: width, xMax: 0, yMin: height, yMax: 0 }
    };

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (width * y + x) << 2;
            const r = png.data[idx];
            const g = png.data[idx + 1];
            const b = png.data[idx + 2];

            // Match orange (Footage Declaration)
            if (Math.abs(r - 245) < 30 && Math.abs(g - 158) < 30 && Math.abs(b - 11) < 30) {
                matches.footage.xMin = Math.min(matches.footage.xMin, x);
                matches.footage.xMax = Math.max(matches.footage.xMax, x);
                matches.footage.yMin = Math.min(matches.footage.yMin, y);
                matches.footage.yMax = Math.max(matches.footage.yMax, y);
            }

            // Match green (Call Sheet)
            if (Math.abs(r - 16) < 30 && Math.abs(g - 185) < 30 && Math.abs(b - 129) < 30) {
                matches.callsheet.xMin = Math.min(matches.callsheet.xMin, x);
                matches.callsheet.xMax = Math.max(matches.callsheet.xMax, x);
                matches.callsheet.yMin = Math.min(matches.callsheet.yMin, y);
                matches.callsheet.yMax = Math.max(matches.callsheet.yMax, y);
            }

            // Match purple (Final Script)
            if (Math.abs(r - 124) < 30 && Math.abs(g - 58) < 30 && Math.abs(b - 237) < 30) {
                matches.script.xMin = Math.min(matches.script.xMin, x);
                matches.script.xMax = Math.max(matches.script.xMax, x);
                matches.script.yMin = Math.min(matches.script.yMin, y);
                matches.script.yMax = Math.max(matches.script.yMax, y);
            }
        }
    }

    console.log(`--- ${imagePath} (${width}x${height}) ---`);
    for (const [key, val] of Object.entries(matches)) {
        if (val.xMax >= val.xMin) {
            const leftPct = ((val.xMin / width) * 100).toFixed(2);
            const topPct = ((val.yMin / height) * 100).toFixed(2);
            const widthPct = (((val.xMax - val.xMin) / width) * 100).toFixed(2);
            const heightPct = (((val.yMax - val.yMin) / height) * 100).toFixed(2);
            console.log(`${key}: left: ${leftPct}%, top: ${topPct}%, width: ${widthPct}%, height: ${heightPct}% (px: x: ${val.xMin}-${val.xMax}, y: ${val.yMin}-${val.yMax})`);
        } else {
            console.log(`${key}: Not detected`);
        }
    }
}

findButtons('frontend/assets/Nav_Bar.png');
findButtons('frontend/assets/Nav_Bar_light.png');
