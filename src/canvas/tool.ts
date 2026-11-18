import { simplifyPath } from '../core/geometry';
import { IntelligentScissors } from '../core/scissors';
import { ScissorsSession, type SessionOptions } from '../core/session';
import type { ImageInput, Point, ScissorsOptions } from '../core/types';
import { rasterize, type ImageSource } from './raster';
import { CLOSE_HANDLE_SCALE, DEFAULT_STYLE, drawShapes, type ScissorsStyle } from './render';

export interface AttachOptions extends ScissorsOptions, SessionOptions {
    /**
     * The image to trace: an `<img>` (already loaded), canvas, `ImageBitmap`, `ImageData`, or
     * raw grayscale data with an optional window, e.g. `{ data: int16Array, width, height,
     * window: { center: 40, width: 400 } }`.
     */
    image: ImageSource;
    style?: Partial<ScissorsStyle>;
    /**
     * What to draw underneath the shapes. `'image'` (default) draws the image. `'none'` leaves
     * the canvas transparent, for laying it over your own viewer. A function draws a custom
     * background, for example a processed version of the image.
     */
    background?: 'image' | 'none' | ((ctx: CanvasRenderingContext2D, tool: ScissorsTool) => void);
    /** Simplifies finished polygons with this tolerance in pixels. Default `0` (off). */
    simplify?: number;
    /**
     * Esc cancels, Backspace undoes, Enter closes, while the canvas has focus. Default `true`.
     * Holding Shift for straight lines works either way.
     */
    keyboard?: boolean;
    /** Called with every finished polygon, in image pixels. */
    onComplete?: (polygon: Point[], tool: ScissorsTool) => void;
    /** Called after every change: anchor placed, live path moved, undo, and so on. */
    onChange?: (tool: ScissorsTool) => void;
}

export interface ScissorsTool {
    readonly canvas: HTMLCanvasElement;
    readonly session: ScissorsSession;
    readonly scissors: IntelligentScissors;
    /** The current image on a canvas of its own size, for custom backgrounds. */
    readonly image: HTMLCanvasElement;
    /** Finished polygons, oldest first. */
    readonly shapes: readonly Point[][];
    /** Closes the current shape, if it has at least two anchors. */
    close(): void;
    /** Removes the last anchor of the current shape. */
    undo(): void;
    /** Discards the current shape. Finished shapes stay. */
    cancel(): void;
    /** Removes all finished shapes and the current one. */
    clear(): void;
    /**
     * Switches to another image. Clears all shapes unless `keepShapes` is set, which is useful
     * when only the display window of the same image changes.
     */
    setImage(image: ImageSource, options?: { keepShapes?: boolean }): void;
    /**
     * Changes options after creation, e.g. the weights or `autoAnchor`. Discards the shape in
     * progress; finished shapes stay.
     */
    configure(options: ScissorsOptions & SessionOptions): void;
    /** Redraws the canvas, e.g. after changing what a custom `background` draws. */
    redraw(): void;
    /** Removes all event listeners. */
    destroy(): void;
}

/** Time per animation frame spent on extending the search before the browser gets control back. */
const SEARCH_BUDGET_MS = 8;
const SEARCH_CHUNK = 4000;

/**
 * Turns a `<canvas>` into a tracing tool. Click to place anchors, move the mouse to see the
 * path, double-click or click the first anchor to close the shape.
 *
 * The canvas is resized to the image. Scale it with CSS; pointer positions are converted.
 */
export function attachScissors(canvas: HTMLCanvasElement, options: AttachOptions): ScissorsTool {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('intelligent-scissors: could not get a 2D context from the canvas');
    const ctx: CanvasRenderingContext2D = context;

    const style: ScissorsStyle = { ...DEFAULT_STYLE, ...options.style };
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

    let image: HTMLCanvasElement;
    let pixels: ImageInput;
    let scissors: IntelligentScissors;
    let session: ScissorsSession;
    const shapes: Point[][] = [];
    let pointer: Point | null = null;
    /** Shift is held: connect with straight lines instead of following edges. */
    let straight = false;
    let frame = 0;

    const tool: ScissorsTool = {
        canvas,
        get session() {
            return session;
        },
        get scissors() {
            return scissors;
        },
        get image() {
            return image;
        },
        get shapes() {
            return shapes;
        },
        close() {
            const polygon = session.close();
            if (polygon) finish(polygon);
            else changed();
        },
        undo() {
            session.undo();
            if (pointer && !frame) frame = requestAnimationFrame(followPointer);
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
        setImage(next, { keepShapes = false } = {}) {
            if (!keepShapes) shapes.length = 0;
            load(next);
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
        redraw: draw,
        destroy() {
            cancelAnimationFrame(frame);
            resizeObserver.disconnect();
            window.removeEventListener('keydown', onShift);
            window.removeEventListener('keyup', onShift);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerleave', onPointerLeave);
            canvas.removeEventListener('click', onClick);
            canvas.removeEventListener('dblclick', onDoubleClick);
            canvas.removeEventListener('keydown', onKeyDown);
        },
    };

    function load(source: ImageSource) {
        const raster = rasterize(source);
        image = raster.canvas;
        pixels = raster.pixels;
        if (canvas.width !== pixels.width) canvas.width = pixels.width;
        if (canvas.height !== pixels.height) canvas.height = pixels.height;
        rebuild();
    }

    function rebuild() {
        scissors = new IntelligentScissors(pixels, scissorsOptions);
        session = new ScissorsSession(scissors, sessionOptions);
    }

    function finish(polygon: Point[]) {
        const result = options.simplify ? simplifyPath(polygon, options.simplify) : polygon;
        shapes.push(result);
        session.reset();
        changed();
        options.onComplete?.(result, tool);
    }

    function changed() {
        draw();
        options.onChange?.(tool);
    }

    function draw() {
        const background = options.background ?? 'image';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (background === 'image') ctx.drawImage(image, 0, 0);
        else if (typeof background === 'function') background(ctx, tool);
        drawShapes(ctx, shapes, session, style, imagePixelsPerCssPixel());
    }

    function imagePixelsPerCssPixel(): number {
        const shown = canvas.getBoundingClientRect().width;
        return shown > 0 ? canvas.width / shown : 1;
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

    function toImagePixels(e: MouseEvent): Point {
        const rect = canvas.getBoundingClientRect();
        return {
            x: Math.floor(((e.clientX - rect.left) * canvas.width) / rect.width),
            y: Math.floor(((e.clientY - rect.top) * canvas.height) / rect.height),
        };
    }

    function onPointerMove(e: PointerEvent) {
        pointer = toImagePixels(e);
        straight = e.shiftKey;
        if (!frame) frame = requestAnimationFrame(followPointer);
    }

    function onPointerLeave() {
        pointer = null;
    }

    function onClick(e: MouseEvent) {
        // The second click of a double-click is left to the dblclick handler
        if (e.button !== 0 || e.detail > 1) return;
        canvas.focus({ preventScroll: true });
        const point = toImagePixels(e);
        if (onCloseHandle(point)) tool.close();
        else if (session.click(point, { straight: e.shiftKey }) === 'closed') finish(session.polygon());
        else changed();
    }

    /** The close handle is drawn in CSS pixels, so it is hit-tested in CSS pixels too. */
    function onCloseHandle(point: Point): boolean {
        if (!session.canClose) return false;
        const first = session.anchors[0];
        const radius = (style.anchorRadius * CLOSE_HANDLE_SCALE + style.lineWidth) * imagePixelsPerCssPixel();
        return Math.hypot(point.x - first.x, point.y - first.y) <= radius;
    }

    /** Pressing or releasing Shift switches the live path without waiting for the next move. */
    function onShift(e: KeyboardEvent) {
        if (e.key !== 'Shift' || straight === e.shiftKey) return;
        straight = e.shiftKey;
        if (pointer && !frame) frame = requestAnimationFrame(followPointer);
    }

    function onDoubleClick(e: MouseEvent) {
        e.preventDefault();
        tool.close();
    }

    function onKeyDown(e: KeyboardEvent) {
        if (e.key === 'Escape') tool.cancel();
        else if (e.key === 'Backspace' || e.key === 'Delete') tool.undo();
        else if (e.key === 'Enter') tool.close();
        else return;
        e.preventDefault();
    }

    load(options.image);
    if (!canvas.hasAttribute('tabindex')) canvas.tabIndex = 0;
    if (!canvas.style.cursor) canvas.style.cursor = 'crosshair';
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('dblclick', onDoubleClick);
    if (options.keyboard ?? true) canvas.addEventListener('keydown', onKeyDown);
    window.addEventListener('keydown', onShift);
    window.addEventListener('keyup', onShift);
    // Line widths are in CSS pixels, so the shapes are redrawn when the canvas is scaled
    const resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(canvas);
    draw();

    return tool;
}

/** `base` with the keys of `changes` that are not undefined. */
function withDefined<T extends object>(base: T, changes: Partial<T>): T {
    const result = { ...base };
    for (const key of Object.keys(changes) as (keyof T)[]) {
        if (changes[key] !== undefined) result[key] = changes[key] as T[keyof T];
    }
    return result;
}
