# Examples

| File | What it shows |
| --- | --- |
| [canvas-tool.ts](canvas-tool.ts) | The drop-in canvas tool, in about ten lines. |
| [react.tsx](react.tsx) | The `useScissors` hook in a component with undo, clear and a list of shapes. |
| [custom-viewer.ts](custom-viewer.ts) | `ScissorsSession` in a viewer with its own zoom and pan. |
| [grayscale-mask.ts](grayscale-mask.ts) | 16-bit grayscale input with windowing, polygon to mask. Runs in Node. |
| [coco-export.ts](coco-export.ts) | A traced outline as a COCO annotation with an RLE mask, and a mask back to outlines. Runs in Node. |

The examples import from `intelligent-scissors` like an app would. They are type-checked
together with the library (`pnpm typecheck`), so they stay in sync with the API.

To run the Node examples:

```sh
pnpm build
node --experimental-strip-types examples/grayscale-mask.ts
node --experimental-strip-types examples/coco-export.ts
```

For a complete browser app, see [`demo/`](../demo).
