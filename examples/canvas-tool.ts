// The quickest way to use the library: turn a <canvas> into a tracing tool.
//
//   <img id="photo" src="cells.jpg" hidden>
//   <canvas id="canvas" style="max-width: 100%"></canvas>
//   <button id="undo">Undo</button>

import { attachScissors } from 'intelligent-scissors/canvas';

const img = document.getElementById('photo') as HTMLImageElement;
await img.decode();

const tool = attachScissors(document.getElementById('canvas') as HTMLCanvasElement, {
    image: img,
    snapRadius: 5, // clicks jump to the strongest edge within 5 px
    simplify: 1, // reduce the one-point-per-pixel outline to fewer vertices
    style: { stroke: '#ff3b30', fill: 'rgba(255, 59, 48, 0.2)' },
    onComplete(polygon) {
        console.log(`traced ${polygon.length} vertices`, polygon);
    },
});

document.getElementById('undo')!.addEventListener('click', () => tool.undo());

// Later, e.g. when the component unmounts:
// tool.destroy();
