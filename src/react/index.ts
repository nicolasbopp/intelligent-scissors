import { useCallback, useEffect, useRef, useState } from 'react';
import { attachScissors, type AttachOptions, type ImageSource, type ScissorsTool } from '../canvas';
import type { Point } from '../core/types';

export interface UseScissorsOptions extends Omit<AttachOptions, 'image'> {
    /** The image to trace. Pass `null` while it is still loading; the tool starts once it is there. */
    image: ImageSource | null | undefined;
}

export interface UseScissors {
    /** Goes on the `<canvas>` the tool should use: `<canvas ref={ref} />`. */
    ref: (canvas: HTMLCanvasElement | null) => void;
    /** Finished polygons in image pixels, oldest first. A new array whenever one is added or removed. */
    shapes: readonly Point[][];
    /** True while a shape is being traced. */
    tracing: boolean;
    /** The tool itself, for `undo()`, `clear()` and so on. `null` until canvas and image are there. */
    tool: ScissorsTool | null;
}

/**
 * The canvas tool as a React hook.
 *
 * ```tsx
 * const { ref, shapes, tool } = useScissors({ image, autoAnchor: 12 });
 * return <canvas ref={ref} />;
 * ```
 *
 * A new `image` replaces the current one and clears the shapes. Changes to the tracing
 * options (`weights`, `sigma`, `snapRadius`, `autoAnchor`, ...) are applied to the running
 * tool. The callbacks, `background` and `simplify` may change on every render. `style` and
 * `keyboard` are read once, when the tool is created.
 */
export function useScissors(options: UseScissorsOptions): UseScissors {
    const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
    const [tool, setTool] = useState<ScissorsTool | null>(null);
    const [shapes, setShapes] = useState<readonly Point[][]>([]);
    const [tracing, setTracing] = useState(false);

    // The tool reads these through `latest`, so it always sees the current render's values
    const latest = useRef(options);
    latest.current = options;
    /** The image the tool currently shows, to tell a new image from a re-render. */
    const shown = useRef<ImageSource | null>(null);

    const { image } = options;
    const hasImage = image != null;

    useEffect(() => {
        const first = latest.current.image;
        if (!canvas || first == null) return;

        const created = attachScissors(canvas, {
            ...latest.current,
            image: first,
            get simplify() {
                return latest.current.simplify;
            },
            get background() {
                return latest.current.background;
            },
            onComplete: (polygon, t) => latest.current.onComplete?.(polygon, t),
            onChange(t) {
                setShapes(current => (sameShapes(current, t.shapes) ? current : [...t.shapes]));
                setTracing(t.session.started);
                latest.current.onChange?.(t);
            },
        });
        shown.current = first;
        setTool(created);

        return () => {
            created.destroy();
            shown.current = null;
            setTool(null);
            setShapes([]);
            setTracing(false);
        };
    }, [canvas, hasImage]);

    useEffect(() => {
        if (!tool || image == null || image === shown.current) return;
        shown.current = image;
        tool.setImage(image);
    }, [tool, image]);

    // Two groups, because changing the first means computing the cost map again
    const { weights, sigma, zeroCrossingThreshold, snapRadius, closeRadius, autoAnchor, autoAnchorMinLength } = options;
    const costKey = JSON.stringify([weights, sigma, zeroCrossingThreshold]);
    const sessionKey = JSON.stringify([snapRadius, closeRadius, autoAnchor, autoAnchorMinLength]);
    const applied = useRef({ costKey, sessionKey });
    useEffect(() => {
        const before = applied.current;
        applied.current = { costKey, sessionKey };
        if (!tool || (before.costKey === costKey && before.sessionKey === sessionKey)) return;
        const o = latest.current;
        tool.configure({
            snapRadius: o.snapRadius,
            closeRadius: o.closeRadius,
            autoAnchor: o.autoAnchor,
            autoAnchorMinLength: o.autoAnchorMinLength,
            ...(before.costKey !== costKey && {
                weights: o.weights,
                sigma: o.sigma,
                zeroCrossingThreshold: o.zeroCrossingThreshold,
            }),
        });
    }, [tool, costKey, sessionKey]);

    const ref = useCallback((element: HTMLCanvasElement | null) => setCanvas(element), []);
    return { ref, shapes, tracing, tool };
}

function sameShapes(a: readonly Point[][], b: readonly Point[][]): boolean {
    return a.length === b.length && a.every((shape, i) => shape === b[i]);
}
