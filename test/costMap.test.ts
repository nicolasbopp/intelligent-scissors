import { describe, expect, it } from 'vitest';
import { computeCostMap, costMapToRGBA, linkCost } from '../src';
import { rectangleImage } from './helpers';

describe('computeCostMap', () => {
    const image = rectangleImage(40, 40, 10, 10, 29, 29);
    const map = computeCostMap(image);
    const at = (x: number, y: number) => y * 40 + x;

    it('makes the rectangle boundary cheaper than flat regions', () => {
        expect(map.gradientCost[at(10, 20)]).toBeLessThan(0.2);
        expect(map.gradientCost[at(20, 20)]).toBeCloseTo(1, 5);
        expect(map.gradientCost[at(2, 2)]).toBeCloseTo(1, 5);
    });

    it('marks a zero crossing next to each edge, none in flat regions', () => {
        const row = Array.from({ length: 40 }, (_, x) => map.laplacianCost[at(x, 20)]);
        expect(row.slice(8, 13)).toContain(0);
        expect(row.slice(27, 32)).toContain(0);
        expect(row[20]).toBe(1);
        expect(row[2]).toBe(1);
    });

    it('prefers links along an edge over links across it', () => {
        const along = linkCost(map, at(10, 20), at(10, 21), 0, 1);
        const across = linkCost(map, at(10, 20), at(11, 20), 1, 0);
        expect(along).toBeLessThan(across);
    });

    it('accepts RGBA data (e.g. ImageData)', () => {
        const rgba = new Uint8ClampedArray(40 * 40 * 4);
        for (let i = 0; i < 40 * 40; i++) {
            const v = Math.round((image.data[i] as number) * 255);
            rgba.set([v, v, v, 255], i * 4);
        }
        const fromRgba = computeCostMap({ data: rgba, width: 40, height: 40 });
        expect(fromRgba.gradientCost[at(10, 20)]).toBeCloseTo(map.gradientCost[at(10, 20)], 1);
    });

    it('rejects data of the wrong length', () => {
        expect(() => computeCostMap({ data: new Uint8Array(10), width: 4, height: 4 })).toThrow(/data length/);
    });

    it('renders a debug image', () => {
        const rgba = costMapToRGBA(map);
        expect(rgba.length).toBe(40 * 40 * 4);
        expect(rgba[at(20, 20) * 4]).toBeGreaterThan(rgba[at(10, 20) * 4]);
    });
});
