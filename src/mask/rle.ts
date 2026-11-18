import type { Mask } from './mask';

/**
 * A mask in the run-length format of the COCO dataset, as read and written by pycocotools.
 * The runs go down the columns, not along the rows, and alternate between outside and
 * inside, starting with outside (so the first count is 0 if the top-left pixel is inside).
 */
export interface CocoRle {
    /** `[height, width]`, in that order. */
    size: [number, number];
    /** The run lengths as numbers ("uncompressed RLE") or as COCO's compact string. */
    counts: number[] | string;
}

export interface RleOptions {
    /**
     * Writes `counts` as the compact string that pycocotools produces with `encode()`,
     * instead of an array of numbers. Default `false`.
     */
    compress?: boolean;
}

/** Encodes a mask as COCO RLE. */
export function encodeRle(mask: Mask, width: number, height: number, options: RleOptions = {}): CocoRle {
    if (mask.length !== width * height) {
        throw new Error(`intelligent-scissors: mask length ${mask.length} does not match ${width}×${height}`);
    }
    const counts: number[] = [];
    let inside = false;
    let run = 0;
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            if (!!mask[y * width + x] !== inside) {
                counts.push(run);
                run = 0;
                inside = !inside;
            }
            run++;
        }
    }
    counts.push(run);
    return { size: [height, width], counts: options.compress ? countsToString(counts) : counts };
}

/** Decodes COCO RLE, with either kind of `counts`, into a mask of 0 and 1. */
export function decodeRle(rle: CocoRle): { mask: Uint8Array; width: number; height: number } {
    const [height, width] = rle.size;
    const counts = typeof rle.counts === 'string' ? countsFromString(rle.counts) : rle.counts;
    const mask = new Uint8Array(width * height);

    let position = 0; // counts pixels down the columns
    let inside = false;
    for (const run of counts) {
        if (run < 0 || position + run > mask.length) {
            throw new Error(`intelligent-scissors: the RLE runs do not fit a ${width}×${height} mask`);
        }
        if (inside) {
            for (let i = position; i < position + run; i++) {
                const x = Math.floor(i / height);
                mask[(i - x * height) * width + x] = 1;
            }
        }
        position += run;
        inside = !inside;
    }
    if (position !== mask.length) {
        throw new Error(`intelligent-scissors: the RLE runs cover ${position} pixels, the mask has ${mask.length}`);
    }
    return { mask, width, height };
}

/*
 * COCO's string form (rleToString in pycocotools' maskApi.c): from the fourth count on, a
 * count is stored as the difference to the one two places before it. Each number is then
 * written in groups of five bits, lowest first, one character per group: bit 5 says that
 * another group follows, and the character is the group plus 48.
 */
function countsToString(counts: number[]): string {
    let out = '';
    for (let i = 0; i < counts.length; i++) {
        let x = i > 2 ? counts[i] - counts[i - 2] : counts[i];
        let more = true;
        while (more) {
            let group = ((x % 32) + 32) % 32;
            x = Math.floor(x / 32);
            // The fifth bit of the last group is the sign, so stop once the rest is all sign
            more = group & 0x10 ? x !== -1 : x !== 0;
            if (more) group |= 0x20;
            out += String.fromCharCode(group + 48);
        }
    }
    return out;
}

function countsFromString(text: string): number[] {
    const counts: number[] = [];
    let p = 0;
    while (p < text.length) {
        let x = 0;
        let scale = 1;
        let more = true;
        while (more) {
            if (p >= text.length) throw new Error('intelligent-scissors: the RLE string ends in the middle of a number');
            const group = text.charCodeAt(p++) - 48;
            x += (group & 0x1f) * scale;
            scale *= 32;
            more = (group & 0x20) !== 0;
            if (!more && group & 0x10) x -= scale;
        }
        if (counts.length > 2) x += counts[counts.length - 2];
        counts.push(x);
    }
    return counts;
}
