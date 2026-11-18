import { costMapToRGBA, polygonArea, type CostMap, type ImageInput } from 'intelligent-scissors';
import { attachScissors, type ImageSource, type ScissorsTool } from 'intelligent-scissors/canvas';
import { setUpHelp } from './help';
import { setUpRulers } from './rulers';
import { SAMPLES, type Sample } from './samples';
import { createSyntheticImage } from './synthetic';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const slider = (id: string) => byId<HTMLInputElement>(id);

const stage = byId<HTMLElement>('stage');
const canvas = byId<HTMLCanvasElement>('canvas');
const credit = byId<HTMLElement>('credit');
const status = byId<HTMLElement>('hint').parentElement!;
const windowing = byId<HTMLElement>('windowing');

let showCostMap = false;
let costMapImage: HTMLCanvasElement | null = null;
/** The current raw grayscale image, if any, so the window can be changed. */
let rawImage: ImageInput | null = null;

const tool = attachScissors(canvas, {
    image: createSyntheticImage(),
    snapRadius: 5,
    simplify: 0.75,
    autoAnchor: 12,
    background(ctx, t) {
        if (showCostMap) {
            costMapImage ??= renderCostMap(t.scissors.costMap);
            ctx.drawImage(costMapImage, 0, 0);
        } else {
            ctx.drawImage(t.image, 0, 0);
        }
    },
    onChange: showStatus,
});
const updateRulers = setUpRulers(canvas, byId('rulerX'), byId('rulerY'));

/** Says what the next click does, and sums up the finished shapes. */
function showStatus(t: ScissorsTool) {
    const { session, shapes } = t;
    let hint = 'Click on an edge to start tracing.';
    if (session.canClose) {
        hint = 'Click the first anchor or double-click to close the shape.';
    } else if (session.started) {
        hint = 'Move along the edge and click to fix the path.';
    } else if (shapes.length > 0) {
        const area = Math.round(shapes.reduce((sum, shape) => sum + polygonArea(shape), 0));
        const count = shapes.length === 1 ? '1 shape' : `${shapes.length} shapes`;
        hint = `${count}, ${area.toLocaleString('en')} px\u00b2. Click on an edge to trace another.`;
    }
    byId('hint').textContent = hint;
    byId('actions').hidden = shapes.length === 0;
}

function downloadPolygons() {
    const json = JSON.stringify({ width: canvas.width, height: canvas.height, polygons: tool.shapes });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    link.download = 'polygons.json';
    link.click();
    URL.revokeObjectURL(link.href);
}

function renderCostMap(map: CostMap): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = map.width;
    canvas.height = map.height;
    canvas.getContext('2d')!.putImageData(new ImageData(costMapToRGBA(map), map.width, map.height), 0, 0);
    return canvas;
}

function showImage(image: ImageSource, options?: { keepShapes?: boolean }) {
    costMapImage = null;
    tool.setImage(image, options);
    fitCanvas();
}

/**
 * Scales the canvas, up or down, to the largest size that fits the stage together with the
 * rulers, the status line and the caption. The tool maps the pointer through the canvas's
 * on-screen size, so this is safe.
 */
function fitCanvas() {
    const style = getComputedStyle(stage);
    const ruler = parseFloat(getComputedStyle(canvas.parentElement!).marginTop);
    const gap = 10;
    const width = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - ruler;
    const height =
        stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) -
        ruler - status.offsetHeight - credit.offsetHeight - 2 * gap;
    const scale = Math.min(width / canvas.width, height / canvas.height);
    if (!(scale > 0)) return;
    canvas.style.width = `${Math.floor(canvas.width * scale)}px`;
    canvas.style.height = `${Math.floor(canvas.height * scale)}px`;
    updateRulers();

    // The status line and the caption are as wide as the image. A narrower image can wrap
    // the caption onto more lines, which leaves less height, so fit once more in that case.
    const figure = canvas.closest('figure')!;
    const captionHeight = credit.offsetHeight;
    figure.style.width = `${Math.floor(canvas.width * scale) + ruler}px`;
    if (credit.offsetHeight !== captionHeight) fitCanvas();
}

new ResizeObserver(fitCanvas).observe(stage);

function setSigma(sigma: number) {
    slider('sigma').value = String(sigma);
    slider('sigmaOut').textContent = sigma.toFixed(2);
}

async function openSample(sample: Sample) {
    for (const button of document.querySelectorAll<HTMLButtonElement>('#samples button')) {
        button.setAttribute('aria-checked', String(button.dataset.id === sample.id));
    }
    credit.textContent = sample.credit;
    fitCanvas();

    const image = await sample.load();
    if (sample.window && 'data' in image && !(image instanceof ImageData)) {
        rawImage = image;
        setWindowSliders(sample.window);
        windowing.hidden = false;
        showImage({ ...image, window: sample.window });
    } else {
        rawImage = null;
        windowing.hidden = true;
        showImage(image);
    }

    if (Number(slider('sigma').value) !== sample.sigma) {
        setSigma(sample.sigma);
        costMapImage = null;
        tool.configure({ sigma: sample.sigma });
    }
}

/** Opens a dropped or picked file. Large photos are scaled down to keep the cost map quick. */
async function openFile(file: File) {
    if (!file.type.startsWith('image/')) return;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    for (const button of document.querySelectorAll('#samples button')) button.setAttribute('aria-checked', 'false');
    credit.textContent = file.name;
    rawImage = null;
    windowing.hidden = true;
    showImage(canvas);
}

/*
 * Brightness and contrast are the DICOM window turned around: a lower centre makes the
 * image brighter and a narrower width raises the contrast. Each slider runs the other way
 * so that moving it to the right means more.
 */
const flip = (input: HTMLInputElement, value: number) => Number(input.min) + Number(input.max) - value;

function setWindowSliders(window: { center: number; width: number }) {
    slider('brightness').value = String(flip(slider('brightness'), window.center));
    slider('contrast').value = String(flip(slider('contrast'), window.width));
}

function windowFromSliders() {
    return {
        center: flip(slider('brightness'), Number(slider('brightness').value)),
        width: flip(slider('contrast'), Number(slider('contrast').value)),
    };
}

function setUpImageInput() {
    const list = byId('samples');
    for (const sample of SAMPLES) {
        const button = document.createElement('button');
        button.type = 'button';
        button.role = 'radio';
        button.dataset.id = sample.id;
        button.textContent = sample.label;
        button.addEventListener('click', () => void openSample(sample));
        list.append(button);
    }

    byId<HTMLInputElement>('file').addEventListener('change', e => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) void openFile(file);
    });

    stage.addEventListener('dragover', e => {
        e.preventDefault();
        stage.classList.add('dragging');
    });
    stage.addEventListener('dragleave', () => stage.classList.remove('dragging'));
    stage.addEventListener('drop', e => {
        e.preventDefault();
        stage.classList.remove('dragging');
        const file = e.dataTransfer?.files[0];
        if (file) void openFile(file);
    });

    // A new window changes the cost map but not the geometry, so traced shapes stay
    let timer = 0;
    for (const id of ['brightness', 'contrast']) {
        slider(id).addEventListener('input', () => {
            clearTimeout(timer);
            timer = window.setTimeout(() => {
                if (rawImage) showImage({ ...rawImage, window: windowFromSliders() }, { keepShapes: true });
            }, 80);
        });
    }
}

function setUpControls() {
    for (const input of document.querySelectorAll<HTMLInputElement>('input[name="view"]')) {
        input.addEventListener('change', () => {
            showCostMap = input.value === 'cost';
            tool.redraw();
        });
    }

    slider('autoAnchor').addEventListener('change', e => {
        tool.configure({ autoAnchor: (e.target as HTMLInputElement).checked ? 12 : 0 });
    });

    const weights = ['gradient', 'laplacian', 'direction', 'sigma'] as const;
    const value = (id: (typeof weights)[number]) => Number(slider(id).value);
    const showValues = () => {
        for (const id of weights) byId(`${id}Out`).textContent = value(id).toFixed(2);
    };

    // Rebuilding the cost map takes a moment on large images, so wait until the slider rests
    let timer = 0;
    for (const id of weights) {
        slider(id).addEventListener('input', () => {
            showValues();
            clearTimeout(timer);
            timer = window.setTimeout(() => {
                costMapImage = null;
                tool.configure({
                    sigma: value('sigma'),
                    weights: { gradient: value('gradient'), laplacian: value('laplacian'), direction: value('direction') },
                });
            }, 120);
        });
    }
    showValues();

    byId('clear').addEventListener('click', () => tool.clear());
    byId('download').addEventListener('click', downloadPolygons);

    const copy = byId('copyInstall');
    copy.addEventListener('click', async () => {
        await navigator.clipboard.writeText(byId('installCommand').textContent ?? '');
        copy.textContent = 'Copied';
        setTimeout(() => (copy.textContent = 'Copy'), 1500);
    });
}

setUpImageInput();
setUpControls();
setUpHelp();
showStatus(tool);
void openSample(SAMPLES[0]);
