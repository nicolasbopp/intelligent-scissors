import type { IntelligentScissors } from '../core/scissors';
import type { ScissorsSession, SessionOptions } from '../core/session';
import type { Point, ScissorsOptions } from '../core/types';
import { createController, handleKey } from './controller';
import { rasterize, type ImageSource } from './raster';
import { closeHandleRadius, DEFAULT_STYLE, drawShapes, type ScissorsStyle } from './render';

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


/** A click that ends further than this (CSS pixels) from where the button went down was a drag. */
const DRAG_TOLERANCE = 4;

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

    let raster = rasterize(options.image);
    let pressedAt: { x: number; y: number } | null = null;

    const controller = createController(raster.pixels, {
        weights: options.weights,
        sigma: options.sigma,
        zeroCrossingThreshold: options.zeroCrossingThreshold,
        snapRadius: options.snapRadius,
        closeRadius: options.closeRadius,
        autoAnchor: options.autoAnchor,
        autoAnchorMinLength: options.autoAnchorMinLength,
        // Read when a shape is finished, so the caller may change it later
        get simplify() {
            return options.simplify;
        },
        onComplete: polygon => options.onComplete?.(polygon, tool),
        onChange() {
            draw();
            options.onChange?.(tool);
        },
    });

    const tool: ScissorsTool = {
        canvas,
        get session() {
            return controller.session;
        },
        get scissors() {
            return controller.scissors;
        },
        get image() {
            return raster.canvas;
        },
        shapes: controller.shapes,
        close: controller.close,
        undo: controller.undo,
        cancel: controller.cancel,
        clear: controller.clear,
        setImage(next, setOptions) {
            raster = rasterize(next);
            fitCanvas();
            controller.setPixels(raster.pixels, setOptions);
        },
        configure: controller.configure,
        redraw: draw,
        destroy() {
            controller.destroy();
            resizeObserver.disconnect();
            window.removeEventListener('keydown', onShift);
            window.removeEventListener('keyup', onShift);
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerleave', onPointerLeave);
            canvas.removeEventListener('click', onClick);
            canvas.removeEventListener('dblclick', onDoubleClick);
            canvas.removeEventListener('keydown', onKeyDown);
        },
    };

    function fitCanvas() {
        if (canvas.width !== raster.pixels.width) canvas.width = raster.pixels.width;
        if (canvas.height !== raster.pixels.height) canvas.height = raster.pixels.height;
    }

    function draw() {
        const background = options.background ?? 'image';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (background === 'image') ctx.drawImage(raster.canvas, 0, 0);
        else if (typeof background === 'function') background(ctx, tool);
        drawShapes(ctx, controller.shapes, controller.session, style, imagePixelsPerCssPixel());
    }

    function imagePixelsPerCssPixel(): number {
        const shown = canvas.getBoundingClientRect().width;
        return shown > 0 ? canvas.width / shown : 1;
    }

    function toImagePixels(e: MouseEvent): Point {
        const rect = canvas.getBoundingClientRect();
        return {
            x: Math.floor(((e.clientX - rect.left) * canvas.width) / rect.width),
            y: Math.floor(((e.clientY - rect.top) * canvas.height) / rect.height),
        };
    }

    function onPointerDown(e: PointerEvent) {
        pressedAt = { x: e.clientX, y: e.clientY };
    }

    function onPointerMove(e: PointerEvent) {
        controller.moveTo(toImagePixels(e), { straight: e.shiftKey });
    }

    function onPointerLeave() {
        controller.moveTo(null);
    }

    function onClick(e: MouseEvent) {
        // The second click of a double-click is left to the dblclick handler
        if (e.button !== 0 || e.detail > 1) return;
        // Dragging, e.g. to pan a viewer the canvas sits in, is not a click
        const dragged = pressedAt && Math.hypot(e.clientX - pressedAt.x, e.clientY - pressedAt.y) > DRAG_TOLERANCE;
        pressedAt = null;
        if (dragged) return;

        canvas.focus({ preventScroll: true });
        controller.clickAt(toImagePixels(e), {
            straight: e.shiftKey,
            // The close handle is drawn in CSS pixels, so it is hit-tested in CSS pixels too
            closeHandleRadius: closeHandleRadius(style) * imagePixelsPerCssPixel(),
        });
    }

    /** Pressing or releasing Shift switches the live path without waiting for the next move. */
    function onShift(e: KeyboardEvent) {
        if (e.key === 'Shift') controller.setStraight(e.shiftKey);
    }

    function onDoubleClick(e: MouseEvent) {
        e.preventDefault();
        controller.close();
    }

    function onKeyDown(e: KeyboardEvent) {
        if (handleKey(controller, e.key)) e.preventDefault();
    }

    fitCanvas();
    if (!canvas.hasAttribute('tabindex')) canvas.tabIndex = 0;
    if (!canvas.style.cursor) canvas.style.cursor = 'crosshair';
    canvas.addEventListener('pointerdown', onPointerDown);
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
