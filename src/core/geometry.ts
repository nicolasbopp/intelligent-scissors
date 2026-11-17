import type { Point } from './types';

/**
 * Ramer–Douglas–Peucker simplification. Live-wire paths have one point per pixel; this
 * keeps the shape within `tolerance` pixels using far fewer vertices.
 */
export function simplifyPath(points: readonly Point[], tolerance: number): Point[] {
    if (points.length <= 2 || tolerance <= 0) return points.slice();
    const keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    const tol2 = tolerance * tolerance;
    const stack: [number, number][] = [[0, points.length - 1]];

    while (stack.length > 0) {
        const [first, last] = stack.pop()!;
        const a = points[first];
        const b = points[last];
        let maxD = -1;
        let index = -1;
        for (let i = first + 1; i < last; i++) {
            const d = segmentDistanceSq(points[i], a, b);
            if (d > maxD) {
                maxD = d;
                index = i;
            }
        }
        if (index >= 0 && maxD > tol2) {
            keep[index] = 1;
            stack.push([first, index], [index, last]);
        }
    }
    return points.filter((_, i) => keep[i] === 1);
}

function segmentDistanceSq(p: Point, a: Point, b: Point): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = a.x + t * dx - p.x;
    const ey = a.y + t * dy - p.y;
    return ex * ex + ey * ey;
}

/**
 * Fills a closed polygon into a binary mask (1 = inside), row-major, `width × height`.
 * A pixel is inside when its centre is inside (even-odd rule); the outline pixels
 * themselves are always included, so a traced contour never loses its boundary.
 */
export function polygonToMask(polygon: readonly Point[], width: number, height: number): Uint8Array {
    const mask = new Uint8Array(width * height);
    const n = polygon.length;
    if (n === 0) return mask;

    if (n >= 3) {
        const xs: number[] = [];
        for (let y = 0; y < height; y++) {
            xs.length = 0;
            for (let i = 0, j = n - 1; i < n; j = i++) {
                const a = polygon[i];
                const b = polygon[j];
                if ((a.y > y) !== (b.y > y)) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
            }
            xs.sort((p, q) => p - q);
            for (let k = 0; k + 1 < xs.length; k += 2) {
                const from = Math.max(0, Math.ceil(xs[k]));
                const to = Math.min(width - 1, Math.floor(xs[k + 1]));
                for (let x = from; x <= to; x++) mask[y * width + x] = 1;
            }
        }
    }

    for (const p of polygon) {
        const x = Math.round(p.x);
        const y = Math.round(p.y);
        if (x >= 0 && y >= 0 && x < width && y < height) mask[y * width + x] = 1;
    }
    return mask;
}

/** Enclosed area in px² (shoelace formula), independent of winding order. */
export function polygonArea(polygon: readonly Point[]): number {
    let sum = 0;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        sum += (polygon[j].x - polygon[i].x) * (polygon[j].y + polygon[i].y);
    }
    return Math.abs(sum) / 2;
}
