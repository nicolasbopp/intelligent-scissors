import { simplifyPath } from '../core/geometry';
import { IntelligentScissors } from '../core/scissors';
import { ScissorsSession, type SessionOptions, type StepOptions } from '../core/session';
import type { ImageInput, Point, ScissorsOptions } from '../core/types';

export interface ControllerOptions extends ScissorsOptions, SessionOptions {
    /** Simplifies finished polygons with this tolerance in pixels. Default `0` (off). */
    simplify?: number;
    /** Called with every finished polygon, in image pixels. */
    onComplete?: (polygon: Point[]) => void;
    /** Called after every change, which is when the host should redraw. */
    onChange?: () => void;
}

export interface ClickOptions extends StepOptions {
    /**
     * A click this close to the first anchor (in image pixels) closes the shape. Pass the
     * size the anchor has on screen, converted to image pixels, so that clicking the handle
     * the user sees always works. Without it only the session's `closeRadius` applies.
     */
    closeHandleRadius?: number;
}

/**
 * The tracing tool without a canvas: it takes pointer positions in image pixels, follows the
 * pointer without blocking the page, and keeps the finished shapes. `attachScissors` and the
 * viewer adapters are built on it; use it to connect a viewer that has its own events and
 * drawing. Draw its state with `drawShapes`.
 */
export interface ScissorsController {
    readonly session: ScissorsSession;
    readonly scissors: IntelligentScissors;
    /** Finished polygons, oldest first. */
    readonly shapes: readonly Point[][];
    /** The pointer moved to `point`, or left the image (`null`). */
    moveTo(point: Point | null, options?: StepOptions): void;
    /** Switches the live path between following edges and a straight line, e.g. when Shift is pressed. */
    setStraight(straight: boolean): void;
    /** A click at `point`: starts a shape, places an anchor or closes the shape. */
    clickAt(point: Point, options?: ClickOptions): void;
    /** Closes the current shape, if it has at least two anchors. */
    close(): void;
    /** Removes the last anchor of the current shape. */
    undo(): void;
    /** Discards the current shape. Finished shapes stay. */
    cancel(): void;
    /** Removes all finished shapes and the current one. */
    clear(): void;
    /** Switches to other pixels. Clears all shapes unless `keepShapes` is set. */
    setPixels(pixels: ImageInput, options?: { keepShapes?: boolean }): void;
    /** Changes options. Discards the shape in progress; finished shapes stay. */
    configure(options: ScissorsOptions & SessionOptions): void;
    /** Stops a search that is still running. */
    destroy(): void;
}

/** Time per animation frame spent on extending the search before the browser gets control back. */
const SEARCH_BUDGET_MS = 8;
const SEARCH_CHUNK = 4000;

export function createController(initialPixels: ImageInput, options: ControllerOptions = {}): ScissorsController {
    let sessionOptions: SessionOptions = {
        snapRadius: options.snapRadius,
        closeRadius: options.closeRadius,
        autoAnchor: options.autoAnchor,
        autoAnchorMinLength: options.autoAnchorMinLength,
    };
    let scissorsOptions: ScissorsOptions = {
        weights: options.weights,
        sigma: options.sigma,
        zeroCrossingThreshold: options.zeroCrossingThreshold,
    };

    let pixels = initialPixels;
    let scissors = new IntelligentScissors(pixels, scissorsOptions);
    let session = new ScissorsSession(scissors, sessionOptions);
    const shapes: Point[][] = [];
    let pointer: Point | null = null;
    let straight = false;
    let frame = 0;

    function changed() {
        options.onChange?.();
    }

    function finish(polygon: Point[]) {
        const result = options.simplify ? simplifyPath(polygon, options.simplify) : polygon;
        shapes.push(result);
        session.reset();
        changed();
        options.onComplete?.(result);
    }

    function follow() {
        if (pointer && !frame) frame = requestAnimationFrame(followPointer);
    }

    /**
     * Follows the pointer. A long way from the last anchor can mean searching most of the
     * image, so the search runs in slices of a few milliseconds per frame. The live path
     * updates once the pointer's pixel is reached.
     */
    function followPointer() {
        frame = 0;
        if (!pointer || !session.started || session.closed) return;

        if (!straight) {
            const deadline = performance.now() + SEARCH_BUDGET_MS;
            while (!scissors.searchTowards(pointer, SEARCH_CHUNK)) {
                if (performance.now() > deadline) {
                    frame = requestAnimationFrame(followPointer);
                    return;
                }
            }
        }
        session.move(pointer, { straight });
        changed();
    }

    function onCloseHandle(point: Point, radius: number | undefined): boolean {
        if (radius === undefined || !session.canClose) return false;
        const first = session.anchors[0];
        return Math.hypot(point.x - first.x, point.y - first.y) <= radius;
    }

    const controller: ScissorsController = {
        get session() {
            return session;
        },
        get scissors() {
            return scissors;
        },
        shapes,
        moveTo(point, step) {
            pointer = point;
            if (step?.straight !== undefined) straight = step.straight;
            follow();
        },
        setStraight(next) {
            if (straight === next) return;
            straight = next;
            follow();
        },
        clickAt(point, click = {}) {
            if (onCloseHandle(point, click.closeHandleRadius)) controller.close();
            else if (session.click(point, { straight: click.straight }) === 'closed') finish(session.polygon());
            else changed();
        },
        close() {
            const polygon = session.close();
            if (polygon) finish(polygon);
            else changed();
        },
        undo() {
            session.undo();
            follow();
            changed();
        },
        cancel() {
            session.reset();
            changed();
        },
        clear() {
            shapes.length = 0;
            session.reset();
            changed();
        },
        setPixels(next, { keepShapes = false } = {}) {
            if (!keepShapes) shapes.length = 0;
            pixels = next;
            scissors = new IntelligentScissors(pixels, scissorsOptions);
            session = new ScissorsSession(scissors, sessionOptions);
            changed();
        },
        configure(next) {
            const { snapRadius, closeRadius, autoAnchor, autoAnchorMinLength, ...rest } = next;
            sessionOptions = withDefined(sessionOptions, { snapRadius, closeRadius, autoAnchor, autoAnchorMinLength });
            if (Object.keys(rest).length > 0) {
                scissorsOptions = { ...scissorsOptions, ...rest };
                scissors = new IntelligentScissors(pixels, scissorsOptions);
            }
            session = new ScissorsSession(scissors, sessionOptions);
            changed();
        },
        destroy() {
            cancelAnimationFrame(frame);
            frame = 0;
            pointer = null;
        },
    };
    return controller;
}

/** The keyboard shortcuts shared by the canvas tool and the viewer adapters. Returns whether the key was used. */
export function handleKey(controller: ScissorsController, key: string): boolean {
    if (key === 'Escape') controller.cancel();
    else if (key === 'Backspace' || key === 'Delete') controller.undo();
    else if (key === 'Enter') controller.close();
    else return false;
    return true;
}

/** `base` with the keys of `changes` that are not undefined. */
function withDefined<T extends object>(base: T, changes: Partial<T>): T {
    const result = { ...base };
    for (const key of Object.keys(changes) as (keyof T)[]) {
        if (changes[key] !== undefined) result[key] = changes[key] as T[keyof T];
    }
    return result;
}
