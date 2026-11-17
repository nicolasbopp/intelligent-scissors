# intelligent-scissors

Live-wire segmentation for the browser, also known as Intelligent Scissors or the magnetic
lasso. You click a few points around an object, and the outline between them follows the
object's edges.

![Tracing an outline in the demo](docs/demo.gif)

[Live demo](https://nicolasbopp.github.io/intelligent-scissors/) · [Examples](examples/) · [Changelog](CHANGELOG.md)

I wrote the first version of this for an MRI annotation tool in my master's thesis and split
it out because I couldn't find a small, standalone implementation. OpenCV.js has one, but it
means shipping several megabytes of WASM. The others I found are tied to a particular viewer.
This package has no dependencies, runs on any `ImageData` or plain number array, and comes
to about 4 kB gzipped.

> **Status:** 0.1, not on npm yet. The API may still change.

## Install

Until the first npm release, install from GitHub:

```sh
npm install github:nicolasbopp/intelligent-scissors
```

## Usage

### Canvas tool

`attachScissors` turns a `<canvas>` into a complete tracing tool:

```ts
import { attachScissors } from 'intelligent-scissors/canvas';

const img = document.querySelector('img')!;
await img.decode();

const tool = attachScissors(document.querySelector('canvas')!, {
  image: img,
  onComplete(polygon) {
    console.log(polygon); // [{ x, y }, ...] in image pixels
  },
});
```

Click to place an anchor and move the mouse to see the path. To close the shape, double-click,
press Enter, or click the first anchor again. Backspace removes the last anchor and Esc
discards the shape.

The canvas takes the size of the image, so scale it with CSS. If you already have a viewer and
only need the outline on top of it, pass `background: 'none'` and lay the canvas over it.

### In your own viewer

When you need control over rendering, zoom or input handling, use `ScissorsSession`
directly. It keeps track of anchors and paths but doesn't touch the DOM. You give it pointer
positions in image pixels and draw what it returns:

```ts
import { createScissors, ScissorsSession } from 'intelligent-scissors';

const session = new ScissorsSession(createScissors(imageData));

viewer.on('click', e => {
  if (session.click(toImagePixels(e)) === 'closed') save(session.polygon());
});

viewer.on('pointermove', e => {
  session.move(toImagePixels(e));
  draw(session.segments, session.livePath, session.anchors);
});
```

[examples/custom-viewer.ts](examples/custom-viewer.ts) has a complete version with zoom and pan.

### Grayscale and medical images

Grayscale input can be any numeric array, for example the `Int16Array` of a CT slice. A
window (centre and width, like in a DICOM viewer) limits edge detection to the intensity
range you care about:

```ts
import { createScissors, polygonToMask } from 'intelligent-scissors';

const scissors = createScissors(
  { data: pixels, width: 512, height: 512, window: { center: 40, width: 400 } },
  { sigma: 1.5 },
);

scissors.setSeed({ x: 200, y: 180 });
const path = scissors.pathTo({ x: 260, y: 150 });

// once you have a closed polygon:
const mask = polygonToMask(polygon, 512, 512); // Uint8Array, 1 = inside
```

[examples/grayscale-mask.ts](examples/grayscale-mask.ts) runs in Node and prints the result.

## Options

| Option | Default | |
| --- | --- | --- |
| `weights` | `{ laplacian: 0.43, gradient: 0.43, direction: 0.14 }` | Weighting of the three cost terms, see below. |
| `sigma` | `1` | Gaussian blur in pixels before edge detection. Increase for noisy images. |
| `zeroCrossingThreshold` | `0.1` | Ignores Laplacian zero crossings where the gradient is weaker than this fraction of the image's strongest gradient. |
| `snapRadius` | `4` | Clicked anchors move to the strongest edge within this radius. `0` turns it off. |
| `closeRadius` | `6` | A click this close to the first anchor closes the shape. |

The canvas tool also takes `style`, `background`, `simplify` (tolerance in pixels for
Ramer–Douglas–Peucker), `keyboard`, `onComplete` and `onChange`.

## API

From `intelligent-scissors`:

- `createScissors(image, options?)` computes the cost map and returns the path finder.
  - `.setSeed(point)` starts a search from a pixel.
  - `.pathTo(point)` returns the cheapest path from the seed to `point`, both ends included.
  - `.snap(point, radius)` returns the pixel on the strongest edge near `point`.
- `new ScissorsSession(scissors, options?)` manages one shape: `click`, `move`, `close`,
  `undo`, `reset`, `polygon()`, and the read-only `anchors`, `segments` and `livePath`.
- `simplifyPath(points, tolerance)`, `polygonToMask(polygon, width, height)` and
  `polygonArea(polygon)` are helpers for the result.
- `computeCostMap(image, options)` and `costMapToRGBA(map)` give access to the cost map, for
  example to visualise it as the demo does.

From `intelligent-scissors/canvas`:

- `attachScissors(canvas, options)` returns a tool with `shapes`, `close()`, `undo()`,
  `cancel()`, `clear()`, `setImage()`, `configure()`, `redraw()` and `destroy()`.

All types are exported, and the declaration files include the documentation.

## How it works

This follows the original paper by Mortensen and Barrett (*Intelligent Scissors for Image
Composition*, SIGGRAPH 1995).

The image is treated as a graph where every pixel connects to its eight neighbours. A step
from one pixel to the next gets a cost made of three terms:

- **Laplacian zero crossing**: zero exactly on an edge, otherwise one. This keeps the path
  on the edge itself rather than next to it.
- **Gradient magnitude**: low on strong edges.
- **Gradient direction**: low when the step runs along the edge, high when it cuts across.
  This smooths the path.

The features are computed once per image. Clicking an anchor starts Dijkstra's algorithm
from that pixel. The search is incremental: `pathTo` only expands until it reaches the
pointer and continues from there on the next call. Near the anchor that means a few hundred
pixels instead of the whole image.

## Performance

These numbers are from headless Edge on a laptop with a 1600 × 1067 image (1.7 megapixels):

- The cost map takes 0.2 to 0.4 seconds, once per image.
- A path to a point about 150 px from the anchor takes about 30 ms.
- The first path across the entire image takes about a second. After that, every point in
  the explored area is instant.

That last case blocks the main thread. Until there is a worker mode, scale large images down
before tracing and scale the polygon back up.

## Roadmap

- Running the search in a Web Worker
- Path cooling (anchors that are set automatically when part of the path stays stable)
- A React hook
- On-the-fly training, where the cost adapts to the edge you are currently following

## Development

```sh
pnpm install
pnpm dev         # demo on http://localhost:5173
pnpm test
pnpm typecheck   # also checks examples/
pnpm build       # ESM, CJS and type declarations in dist/
```

## License

[MIT](LICENSE)
