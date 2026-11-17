import type { ImageInput } from '../src';

/** Grayscale image: background 0.2, a filled rectangle of 0.9 from (x0, y0) to (x1, y1) inclusive. */
export function rectangleImage(width: number, height: number, x0: number, y0: number, x1: number, y1: number): ImageInput {
    const data = new Float32Array(width * height).fill(0.2);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) data[y * width + x] = 0.9;
    return { data, width, height, window: { center: 0.5, width: 1 } };
}

/** Distance from (x, y) to the outline of the rectangle (x0, y0)–(x1, y1). */
export function distanceToRectOutline(x: number, y: number, x0: number, y0: number, x1: number, y1: number): number {
    const inside = x >= x0 && x <= x1 && y >= y0 && y <= y1;
    if (inside) return Math.min(x - x0, x1 - x, y - y0, y1 - y);
    const dx = Math.max(x0 - x, 0, x - x1);
    const dy = Math.max(y0 - y, 0, y - y1);
    return Math.hypot(dx, dy);
}
