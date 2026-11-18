# Changelog

## 0.4.0 (2026-11-18)

- New entry point `intelligent-scissors/openseadragon` with `attachToViewer`: tracing inside
  an OpenSeadragon viewer, with its zooming and panning left intact. Edges can be found on a
  downscaled copy of a slide. OpenSeadragon is an optional peer dependency
- `createController` and `drawShapes` are exported from `intelligent-scissors/canvas`, for
  connecting viewers that have their own events and drawing. `attachScissors` is built on
  them and behaves as before
- Canvas tool: a click that ends a drag no longer places an anchor, so the canvas can sit in
  a container that pans

## 0.3.0 (2026-11-18)

- New entry point `intelligent-scissors/react` with the `useScissors` hook: the canvas tool
  for React, with the finished shapes as state. React is an optional peer dependency; the
  other entry points don't need it

## 0.2.0 (2026-11-18)

- New entry point `intelligent-scissors/mask` for getting annotations into and out of
  training formats:
  - `maskToPolygons` traces the outline of every region in a mask
  - `encodeRle` and `decodeRle` write and read COCO RLE, as numbers or as the compact string,
    checked against pycocotools
  - `maskArea`, `maskIoU` and `maskBounds`
- README: removed the status note

## 0.1.0 (2026-11-18)

First version.

- Cost function after Mortensen & Barrett: Laplacian zero crossings, gradient magnitude and
  gradient direction, with adjustable weights and Gaussian pre-smoothing
- Incremental Dijkstra search on a typed-array heap; `searchTowards` and `hasPathTo` to
  spread long searches over several frames
- Accepts RGBA (`ImageData`) and grayscale arrays of any numeric type, with optional windowing
- `ScissorsSession`: anchors, edge snapping, closing, undo and optional path cooling
  (`autoAnchor`), without DOM dependencies. Single segments can be straight lines for places
  without an edge (`{ straight: true }`, Shift in the canvas tool)
- `intelligent-scissors/canvas`: a ready-made canvas tool with mouse and keyboard handling.
  Searches in slices of a few milliseconds per frame, so the page stays responsive on large
  images, and takes raw 16-bit data with a display window as well as regular images. Lines
  and anchors keep their size on screen when the canvas is scaled with CSS
- Helpers: `simplifyPath`, `polygonToMask`, `polygonArea`, `costMapToRGBA`
- Demo page with sample images (pelvic MRI, cell microscopy) and examples
