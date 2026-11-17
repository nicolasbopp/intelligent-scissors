import { IntelligentScissors } from '../core/scissors';
import { ScissorsSession, type SessionOptions } from '../core/session';
import { simplifyPath } from '../core/geometry';
import type { Point, ScissorsOptions } from '../core/types';

export type { Point } from '../core/types';

/** Anything the browser can draw, or raw `ImageData`. */
export type ImageSource = HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas | ImageData;

export interface ScissorsStyle {
    /** Colour of fixed segments and finished shapes. */
    stroke: string;
    /** Colour of the live path following the pointer. */
    liveStroke: string;
    /** Fill of finished shapes. */
    fill: string;
    /** Fill of anchor handles. */
    anchor: string;
    lineWidth: number;
    anchorRadius: number;
}

export const DEFAULT_STYLE: Readonly<ScissorsStyle> = {
    stroke: '#ffd60a',
    liveStroke: '#4cc9f0',
    fill: 'rgba(255, 214, 10, 0.18)',
    anchor: '#ffffff',
    lineWidth: 2,
    anchorRadius: 4,
};

export interface AttachOptions extends ScissorsOptions, SessionOptions {
    /** The image to trace. Images must be loaded (`img.complete`). */
    image: ImageSource;
    style?: Partial<ScissorsStyle>;
    /**
     * What to draw under the contours:
     * `'image'` (default) the source image, `'none'` nothing (use the canvas as a transparent
     * overlay on top of your own viewer), or a function that draws a custom background.
     */
    background?: 'image' | 'none' | ((ctx: CanvasRenderingContext2D, tool: ScissorsTool) => void);
    /** Simplify finished polygons with this tolerance in px (Ramer–Douglas–Peucker). Default `0` (off). */
    simplify?: number;
    /** Keyboard shortcuts on the focused canvas: Esc cancels, Backspace undoes, Enter closes. Default `true`. */
    keyboard?: boolean;
    /** Called with every finished polygon (image pixel coordinates). */
    onComplete?: (polygon: Point[], tool: ScissorsTool) => void;
    /** Called after every state change (anchor added, path moved, undo, …). */
    onChange?: (tool: ScissorsTool) => void;
}

export interface ScissorsTool {
    readonly canvas: HTMLCanvasElement;
    readonly session: ScissorsSession;
    readonly scissors: IntelligentScissors;
    /** The current image rendered onto a canvas of its own size (for custom backgrounds). */
    readonly image: HTMLCanvasElement;
    /** Finished polygons, oldest first. */
    readonly shapes: readonly Point[][];
    /** Closes the current contour, if possible. */
    close(): void;
    /** Removes the last anchor of the current contour. */
    undo(): void;
    /** Discards the current contour (finished shapes stay). */
    cancel(): void;
    /** Removes all finished shapes and the current contour. */
    clear(): void;
    /** Replaces the image; clears everything. */
    setImage(image: ImageSource): void;
    /** Recomputes the cost map with new options (e.g. weights) on the same image; shapes stay. */
    configure(options: ScissorsOptions): void;
    /** Redraws the canvas. Call it after changing what a custom `background` draws. */
    redraw(): void;
    /** Removes all listeners. */
    destroy(): void;
}

/**
 * Turns a `<canvas>` into an intelligent-scissors tracing tool.
 *
 * Click to place anchors, move to see the edge-following path, double-click (or click the
 * first anchor) to close the shape. The canvas is resized to the image; scale it with CSS.
 */
export function attachScissors(canvas: HTMLCanvasElement, options: AttachOptions): ScissorsTool {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('intelligent-scissors: could not get a 2D context from the canvas');

    const style: ScissorsStyle = { ...DEFAULT_STYLE, ...options.style };
    let scissorsOptions: ScissorsOptions = {
        weights: options.weights,
        sigma: options.sigma,
        zeroCrossingThreshold: options.zeroCrossingThreshold,
    };
    const sessionOptions: SessionOptions = { snapRadius: options.snapRadius, closeRadius: options.closeRadius };

    let backdrop: HTMLCanvasElement;
    let imageData: ImageData;
    let scissors: IntelligentScissors;
    let session: ScissorsSession;
    let pointer: Point | null = null;
    const shapes: Point[][] = [];
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
            return backdrop;
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
            if (pointer) session.move(pointer);
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
        setImage(image) {
            shapes.length = 0;
            load(image);
            changed();
        },
        configure(next) {
            scissorsOptions = { ...scissorsOptions, ...next };
            scissors = new IntelligentScissors(imageData, scissorsOptions);
            session = new ScissorsSession(scissors, sessionOptions);
            changed();
        },
        redraw: () => draw(),
        destroy() {
            cancelAnimationFrame(frame);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerleave', onPointerLeave);
            canvas.removeEventListener('click', onClick);
            canvas.removeEventListener('dblclick', onDoubleClick);
            canvas.removeEventListener('keydown', onKeyDown);
        },
    };

    function load(image: ImageSource) {
        const { data, canvas: bitmap } = rasterize(image);
        imageData = data;
        backdrop = bitmap;
        if (canvas.width !== data.width || canvas.height !== data.height) {
            canvas.width = data.width;
            canvas.height = data.height;
        }
        scissors = new IntelligentScissors(imageData, scissorsOptions);
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

    function toImage(e: MouseEvent): Point {
        const rect = canvas.getBoundingClientRect();
        return {
            x: Math.floor(((e.clientX - rect.left) * canvas.width) / rect.width),
            y: Math.floor(((e.clientY - rect.top) * canvas.height) / rect.height),
        };
    }

    function onPointerMove(e: PointerEvent) {
        pointer = toImage(e);
        if (frame) return;
        frame = requestAnimationFrame(() => {
            frame = 0;
            if (pointer && session.started && !session.closed) {
                session.move(pointer);
                changed();
            }
        });
    }

    function onPointerLeave() {
        pointer = null;
    }

    function onClick(e: MouseEvent) {
        if (e.button !== 0) return;
        canvas.focus({ preventScroll: true });
        const p = toImage(e);
        if (session.click(p) === 'closed') finish(session.polygon());
        else changed();
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

    function draw() {
        const bg = options.background ?? 'image';
        ctx!.clearRect(0, 0, canvas.width, canvas.height);
        if (bg === 'image') ctx!.drawImage(backdrop, 0, 0);
        else if (typeof bg === 'function') bg(ctx!, tool);

        ctx!.lineJoin = 'round';
        ctx!.lineCap = 'round';
        ctx!.lineWidth = style.lineWidth;

        for (const shape of shapes) {
            tracePath(ctx!, shape, true);
            ctx!.fillStyle = style.fill;
            ctx!.fill();
            ctx!.strokeStyle = style.stroke;
            ctx!.stroke();
        }

        ctx!.strokeStyle = style.stroke;
        for (const segment of session.segments) {
            tracePath(ctx!, segment, false);
            ctx!.stroke();
        }

        if (session.livePath.length > 1) {
            ctx!.strokeStyle = style.liveStroke;
            tracePath(ctx!, session.livePath, false);
            ctx!.stroke();
        }

        session.anchors.forEach((a, i) => {
            ctx!.beginPath();
            ctx!.arc(a.x + 0.5, a.y + 0.5, i === 0 && session.canClose ? style.anchorRadius * 1.6 : style.anchorRadius, 0, Math.PI * 2);
            ctx!.fillStyle = style.anchor;
            ctx!.fill();
            ctx!.strokeStyle = style.stroke;
            ctx!.stroke();
        });
    }

    load(options.image);
    if (!canvas.hasAttribute('tabindex')) canvas.tabIndex = 0;
    if (!canvas.style.cursor) canvas.style.cursor = 'crosshair';
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('dblclick', onDoubleClick);
    if (options.keyboard ?? true) canvas.addEventListener('keydown', onKeyDown);
    draw();

    return tool;
}

function tracePath(ctx: CanvasRenderingContext2D, points: readonly Point[], closed: boolean) {
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x + 0.5, p.y + 0.5) : ctx.lineTo(p.x + 0.5, p.y + 0.5)));
    if (closed) ctx.closePath();
}

/** Draws any image source onto a same-size canvas and reads its pixels. */
function rasterize(image: ImageSource): { data: ImageData; canvas: HTMLCanvasElement } {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('intelligent-scissors: could not create a 2D context');

    if (image instanceof ImageData) {
        canvas.width = image.width;
        canvas.height = image.height;
        ctx.putImageData(image, 0, 0);
        return { data: image, canvas };
    }

    let width: number;
    let height: number;
    if (image instanceof HTMLImageElement) {
        if (!image.complete || image.naturalWidth === 0) {
            throw new Error('intelligent-scissors: the image is not loaded yet; await img.decode() first');
        }
        width = image.naturalWidth;
        height = image.naturalHeight;
    } else {
        width = image.width;
        height = image.height;
    }
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(image, 0, 0);
    return { data: ctx.getImageData(0, 0, width, height), canvas };
}
