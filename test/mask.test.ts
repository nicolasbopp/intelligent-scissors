import { describe, expect, it } from 'vitest';
import { decodeRle, encodeRle, maskArea, maskBounds, maskIoU, maskToPolygons, polygonToMask } from '../src/mask';

/** Builds a mask from rows of text: `#` is inside, anything else outside. */
function fromRows(rows: string[]) {
    const width = rows[0].length;
    const height = rows.length;
    const mask = new Uint8Array(width * height);
    rows.forEach((row, y) => [...row].forEach((c, x) => (mask[y * width + x] = c === '#' ? 1 : 0)));
    return { mask, width, height };
}

function random(seed: number) {
    return () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 2 ** 32;
    };
}

/** A few overlapping discs: irregular regions with concave parts, sometimes several. */
function blobs(width: number, height: number, seed: number): Uint8Array {
    const rand = random(seed);
    const mask = new Uint8Array(width * height);
    for (let n = 0; n < 5; n++) {
        const cx = rand() * width;
        const cy = rand() * height;
        const r = 2 + rand() * 7;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) mask[y * width + x] = 1;
        }
    }
    return mask;
}

/** The mask with every hole filled: everything the background can't reach from the border. */
function fillHoles(mask: Uint8Array, width: number, height: number): Uint8Array {
    const outside = new Uint8Array(mask.length);
    const stack: number[] = [];
    const visit = (x: number, y: number) => {
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        const i = y * width + x;
        if (mask[i] || outside[i]) return;
        outside[i] = 1;
        stack.push(i);
    };
    for (let x = 0; x < width; x++) (visit(x, 0), visit(x, height - 1));
    for (let y = 0; y < height; y++) (visit(0, y), visit(width - 1, y));
    while (stack.length > 0) {
        const i = stack.pop()!;
        const x = i % width;
        const y = (i - x) / width;
        (visit(x - 1, y), visit(x + 1, y), visit(x, y - 1), visit(x, y + 1));
    }
    return outside.map(v => 1 - v);
}

describe('maskToPolygons', () => {
    it('traces a rectangle clockwise from its top-left pixel', () => {
        const { mask, width, height } = fromRows([
            '......',
            '.###..',
            '.###..',
            '......',
        ]);
        expect(maskToPolygons(mask, width, height)).toEqual([[
            { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 },
            { x: 3, y: 2 }, { x: 2, y: 2 }, { x: 1, y: 2 },
        ]]);
    });

    it('returns one outline per region and handles single pixels and thin lines', () => {
        const { mask, width, height } = fromRows([
            '#....#',
            '.....#',
            '.##..#',
            '...#..',
        ]);
        const polygons = maskToPolygons(mask, width, height);
        expect(polygons.length).toBe(3);
        expect(polygons[0]).toEqual([{ x: 0, y: 0 }]);
        // A line is walked down one side and back up the other
        expect(polygons[1]).toEqual([{ x: 5, y: 0 }, { x: 5, y: 1 }, { x: 5, y: 2 }, { x: 5, y: 1 }]);
        // Diagonal neighbours belong to the same region
        expect(polygons[2]).toEqual([{ x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 3 }, { x: 2, y: 2 }]);
    });

    it('gives outlines that fill back into the same regions, holes aside', () => {
        const width = 40;
        const height = 30;
        for (let seed = 1; seed <= 25; seed++) {
            const mask = blobs(width, height, seed);
            const filled = new Uint8Array(mask.length);
            for (const polygon of maskToPolygons(mask, width, height)) {
                polygonToMask(polygon, width, height).forEach((v, i) => (filled[i] ||= v));
            }
            expect(filled, `seed ${seed}`).toEqual(fillHoles(mask, width, height));
        }
    });

    it('skips small regions and simplifies on request', () => {
        const { mask, width, height } = fromRows([
            '#.........',
            '..######..',
            '..######..',
            '..######..',
            '..######..',
        ]);
        const polygons = maskToPolygons(mask, width, height, { minPixels: 2, simplify: 0.5 });
        expect(polygons).toEqual([[{ x: 2, y: 1 }, { x: 7, y: 1 }, { x: 7, y: 4 }, { x: 2, y: 4 }]]);
    });

    it('rejects a mask of the wrong size', () => {
        expect(() => maskToPolygons(new Uint8Array(10), 4, 4)).toThrow(/does not match/);
    });
});

describe('COCO RLE', () => {
    // The expected encodings of this mask come from pycocotools (mask.encode)
    const sample = fromRows([
        '.##...',
        '.##..#',
        '.....#',
        '####.#',
    ]);

    it('writes runs down the columns, starting with the outside', () => {
        const rle = encodeRle(sample.mask, sample.width, sample.height);
        expect(rle).toEqual({ size: [4, 6], counts: [3, 3, 1, 3, 1, 1, 3, 1, 5, 3] });
    });

    it('writes and reads the compact string the way pycocotools does', () => {
        const rle = encodeRle(sample.mask, sample.width, sample.height, { compress: true });
        expect(rle.counts).toBe('33100N2022');
        expect(decodeRle({ size: [4, 6], counts: '33100N2022' }).mask).toEqual(sample.mask);
    });

    it('survives a round trip in both forms', () => {
        for (let seed = 1; seed <= 10; seed++) {
            const mask = blobs(37, 23, seed);
            for (const compress of [false, true]) {
                const rle = encodeRle(mask, 37, 23, { compress });
                expect(typeof rle.counts).toBe(compress ? 'string' : 'object');
                expect(decodeRle(rle)).toEqual({ mask, width: 37, height: 23 });
            }
        }
    });

    it('handles empty and full masks', () => {
        expect(encodeRle(new Uint8Array(6), 3, 2).counts).toEqual([6]);
        expect(encodeRle(new Uint8Array(6).fill(1), 3, 2).counts).toEqual([0, 6]);
        expect(maskArea(decodeRle({ size: [2, 3], counts: [0, 6] }).mask)).toBe(6);
    });

    it('rejects runs that do not fit the size', () => {
        expect(() => decodeRle({ size: [2, 3], counts: [4, 4] })).toThrow(/do not fit/);
        expect(() => decodeRle({ size: [2, 3], counts: [2, 2] })).toThrow(/cover 4 pixels/);
    });
});

describe('mask measures', () => {
    const a = fromRows(['##..', '##..', '....']);
    const b = fromRows(['.##.', '.##.', '....']);

    it('counts pixels', () => {
        expect(maskArea(a.mask)).toBe(4);
    });

    it('computes intersection over union', () => {
        expect(maskIoU(a.mask, a.mask)).toBe(1);
        expect(maskIoU(a.mask, b.mask)).toBeCloseTo(2 / 6);
        expect(maskIoU(a.mask, new Uint8Array(12))).toBe(0);
        expect(maskIoU(new Uint8Array(12), new Uint8Array(12))).toBe(1);
    });

    it('finds the bounding box', () => {
        expect(maskBounds(b.mask, 4, 3)).toEqual({ x: 1, y: 0, width: 2, height: 2 });
        expect(maskBounds(new Uint8Array(12), 4, 3)).toBeNull();
    });
});
