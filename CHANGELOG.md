# Changelog

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
