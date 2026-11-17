// Using ScissorsSession inside a viewer that has its own zoom and pan.
//
// The session works purely in image pixels and never touches the DOM. Your viewer converts
// pointer events into image coordinates and draws whatever the session reports. The same
// pattern works for Konva, Fabric, OpenSeadragon, Cornerstone or a WebGL viewer.

import { createScissors, ScissorsSession, type Point } from 'intelligent-scissors';

const canvas = document.getElementById('viewer') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const image = await createImageBitmap(await (await fetch('scan.png')).blob());

// Read the pixels once
const pixels = new OffscreenCanvas(image.width, image.height).getContext('2d')!;
pixels.drawImage(image, 0, 0);
const imageData = pixels.getImageData(0, 0, image.width, image.height);

const session = new ScissorsSession(createScissors(imageData, { sigma: 1.5 }));
const view = { zoom: 2, panX: -200, panY: -100 }; // whatever your viewer uses
const outlines: Point[][] = [];

function toImage(e: MouseEvent): Point {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left - view.panX) / view.zoom,
        y: (e.clientY - rect.top - view.panY) / view.zoom,
    };
}

canvas.addEventListener('click', e => {
    if (session.click(toImage(e)) === 'closed') {
        outlines.push(session.polygon());
        session.reset();
    }
    render();
});

canvas.addEventListener('pointermove', e => {
    session.move(toImage(e));
    render();
});

canvas.addEventListener('dblclick', () => {
    const polygon = session.close();
    if (polygon) outlines.push(polygon);
    session.reset();
    render();
});

function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.zoom, 0, 0, view.zoom, view.panX, view.panY);
    ctx.drawImage(image, 0, 0);
    ctx.lineWidth = 2 / view.zoom;

    ctx.strokeStyle = '#ffd60a';
    for (const outline of outlines) stroke(outline, true);
    for (const segment of session.segments) stroke(segment, false);

    ctx.strokeStyle = '#4cc9f0';
    stroke(session.livePath, false);
}

function stroke(points: readonly Point[], closed: boolean) {
    if (points.length < 2) return;
    ctx.beginPath();
    // +0.5 puts the line through the pixel centres
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x + 0.5, p.y + 0.5) : ctx.lineTo(p.x + 0.5, p.y + 0.5)));
    if (closed) ctx.closePath();
    ctx.stroke();
}

render();
