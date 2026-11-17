import { describe, expect, it } from 'vitest';
import { createScissors, IntelligentScissors } from '../src';
import { distanceToRectOutline, rectangleImage } from './helpers';

const R = { x0: 20, y0: 15, x1: 79, y1: 64 };
const image = rectangleImage(100, 80, R.x0, R.y0, R.x1, R.y1);

describe('IntelligentScissors', () => {
    it('follows the edge around a corner instead of cutting across', () => {
        const scissors = createScissors(image);
        // Two points on adjacent sides: the straight line would cut through the rectangle
        scissors.setSeed({ x: 20, y: 50 });
        const path = scissors.pathTo({ x: 60, y: 15 });

        expect(path[0]).toEqual({ x: 20, y: 50 });
        expect(path[path.length - 1]).toEqual({ x: 60, y: 15 });
        for (const p of path) {
            expect(distanceToRectOutline(p.x, p.y, R.x0, R.y0, R.x1, R.y1)).toBeLessThanOrEqual(1.5);
        }
    });

    it('returns 8-connected paths', () => {
        const scissors = createScissors(image);
        scissors.setSeed({ x: 5, y: 5 });
        const path = scissors.pathTo({ x: 90, y: 70 });
        for (let i = 1; i < path.length; i++) {
            expect(Math.abs(path[i].x - path[i - 1].x)).toBeLessThanOrEqual(1);
            expect(Math.abs(path[i].y - path[i - 1].y)).toBeLessThanOrEqual(1);
        }
    });

    it('gives the same path whether the search was resumed or started fresh', () => {
        const incremental = createScissors(image);
        incremental.setSeed({ x: 20, y: 30 });
        incremental.pathTo({ x: 22, y: 31 }); // small expansion first
        const resumed = incremental.pathTo({ x: 79, y: 60 });

        const fresh = new IntelligentScissors(incremental.costMap);
        fresh.setSeed({ x: 20, y: 30 });
        expect(fresh.pathTo({ x: 79, y: 60 })).toEqual(resumed);
    });

    it('clamps out-of-bounds points and requires a seed', () => {
        const scissors = createScissors(image);
        expect(() => scissors.pathTo({ x: 1, y: 1 })).toThrow(/setSeed/);
        scissors.setSeed({ x: -10, y: 500 });
        expect(scissors.seed).toEqual({ x: 0, y: 79 });
    });

    it('snaps to the nearest strong edge', () => {
        const scissors = createScissors(image);
        const snapped = scissors.snap({ x: 24, y: 40 }, 6);
        expect(distanceToRectOutline(snapped.x, snapped.y, R.x0, R.y0, R.x1, R.y1)).toBeLessThanOrEqual(1);
        expect(scissors.snap({ x: 50, y: 40 }, 0)).toEqual({ x: 50, y: 40 });
    });
});
