import { polygonArea, simplifyPath } from '../core/geometry';
import type { Point } from '../core/types';
import type { Mask } from './mask';

export interface ContourOptions {
    /**
     * Simplifies each outline with this tolerance in pixels. Traced outlines have one point
     * per boundary pixel; 0.5 to 1 removes most of them. Default `0` (off).
     */
    simplify?: number;
    /** Regions with fewer pixels than this are skipped, to drop specks. Default `1`. */
    minPixels?: number;
}

// The eight neighbours, clockwise on screen (y points down), starting in the west
const DX = [-1, -1, 0, 1, 1, 1, 0, -1];
const DY = [0, -1, -1, -1, 0, 1, 1, 1];

/**
 * Outlines of the regions in a mask, one polygon per 8-connected region, in the order the
 * regions appear from the top. The points are pixel centres on the region's boundary, as in
 * a traced path, so `polygonToMask` turns an outline back into the region.
 *
 * Only the outer boundary is traced. Holes are not represented and come back filled; if
 * they matter, store the mask as RLE instead.
 */
export function maskToPolygons(mask: Mask, width: number, height: number, options: ContourOptions = {}): Point[][] {
    if (mask.length !== width * height) {
        throw new Error(`intelligent-scissors: mask length ${mask.length} does not match ${width}×${height}`);
    }
    const tolerance = options.simplify ?? 0;
    const minPixels = options.minPixels ?? 1;
    const seen = new Uint8Array(mask.length);
    const polygons: Point[][] = [];

    for (let start = 0; start < mask.length; start++) {
        if (!mask[start] || seen[start]) continue;
        // In scan order, the first pixel of a region is its top-left one: nothing of the region
        // lies above it or to its left, which is what the boundary walk relies on
        if (markRegion(mask, seen, width, height, start) < minPixels) continue;
        const outline = traceBoundary(mask, width, height, start);
        polygons.push(tolerance > 0 ? simplifyClosed(outline, tolerance) : outline);
    }
    return polygons;
}

/** Marks the 8-connected region containing `start` as seen and returns its pixel count. */
function markRegion(mask: Mask, seen: Uint8Array, width: number, height: number, start: number): number {
    const stack = [start];
    seen[start] = 1;
    let count = 0;
    while (stack.length > 0) {
        const p = stack.pop()!;
        count++;
        const px = p % width;
        const py = (p - px) / width;
        for (let d = 0; d < 8; d++) {
            const x = px + DX[d];
            const y = py + DY[d];
            if (x < 0 || y < 0 || x >= width || y >= height) continue;
            const q = y * width + x;
            if (mask[q] && !seen[q]) {
                seen[q] = 1;
                stack.push(q);
            }
        }
    }
    return count;
}

/**
 * Moore-neighbour tracing: walks clockwise around the region, always turning as far towards
 * the outside as possible. Stops when the walk is about to repeat its first step.
 */
function traceBoundary(mask: Mask, width: number, height: number, start: number): Point[] {
    const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && !!mask[y * width + x];
    const startX = start % width;
    const startY = (start - startX) / width;
    const outline: Point[] = [];

    let x = startX;
    let y = startY;
    // Direction of the last neighbour known to be outside; the pixel west of the start is
    let outsideDir = 0;
    let firstStep = -1;

    for (;;) {
        let step = -1;
        for (let k = 1; k <= 8; k++) {
            const d = (outsideDir + k) % 8;
            if (inside(x + DX[d], y + DY[d])) {
                step = d;
                break;
            }
        }
        if (step < 0) return [{ x, y }]; // a single pixel

        if (x === startX && y === startY) {
            if (step === firstStep) return outline;
            if (firstStep < 0) firstStep = step;
        }
        outline.push({ x, y });
        x += DX[step];
        y += DY[step];
        // Seen from the new pixel, the neighbour checked just before the step is outside
        outsideDir = (step + (step % 2 === 0 ? 6 : 5)) % 8;
    }
}

/** Simplifies a closed outline, keeping the point furthest from the first as a second fixed end. */
function simplifyClosed(points: Point[], tolerance: number): Point[] {
    if (points.length < 4) return points;
    let far = 0;
    let farDistance = -1;
    for (let i = 1; i < points.length; i++) {
        const d = (points[i].x - points[0].x) ** 2 + (points[i].y - points[0].y) ** 2;
        if (d > farDistance) {
            farDistance = d;
            far = i;
        }
    }
    const there = simplifyPath(points.slice(0, far + 1), tolerance);
    const back = simplifyPath([...points.slice(far), points[0]], tolerance);
    const result = [...there, ...back.slice(1, -1)];
    // A sliver can collapse to a line; the original outline is the better answer then
    return polygonArea(result) > 0 || polygonArea(points) === 0 ? result : points;
}
