import type { IntelligentScissors } from './scissors';
import type { Point } from './types';

export interface SessionOptions {
    /**
     * Clicked anchors move to the strongest edge within this many pixels, so the user doesn't
     * have to hit the boundary exactly. `0` turns snapping off. Default `4`.
     */
    snapRadius?: number;
    /** A click this close (px) to the first anchor closes the shape. Default `6`. */
    closeRadius?: number;
    /**
     * Path cooling: when the beginning of the live path has stayed the same for this many
     * consecutive `move()` calls, an anchor is placed at the end of that stable stretch. The
     * user can then trace long boundaries with few or no clicks. `0` turns it off (default);
     * 10 to 20 works well for mouse input.
     */
    autoAnchor?: number;
    /** Stable stretches shorter than this (px along the path) are not anchored. Default `30`. */
    autoAnchorMinLength?: number;
}

export type ClickResult = 'started' | 'anchored' | 'closed' | 'ignored';

/**
 * The state of tracing one shape: anchors, the fixed segments between them and the live
 * path to the pointer. It has no DOM dependency. Feed it pointer positions in image pixels
 * and draw what it reports, which makes it usable inside any viewer. The canvas tool in
 * `intelligent-scissors/canvas` is built on it.
 */
export class ScissorsSession {
    readonly scissors: IntelligentScissors;

    private readonly snapRadius: number;
    private readonly closeRadius: number;
    private readonly autoAnchor: number;
    private readonly autoAnchorMinLength: number;

    private anchorList: Point[] = [];
    private segmentList: Point[][] = [];
    private live: Point[] = [];
    /** For path cooling: `ages[i]` counts the consecutive moves in which `live[i]` didn't change. */
    private ages: number[] = [];
    private isClosed = false;

    constructor(scissors: IntelligentScissors, options: SessionOptions = {}) {
        this.scissors = scissors;
        this.snapRadius = options.snapRadius ?? 4;
        this.closeRadius = options.closeRadius ?? 6;
        this.autoAnchor = options.autoAnchor ?? 0;
        this.autoAnchorMinLength = options.autoAnchorMinLength ?? 30;
    }

    /** True once the first anchor is placed. */
    get started(): boolean {
        return this.anchorList.length > 0;
    }

    /** True after the shape was closed. The next `click()` starts a new one. */
    get closed(): boolean {
        return this.isClosed;
    }

    /** Anchor points in the order they were placed. */
    get anchors(): readonly Point[] {
        return this.anchorList;
    }

    /** Fixed path segments, one between each pair of consecutive anchors. */
    get segments(): readonly (readonly Point[])[] {
        return this.segmentList;
    }

    /** Path from the last anchor to the pointer. Empty before the first click and after closing. */
    get livePath(): readonly Point[] {
        return this.live;
    }

    /** Whether the shape can be closed now (it needs at least two anchors). */
    get canClose(): boolean {
        return !this.isClosed && this.anchorList.length >= 2;
    }

    /** Handles a click: starts the shape, adds an anchor, or closes the shape near the first anchor. */
    click(point: Point): ClickResult {
        if (this.isClosed) this.reset();
        const p = this.scissors.snap(point, this.snapRadius);

        if (!this.started) {
            this.startSegmentAt(p);
            return 'started';
        }

        if (this.canClose && distance(point, this.anchorList[0]) <= this.closeRadius) {
            this.close();
            return 'closed';
        }

        const last = this.anchorList[this.anchorList.length - 1];
        if (p.x === last.x && p.y === last.y) return 'ignored';

        this.segmentList.push(this.scissors.pathTo(p));
        this.startSegmentAt(p);
        return 'anchored';
    }

    /** Moves the live path to `point`. With `autoAnchor` set, this may also place an anchor. */
    move(point: Point): readonly Point[] {
        if (!this.started || this.isClosed) return this.live;
        const next = this.scissors.pathTo(point);
        if (this.autoAnchor > 0 && this.cool(next)) {
            this.live = this.scissors.pathTo(point);
        } else {
            this.live = next;
        }
        return this.live;
    }

    /**
     * Closes the shape with the best path from the last anchor back to the first. Returns the
     * polygon, or `null` if there are fewer than two anchors.
     */
    close(): Point[] | null {
        if (!this.canClose) return null;
        this.segmentList.push(this.scissors.pathTo(this.anchorList[0]));
        this.live = [];
        this.ages = [];
        this.isClosed = true;
        return this.polygon();
    }

    /** Removes the last anchor, or re-opens the shape if it was closed. */
    undo(): void {
        if (this.isClosed) {
            this.isClosed = false;
            this.segmentList.pop();
        } else if (this.segmentList.length > 0) {
            this.segmentList.pop();
            this.anchorList.pop();
        } else {
            this.reset();
            return;
        }
        const last = this.anchorList[this.anchorList.length - 1];
        this.scissors.setSeed(last);
        this.live = [last];
        this.ages = [];
    }

    /** Discards the shape. */
    reset(): void {
        this.anchorList = [];
        this.segmentList = [];
        this.live = [];
        this.ages = [];
        this.isClosed = false;
    }

    /**
     * The outline so far: all fixed segments joined, without repeating the points where they
     * meet. For a closed shape the first point isn't repeated at the end either.
     */
    polygon(): Point[] {
        const out: Point[] = [];
        for (const segment of this.segmentList) {
            for (let i = out.length === 0 ? 0 : 1; i < segment.length; i++) out.push(segment[i]);
        }
        if (out.length === 0 && this.anchorList.length > 0) out.push(this.anchorList[0]);
        if (this.isClosed && out.length > 1) out.pop();
        return out;
    }

    private startSegmentAt(p: Point): void {
        this.anchorList.push(p);
        this.scissors.setSeed(p);
        this.live = [p];
        this.ages = [];
    }

    /**
     * Updates the ages of the live path and places an anchor where it has cooled down.
     * Paths from one seed form a tree, so two consecutive live paths share a prefix and differ
     * after it; only pixels in the shared prefix get older. Returns whether an anchor was set.
     */
    private cool(next: Point[]): boolean {
        const previous = this.live;
        let shared = 0;
        while (shared < next.length && shared < previous.length && samePoint(next[shared], previous[shared])) shared++;

        const ages = new Array<number>(next.length);
        for (let i = 0; i < next.length; i++) ages[i] = i < shared ? (this.ages[i] ?? 0) + 1 : 0;
        this.ages = ages;

        // Ages never increase along the path, so the last cooled pixel ends the stable stretch.
        // The pixel under the pointer itself is never anchored.
        let end = Math.min(shared, next.length - 1) - 1;
        while (end >= 0 && ages[end] < this.autoAnchor) end--;
        if (end < this.autoAnchorMinLength) return false;

        this.segmentList.push(next.slice(0, end + 1));
        this.startSegmentAt(next[end]);
        return true;
    }
}

function samePoint(a: Point, b: Point): boolean {
    return a.x === b.x && a.y === b.y;
}

function distance(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}
