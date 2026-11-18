/** Distances between numbered ticks, in image pixels. Each is divided into five minor ticks. */
const STEPS = [10, 20, 50, 100, 200, 500, 1000, 2000];
/** Numbered ticks are at least this far apart on screen. */
const MIN_SPACING = 56;

/**
 * Rulers along the top and left of the canvas, in image pixels: the unit the traced polygons
 * come in. A mark on each follows the pointer.
 */
export function setUpRulers(canvas: HTMLCanvasElement, rulerX: HTMLElement, rulerY: HTMLElement) {
    const markX = document.createElement('i');
    const markY = document.createElement('i');
    markX.hidden = markY.hidden = true;

    function update() {
        const scale = canvas.clientWidth / canvas.width;
        if (!(scale > 0)) return;
        const step = STEPS.find(s => s * scale >= MIN_SPACING) ?? STEPS[STEPS.length - 1];
        const minor = `${(step / 5) * scale}px`;

        const ticks = (length: number, side: 'left' | 'top') => {
            const spans: HTMLElement[] = [];
            for (let v = 0; v < length; v += step) {
                const span = document.createElement('span');
                span.textContent = String(v);
                span.style[side] = `${v * scale}px`;
                spans.push(span);
            }
            return spans;
        };
        rulerX.style.setProperty('--minor', minor);
        rulerY.style.setProperty('--minor', minor);
        rulerX.replaceChildren(...ticks(canvas.width, 'left'), markX);
        rulerY.replaceChildren(...ticks(canvas.height, 'top'), markY);
    }

    canvas.addEventListener('pointermove', e => {
        markX.hidden = markY.hidden = false;
        markX.style.transform = `translateX(${e.offsetX}px)`;
        markY.style.transform = `translateY(${e.offsetY}px)`;
    });
    canvas.addEventListener('pointerleave', () => {
        markX.hidden = markY.hidden = true;
    });

    new ResizeObserver(update).observe(canvas);
    return update;
}
