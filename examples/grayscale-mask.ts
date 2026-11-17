// Tracing 16-bit grayscale data (a synthetic CT-like slice) without any browser, and turning
// the outline into a segmentation mask.
//
//   pnpm build
//   node --experimental-strip-types examples/grayscale-mask.ts

import { createScissors, polygonArea, polygonToMask, ScissorsSession } from 'intelligent-scissors';

const width = 128;
const height = 96;

// Soft tissue at ~40 HU, an elliptical "organ" at ~120 HU, plus noise
const slice = new Int16Array(width * height);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        const inside = ((x - 64) / 36) ** 2 + ((y - 48) / 24) ** 2 <= 1;
        slice[y * width + x] = (inside ? 120 : 40) + Math.round((Math.random() - 0.5) * 30);
    }
}

const scissors = createScissors(
    { data: slice, width, height, window: { center: 80, width: 200 } },
    { sigma: 1.5 },
);

// Normally these clicks come from the user. Four rough points near the boundary are enough;
// the session snaps them onto the edge and the paths in between follow it.
const session = new ScissorsSession(scissors, { snapRadius: 4 });
session.click({ x: 29, y: 47 });
session.click({ x: 64, y: 25 });
session.click({ x: 99, y: 49 });
session.click({ x: 63, y: 71 });
const polygon = session.close()!;

const mask = polygonToMask(polygon, width, height);
const maskPixels = mask.reduce((sum, v) => sum + v, 0);

console.log(`outline: ${polygon.length} points, enclosed area ${polygonArea(polygon).toFixed(0)} px²`);
console.log(`mask: ${maskPixels} px (true ellipse: ${(Math.PI * 36 * 24).toFixed(0)} px²)\n`);

// Coarse preview, every 4th pixel
for (let y = 0; y < height; y += 4) {
    let row = '';
    for (let x = 0; x < width; x += 2) row += mask[y * width + x] ? '#' : '.';
    console.log(row);
}
