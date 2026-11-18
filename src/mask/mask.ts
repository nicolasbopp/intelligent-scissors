/** A binary mask, row by row from the top-left. Any non-zero value counts as inside. */
export type Mask = ArrayLike<number>;

/** Number of pixels in the mask. */
export function maskArea(mask: Mask): number {
    let area = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i]) area++;
    return area;
}

/**
 * Intersection over union of two masks of the same size: 1 for identical masks, 0 for masks
 * that don't overlap. Two empty masks give 1.
 */
export function maskIoU(a: Mask, b: Mask): number {
    if (a.length !== b.length) {
        throw new Error(`intelligent-scissors: masks differ in size (${a.length} and ${b.length} pixels)`);
    }
    let intersection = 0;
    let union = 0;
    for (let i = 0; i < a.length; i++) {
        if (a[i] && b[i]) intersection++;
        if (a[i] || b[i]) union++;
    }
    return union === 0 ? 1 : intersection / union;
}

export interface Bounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * The smallest rectangle that holds every pixel of the mask, or `null` for an empty mask.
 * `[x, y, width, height]` of the result is the `bbox` of a COCO annotation.
 */
export function maskBounds(mask: Mask, width: number, height: number): Bounds | null {
    let x0 = width;
    let y0 = height;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (!mask[y * width + x]) continue;
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            y1 = y;
        }
    }
    return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}
