import type { ScissorsSession } from '../core/session';
import type { Point } from '../core/types';

export interface ScissorsStyle {
    /** Colour of fixed segments and finished shapes. */
    stroke: string;
    /** Colour of the live path that follows the pointer. */
    liveStroke: string;
    /** Fill of finished shapes. */
    fill: string;
    /** Fill of the anchor handles. */
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

/** Draws finished shapes and the shape in progress. Expects a context in image pixels. */
export function drawShapes(
    ctx: CanvasRenderingContext2D,
    shapes: readonly (readonly Point[])[],
    session: ScissorsSession,
    style: ScissorsStyle,
): void {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = style.lineWidth;

    for (const shape of shapes) {
        tracePath(ctx, shape, true);
        ctx.fillStyle = style.fill;
        ctx.fill();
        ctx.strokeStyle = style.stroke;
        ctx.stroke();
    }

    ctx.strokeStyle = style.stroke;
    for (const segment of session.segments) {
        tracePath(ctx, segment, false);
        ctx.stroke();
    }

    if (session.livePath.length > 1) {
        ctx.strokeStyle = style.liveStroke;
        tracePath(ctx, session.livePath, false);
        ctx.stroke();
    }

    // The first anchor grows once clicking it would close the shape
    session.anchors.forEach((anchor, i) => {
        const radius = i === 0 && session.canClose ? style.anchorRadius * 1.6 : style.anchorRadius;
        ctx.beginPath();
        ctx.arc(anchor.x + 0.5, anchor.y + 0.5, radius, 0, Math.PI * 2);
        ctx.fillStyle = style.anchor;
        ctx.fill();
        ctx.strokeStyle = style.stroke;
        ctx.stroke();
    });

    ctx.restore();
}

/** Builds a path through the pixel centres. */
function tracePath(ctx: CanvasRenderingContext2D, points: readonly Point[], closed: boolean): void {
    ctx.beginPath();
    points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x + 0.5, p.y + 0.5);
        else ctx.lineTo(p.x + 0.5, p.y + 0.5);
    });
    if (closed) ctx.closePath();
}
