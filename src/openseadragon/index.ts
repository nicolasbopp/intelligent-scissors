import type OpenSeadragon from 'openseadragon';
import { createController, handleKey, type ScissorsController } from '../canvas/controller';
import { rasterize, type ImageSource } from '../canvas/raster';
import { closeHandleRadius, DEFAULT_STYLE, drawShapes, type ScissorsStyle } from '../canvas/render';
import type { SessionOptions } from '../core/session';
import type { Point, ScissorsOptions } from '../core/types';

export interface ViewerOptions extends ScissorsOptions, SessionOptions {
    /**
     * The pixels to trace on. For a small image this is the image itself. For a deep-zoom
     * slide, pass a downscaled version, e.g. 2000 to 4000 pixels wide: edges are found at
     * that resolution, and polygons come back in its pixels (see `ViewerScissors.scale`).
     */
    image: ImageSource;
    /** Which image of the viewer to trace on, as an index into `viewer.world`. Default `0`. */
    item?: number;
    style?: Partial<ScissorsStyle>;
    /** Simplifies finished polygons with this tolerance in pixels. Default `0` (off). */
    simplify?: number;
    /** Esc cancels, Backspace undoes, Enter closes, while the viewer has focus. Default `true`. */
    keyboard?: boolean;
    /** Called with every finished polygon, in pixels of `image`. */
    onComplete?: (polygon: Point[], tool: ViewerScissors) => void;
    /** Called after every change. */
    onChange?: (tool: ViewerScissors) => void;
}

export interface ViewerScissors extends Omit<ScissorsController, 'setPixels' | 'moveTo' | 'clickAt' | 'setStraight'> {
    /** The canvas the outlines are drawn on. It lies over the viewer and lets all input through. */
    readonly canvas: HTMLCanvasElement;
    /**
     * Pixels of the viewer's full-resolution image per pixel of `image`. Multiply polygon
     * coordinates by it to get positions in the full-resolution image.
     */
    readonly scale: number;
    /** Switches to other pixels of the same picture. Clears all shapes unless `keepShapes` is set. */
    setImage(image: ImageSource, options?: { keepShapes?: boolean }): void;
    /** Redraws the outlines. */
    redraw(): void;
}

/**
 * Tracing in an OpenSeadragon viewer. Clicks place anchors, double-click closes; panning by
 * dragging and zooming with the wheel keep working, while zoom on click is turned off.
 *
 * Call it once the image is open, for example in the viewer's `open` event.
 */
export function attachToViewer(viewer: OpenSeadragon.Viewer, options: ViewerOptions): ViewerScissors {
    const tiledImage = viewer.world.getItemAt(options.item ?? 0);
    if (!tiledImage) {
        throw new Error('intelligent-scissors: the viewer has no image yet, attach in its "open" event');
    }
    const style: ScissorsStyle = { ...DEFAULT_STYLE, ...options.style };
    let pixels = rasterize(options.image).pixels;

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    viewer.canvas.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('intelligent-scissors: could not create a 2D canvas context');

    const controller = createController(pixels, {
        weights: options.weights,
        sigma: options.sigma,
        zeroCrossingThreshold: options.zeroCrossingThreshold,
        snapRadius: options.snapRadius,
        closeRadius: options.closeRadius,
        autoAnchor: options.autoAnchor,
        autoAnchorMinLength: options.autoAnchorMinLength,
        get simplify() {
            return options.simplify;
        },
        onComplete: polygon => options.onComplete?.(polygon, tool),
        onChange() {
            draw();
            options.onChange?.(tool);
        },
    });

    const tool: ViewerScissors = {
        canvas,
        get session() {
            return controller.session;
        },
        get scissors() {
            return controller.scissors;
        },
        get scale() {
            return fullResolutionScale();
        },
        shapes: controller.shapes,
        close: controller.close,
        undo: controller.undo,
        cancel: controller.cancel,
        clear: controller.clear,
        configure: controller.configure,
        setImage(next, setOptions) {
            pixels = rasterize(next).pixels;
            controller.setPixels(pixels, setOptions);
        },
        redraw: draw,
        destroy() {
            controller.destroy();
            viewer.removeHandler('canvas-click', onClick);
            viewer.removeHandler('canvas-double-click', onDoubleClick);
            viewer.removeHandler('update-viewport', draw);
            viewer.container.removeEventListener('pointermove', onPointerMove);
            viewer.container.removeEventListener('pointerleave', onPointerLeave);
            viewer.container.removeEventListener('keydown', onKeyDown, true);
            window.removeEventListener('keydown', onShift);
            window.removeEventListener('keyup', onShift);
            canvas.remove();
        },
    };

    function fullResolutionScale(): number {
        return tiledImage.getContentSize().x / pixels.width;
    }

    /** Position in the viewer element (CSS pixels) of a point given in pixels of the traced image. */
    function toViewer(x: number, y: number): OpenSeadragon.Point {
        const f = fullResolutionScale();
        return viewer.viewport.pixelFromPoint(tiledImage.imageToViewportCoordinates(x * f, y * f, true), true);
    }

    /** The pixel of the traced image under a position in the viewer element. */
    function toImage(position: OpenSeadragon.Point): Point {
        const p = tiledImage.viewportToImageCoordinates(viewer.viewport.pointFromPixel(position, true), true);
        const f = fullResolutionScale();
        return { x: Math.floor(p.x / f), y: Math.floor(p.y / f) };
    }

    /** CSS pixels per pixel of the traced image at the current zoom. */
    function zoom(): number {
        const origin = toViewer(0, 0);
        const right = toViewer(1, 0);
        return Math.hypot(right.x - origin.x, right.y - origin.y);
    }

    function draw() {
        const ratio = window.devicePixelRatio || 1;
        const width = Math.round(canvas.clientWidth * ratio);
        const height = Math.round(canvas.clientHeight * ratio);
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        ctx!.setTransform(1, 0, 0, 1, 0, 0);
        ctx!.clearRect(0, 0, width, height);

        // Where the viewer puts three corners of the image gives the whole transform,
        // rotation and flip included
        const origin = toViewer(0, 0);
        const right = toViewer(1, 0);
        const down = toViewer(0, 1);
        ctx!.setTransform(
            (right.x - origin.x) * ratio, (right.y - origin.y) * ratio,
            (down.x - origin.x) * ratio, (down.y - origin.y) * ratio,
            origin.x * ratio, origin.y * ratio,
        );
        drawShapes(ctx!, controller.shapes, controller.session, style, 1 / zoom());
    }

    function onClick(e: OpenSeadragon.CanvasClickEvent) {
        if (!e.quick) return; // the end of a drag
        e.preventDefaultAction = true;
        controller.clickAt(toImage(e.position), {
            straight: e.shift,
            closeHandleRadius: closeHandleRadius(style) / zoom(),
        });
    }

    function onDoubleClick(e: OpenSeadragon.CanvasDoubleClickEvent) {
        e.preventDefaultAction = true;
        controller.close();
    }

    function onPointerMove(e: PointerEvent) {
        const rect = viewer.container.getBoundingClientRect();
        // OpenSeadragon wants one of its own points; this copies one instead of needing the library here
        const position = viewer.viewport.getContainerSize().clone();
        position.x = e.clientX - rect.left;
        position.y = e.clientY - rect.top;
        controller.moveTo(toImage(position), { straight: e.shiftKey });
    }

    function onPointerLeave() {
        controller.moveTo(null);
    }

    function onKeyDown(e: KeyboardEvent) {
        if (!handleKey(controller, e.key)) return;
        e.preventDefault();
        e.stopPropagation();
    }

    function onShift(e: KeyboardEvent) {
        if (e.key === 'Shift') controller.setStraight(e.shiftKey);
    }

    viewer.addHandler('canvas-click', onClick);
    viewer.addHandler('canvas-double-click', onDoubleClick);
    viewer.addHandler('update-viewport', draw);
    viewer.container.addEventListener('pointermove', onPointerMove);
    viewer.container.addEventListener('pointerleave', onPointerLeave);
    if (options.keyboard ?? true) viewer.container.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keydown', onShift);
    window.addEventListener('keyup', onShift);
    draw();

    return tool;
}
