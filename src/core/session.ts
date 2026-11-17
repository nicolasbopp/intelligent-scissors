import type { IntelligentScissors } from './scissors';
import type { Point } from './types';

export interface SessionOptions {
    /**
     * Clicked anchors move to the strongest edge within this many pixels. Makes it easy to
     * hit a boundary. `0` disables snapping. Default `4`.
     */
    snapRadius?: number;
    /** A click this close (px) to the first anchor closes the contour. Default `6`. */
    closeRadius?: number;
}

export type ClickResult = 'started' | 'anchored' | 'closed' | 'ignored';

/**
 * The interaction state of tracing one contour, without any DOM: feed it pointer positions
 * in image pixels (`click`, `move`) and read back what to draw. Use it to integrate the tool
 * into your own viewer (Cornerstone, OpenSeadragon, Konva, three.js, …); the
 * `intelligent-scissors/canvas` entry point is a thin wrapper around it.
 */
export class ScissorsSession {
    readonly scissors: IntelligentScissors;
    private readonly snapRadius: number;
    private readonly closeRadius: number;

    private anchorList: Point[] = [];
    private segmentList: Point[][] = [];
    private live: Point[] = [];
    private isClosed = false;

    constructor(scissors: IntelligentScissors, options: SessionOptions = {}) {
        this.scissors = scissors;
        this.snapRadius = options.snapRadius ?? 4;
        this.closeRadius = options.closeRadius ?? 6;
    }

    /** True once the first anchor is placed. */
    get started(): boolean {
        return this.anchorList.length > 0;
    }

    /** True after the contour was closed; the next `click()` starts a new one. */
    get closed(): boolean {
        return this.isClosed;
    }

    /** Fixed anchor points, in click order. */
    get anchors(): readonly Point[] {
        return this.anchorList;
    }

    /** The fixed path segments between consecutive anchors. */
    get segments(): readonly (readonly Point[])[] {
        return this.segmentList;
    }

    /** The path from the last anchor to the pointer; empty when idle or closed. */
    get livePath(): readonly Point[] {
        return this.live;
    }

    /** Whether a click near the first anchor (or `close()`) would close the contour now. */
    get canClose(): boolean {
        return !this.isClosed && this.anchorList.length >= 2;
    }

    /** Places an anchor (or starts / closes the contour). */
    click(point: Point): ClickResult {
        if (this.isClosed) this.reset();
        const p = this.scissors.snap(point, this.snapRadius);

        if (!this.started) {
            this.anchorList.push(p);
            this.scissors.setSeed(p);
            this.live = [p];
            return 'started';
        }

        const first = this.anchorList[0];
        if (this.canClose && distance(point, first) <= this.closeRadius) {
            this.close();
            return 'closed';
        }

        const last = this.anchorList[this.anchorList.length - 1];
        if (p.x === last.x && p.y === last.y) return 'ignored';

        this.segmentList.push(this.scissors.pathTo(p));
        this.anchorList.push(p);
        this.scissors.setSeed(p);
        this.live = [p];
        return 'anchored';
    }

    /** Updates the live path to follow the pointer. Returns it for convenience. */
    move(point: Point): readonly Point[] {
        if (this.started && !this.isClosed) this.live = this.scissors.pathTo(point);
        return this.live;
    }

    /**
     * Closes the contour along the optimal path from the last anchor back to the first one.
     * Returns the polygon, or `null` if fewer than two anchors exist.
     */
    close(): Point[] | null {
        if (!this.canClose) return null;
        this.segmentList.push(this.scissors.pathTo(this.anchorList[0]));
        this.live = [];
        this.isClosed = true;
        return this.polygon();
    }

    /** Removes the last anchor (or re-opens a closed contour). */
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
        this.scissors.setSeed(this.anchorList[this.anchorList.length - 1]);
        this.live = [this.anchorList[this.anchorList.length - 1]];
    }

    /** Discards the contour. */
    reset(): void {
        this.anchorList = [];
        this.segmentList = [];
        this.live = [];
        this.isClosed = false;
    }

    /**
     * The traced outline: all fixed segments joined, without duplicate joints. For a closed
     * contour the first point is not repeated at the end.
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
}

function distance(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}
