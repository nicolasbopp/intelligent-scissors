import { computeCostMap, linkCost, type CostMap } from './costMap';
import { MinHeap } from './heap';
import type { ImageInput, Point, ScissorsOptions } from './types';

const NEIGHBOUR_DX = [-1, 0, 1, -1, 1, -1, 0, 1];
const NEIGHBOUR_DY = [-1, -1, -1, 0, 0, 1, 1, 1];

/**
 * Live-wire path finder on one image.
 *
 * `setSeed()` starts a shortest-path search from a pixel; `pathTo()` returns the optimal
 * edge-following path from the seed to any pixel. The search is **incremental**: it only
 * expands until the requested target is settled and resumes from there on the next call, so
 * a path near the seed costs a few hundred pixel visits instead of a full-image Dijkstra.
 */
export class IntelligentScissors {
    readonly costMap: CostMap;
    readonly width: number;
    readonly height: number;

    private readonly dist: Float64Array;
    private readonly prev: Int32Array;
    /** `dist[i]` and `prev[i]` are only valid for the current seed if `stamp[i] === generation`. */
    private readonly stamp: Uint32Array;
    private readonly settled: Uint32Array;
    private readonly heap: MinHeap;
    private generation = 0;
    private seedIndex = -1;

    constructor(source: ImageInput | CostMap, options: ScissorsOptions = {}) {
        this.costMap = isCostMap(source) ? source : computeCostMap(source, options);
        this.width = this.costMap.width;
        this.height = this.costMap.height;
        const n = this.width * this.height;
        this.dist = new Float64Array(n);
        this.prev = new Int32Array(n);
        this.stamp = new Uint32Array(n);
        this.settled = new Uint32Array(n);
        this.heap = new MinHeap(Math.min(n, 1 << 16));
    }

    /** The current seed, or `null` before the first `setSeed()`. */
    get seed(): Point | null {
        return this.seedIndex < 0 ? null : this.toPoint(this.seedIndex);
    }

    /** Starts a new search from `point` (rounded and clamped to the image). */
    setSeed(point: Point): void {
        if (this.generation === 0xffffffff) {
            this.stamp.fill(0);
            this.settled.fill(0);
            this.generation = 0;
        }
        const gen = ++this.generation;
        const s = this.toIndex(point);
        this.seedIndex = s;
        this.heap.clear();
        this.dist[s] = 0;
        this.prev[s] = -1;
        this.stamp[s] = gen;
        this.heap.push(0, s);
    }

    /**
     * Optimal path from the seed to `point`, both ends included, as integer pixel positions.
     * Throws if no seed has been set.
     */
    pathTo(point: Point): Point[] {
        if (this.seedIndex < 0) throw new Error('intelligent-scissors: call setSeed() before pathTo()');
        const target = this.toIndex(point);
        this.expandUntil(target);

        const path: Point[] = [];
        for (let i = target; i >= 0; i = this.prev[i]) path.push(this.toPoint(i));
        return path.reverse();
    }

    /**
     * The pixel within `radius` of `point` that lies on the strongest edge. Use it to snap
     * clicked anchors onto the boundary. Ties are broken by distance.
     */
    snap(point: Point, radius: number): Point {
        const c = this.clamp(point);
        if (radius <= 0) return c;
        const r = Math.ceil(radius);
        const { gradientCost } = this.costMap;
        let best = c;
        let bestCost = Infinity;
        let bestDist = Infinity;
        for (let y = Math.max(0, c.y - r); y <= Math.min(this.height - 1, c.y + r); y++) {
            for (let x = Math.max(0, c.x - r); x <= Math.min(this.width - 1, c.x + r); x++) {
                const d = (x - c.x) ** 2 + (y - c.y) ** 2;
                if (d > radius * radius) continue;
                const cost = gradientCost[y * this.width + x];
                if (cost < bestCost - 1e-6 || (Math.abs(cost - bestCost) <= 1e-6 && d < bestDist)) {
                    best = { x, y };
                    bestCost = cost;
                    bestDist = d;
                }
            }
        }
        return best;
    }

    private expandUntil(target: number): void {
        const { dist, prev, stamp, settled, heap, costMap, width, height } = this;
        const gen = this.generation;

        while (settled[target] !== gen && heap.size > 0) {
            const p = heap.pop();
            const d = heap.lastKey;
            if (settled[p] === gen || d > dist[p]) continue; // stale heap entry
            settled[p] = gen;

            const px = p % width;
            const py = (p - px) / width;
            for (let k = 0; k < 8; k++) {
                const dx = NEIGHBOUR_DX[k];
                const dy = NEIGHBOUR_DY[k];
                const qx = px + dx;
                const qy = py + dy;
                if (qx < 0 || qy < 0 || qx >= width || qy >= height) continue;
                const q = qy * width + qx;
                if (settled[q] === gen) continue;
                const nd = d + linkCost(costMap, p, q, dx, dy);
                if (stamp[q] !== gen || nd < dist[q]) {
                    stamp[q] = gen;
                    dist[q] = nd;
                    prev[q] = p;
                    heap.push(nd, q);
                }
            }
        }
    }

    private clamp(point: Point): Point {
        const x = Math.round(point.x);
        const y = Math.round(point.y);
        return {
            x: x < 0 ? 0 : x >= this.width ? this.width - 1 : x,
            y: y < 0 ? 0 : y >= this.height ? this.height - 1 : y,
        };
    }

    private toIndex(point: Point): number {
        const { x, y } = this.clamp(point);
        return y * this.width + x;
    }

    private toPoint(index: number): Point {
        const x = index % this.width;
        return { x, y: (index - x) / this.width };
    }
}

function isCostMap(source: ImageInput | CostMap): source is CostMap {
    return 'gradientCost' in source;
}

/** Shorthand for `new IntelligentScissors(image, options)`. */
export function createScissors(image: ImageInput, options?: ScissorsOptions): IntelligentScissors {
    return new IntelligentScissors(image, options);
}
