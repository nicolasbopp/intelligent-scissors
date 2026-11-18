import { describe, expect, it } from 'vitest';
import { computeCostMap, IntelligentScissors, linkCost, type CostMap, type Point } from '../src';

/** Small deterministic generator, so a failure can be reproduced. */
function random(seed: number) {
    return () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 2 ** 32;
    };
}

function noiseImage(width: number, height: number, seed: number) {
    const rand = random(seed);
    const data = new Float32Array(width * height);
    for (let i = 0; i < data.length; i++) data[i] = rand();
    return { data, width, height };
}

/** Textbook Dijkstra without a heap: slow, but too simple to get wrong. */
function referenceDistances(map: CostMap, seed: number): Float64Array {
    const n = map.width * map.height;
    const dist = new Float64Array(n).fill(Infinity);
    const done = new Uint8Array(n);
    dist[seed] = 0;
    for (;;) {
        let p = -1;
        for (let i = 0; i < n; i++) if (!done[i] && (p < 0 || dist[i] < dist[p])) p = i;
        if (p < 0 || dist[p] === Infinity) return dist;
        done[p] = 1;
        const px = p % map.width;
        const py = (p - px) / map.width;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const qx = px + dx;
                const qy = py + dy;
                if ((dx === 0 && dy === 0) || qx < 0 || qy < 0 || qx >= map.width || qy >= map.height) continue;
                const q = qy * map.width + qx;
                dist[q] = Math.min(dist[q], dist[p] + linkCost(map, p, q, dx, dy));
            }
        }
    }
}

function pathCost(map: CostMap, path: Point[]): number {
    let cost = 0;
    for (let i = 1; i < path.length; i++) {
        const a = path[i - 1];
        const b = path[i];
        cost += linkCost(map, a.y * map.width + a.x, b.y * map.width + b.x, b.x - a.x, b.y - a.y);
    }
    return cost;
}

describe('path search', () => {
    it('finds the cheapest path to every pixel, in whatever order the targets are asked for', () => {
        const width = 24;
        const height = 18;
        for (const seed of [1, 2, 3]) {
            const map = computeCostMap(noiseImage(width, height, seed), { sigma: 0.5 });
            const scissors = new IntelligentScissors(map);
            const rand = random(seed + 100);
            const start = { x: Math.floor(rand() * width), y: Math.floor(rand() * height) };
            const expected = referenceDistances(map, start.y * width + start.x);

            scissors.setSeed(start);
            const targets = Array.from({ length: width * height }, (_, i) => i).sort(() => rand() - 0.5);
            for (const t of targets) {
                const target = { x: t % width, y: Math.floor(t / width) };
                const path = scissors.pathTo(target);
                expect(path[0]).toEqual(start);
                expect(path[path.length - 1]).toEqual(target);
                expect(pathCost(map, path)).toBeCloseTo(expected[t], 9);
            }
        }
    });

    it('gives the same result when the search is cut into small slices', () => {
        const map = computeCostMap(noiseImage(40, 30, 7));
        const whole = new IntelligentScissors(map);
        const sliced = new IntelligentScissors(map);
        const target = { x: 38, y: 27 };
        whole.setSeed({ x: 2, y: 3 });
        sliced.setSeed({ x: 2, y: 3 });

        let rounds = 0;
        while (!sliced.searchTowards(target, 7)) rounds++;
        expect(rounds).toBeGreaterThan(10);
        expect(sliced.pathTo(target)).toEqual(whole.pathTo(target));
    });
});
