/**
 * From a traced outline to a COCO annotation, and from a mask back to outlines.
 * Runs in Node: `node --experimental-strip-types examples/coco-export.ts` (after `pnpm build`).
 */
import { createScissors, ScissorsSession } from 'intelligent-scissors';
import {
    decodeRle, encodeRle, maskArea, maskBounds, maskIoU, maskToPolygons, polygonToMask,
} from 'intelligent-scissors/mask';

// A bright disc on a dark background stands in for a real image
const width = 120;
const height = 90;
const data = new Float32Array(width * height);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[y * width + x] = Math.hypot(x - 60, y - 45) < 28 ? 0.9 : 0.1;
}

// Trace it with four clicks
const session = new ScissorsSession(createScissors({ data, width, height }));
for (const [x, y] of [[32, 45], [60, 17], [88, 45], [60, 73]]) session.click({ x, y });
const polygon = session.close()!;

// The traced outline as a COCO annotation with an RLE mask
const mask = polygonToMask(polygon, width, height);
const bounds = maskBounds(mask, width, height)!;
const annotation = {
    id: 1,
    image_id: 1,
    category_id: 1,
    iscrowd: 1, // COCO stores RLE masks with iscrowd 1 and polygons with iscrowd 0
    segmentation: encodeRle(mask, width, height, { compress: true }),
    area: maskArea(mask),
    bbox: [bounds.x, bounds.y, bounds.width, bounds.height],
};
console.log(JSON.stringify(annotation));

// The other way: a mask from a model becomes outlines you can draw or edit
const fromModel = decodeRle(annotation.segmentation).mask;
const outlines = maskToPolygons(fromModel, width, height, { simplify: 0.75 });
console.log(`${outlines.length} outline with ${outlines[0].length} points instead of ${polygon.length}`);

// The simplified outline still covers nearly the same pixels
const again = polygonToMask(outlines[0], width, height);
console.log(`IoU after simplifying: ${maskIoU(mask, again).toFixed(3)}`);
