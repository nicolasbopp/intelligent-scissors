import { costMapToRGBA, polygonArea, type CostMap } from 'intelligent-scissors';
import { attachScissors, type ImageSource } from 'intelligent-scissors/canvas';
import { createSampleImage } from './sample';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('canvas');
const stage = $<HTMLElement>('stage');
const stats = $<HTMLParagraphElement>('stats');
let view: 'image' | 'cost' = 'image';
let costView: HTMLCanvasElement | null = null;

const tool = attachScissors(canvas, {
    image: createSampleImage(),
    snapRadius: 5,
    simplify: 0.75,
    background: (ctx, t) => {
        if (view === 'cost') {
            costView ??= renderCostMap(t.scissors.costMap);
            ctx.drawImage(costView, 0, 0);
        } else {
            ctx.drawImage(t.image, 0, 0);
        }
    },
    onChange: updateStats,
});

function renderCostMap(map: CostMap): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = map.width;
    c.height = map.height;
    c.getContext('2d')!.putImageData(new ImageData(costMapToRGBA(map), map.width, map.height), 0, 0);
    return c;
}

function updateStats() {
    const { shapes, session } = tool;
    if (shapes.length === 0 && !session.started) {
        stats.textContent = 'No shapes yet.';
        return;
    }
    const last = shapes[shapes.length - 1];
    const parts = [`${shapes.length} shape${shapes.length === 1 ? '' : 's'}`];
    if (last) parts.push(`last: ${last.length} vertices, ${Math.round(polygonArea(last)).toLocaleString()} px²`);
    if (session.started) parts.push(`tracing: ${session.anchors.length} anchor${session.anchors.length === 1 ? '' : 's'}`);
    stats.textContent = parts.join(' · ');
}

function setImage(image: ImageSource) {
    costView = null;
    tool.setImage(image);
}

// ── image loading ───────────────────────────────────────────────────────────
async function loadFile(file: File) {
    if (!file.type.startsWith('image/')) return;
    const bitmap = await createImageBitmap(file);
    // Large photos: scale down so the cost map stays quick to compute
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bitmap.width * scale);
    c.height = Math.round(bitmap.height * scale);
    c.getContext('2d')!.drawImage(bitmap, 0, 0, c.width, c.height);
    bitmap.close();
    setImage(c);
}

$<HTMLInputElement>('file').addEventListener('change', e => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) void loadFile(file);
});
$('sample').addEventListener('click', () => setImage(createSampleImage()));

stage.addEventListener('dragover', e => {
    e.preventDefault();
    stage.classList.add('dragging');
});
stage.addEventListener('dragleave', () => stage.classList.remove('dragging'));
stage.addEventListener('drop', e => {
    e.preventDefault();
    stage.classList.remove('dragging');
    const file = e.dataTransfer?.files[0];
    if (file) void loadFile(file);
});

// ── controls ────────────────────────────────────────────────────────────────
document.querySelectorAll<HTMLInputElement>('input[name="view"]').forEach(input =>
    input.addEventListener('change', () => {
        view = input.value as 'image' | 'cost';
        tool.redraw();
    }),
);

const sliders = ['gradient', 'laplacian', 'direction', 'sigma'] as const;
const value = (id: (typeof sliders)[number]) => Number($<HTMLInputElement>(id).value);

function showValues() {
    for (const id of sliders) $(`${id}Out`).textContent = value(id).toFixed(2);
}

let pending = 0;
for (const id of sliders) {
    $<HTMLInputElement>(id).addEventListener('input', () => {
        showValues();
        clearTimeout(pending);
        pending = window.setTimeout(() => {
            tool.configure({
                sigma: value('sigma'),
                weights: { gradient: value('gradient'), laplacian: value('laplacian'), direction: value('direction') },
            });
            costView = null;
            tool.redraw();
        }, 120);
    });
}
showValues();

$('undo').addEventListener('click', () => tool.undo());
$('clear').addEventListener('click', () => tool.clear());
$('export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(tool.shapes, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'shapes.json';
    a.click();
    URL.revokeObjectURL(a.href);
});
