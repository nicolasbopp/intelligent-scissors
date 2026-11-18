/**
 * Tracing on a deep-zoom slide in OpenSeadragon. Edges are found on a downscaled copy of
 * the slide; the polygons are scaled back to full resolution when they are saved.
 */
import OpenSeadragon from 'openseadragon';
import { attachToViewer } from 'intelligent-scissors/openseadragon';

declare function saveAnnotation(polygon: { x: number; y: number }[]): void;

const viewer = OpenSeadragon({
    element: document.getElementById('viewer')!,
    tileSources: '/slides/biopsy.dzi',
    // The data of the tiles is read below, which needs CORS if they come from another origin
    crossOriginPolicy: 'Anonymous',
});

viewer.addHandler('open', async () => {
    // Most slide servers can deliver an overview at a size of your choice
    const overview = new Image();
    overview.crossOrigin = 'anonymous';
    overview.src = '/slides/biopsy/overview?width=3000';
    await overview.decode();

    const tool = attachToViewer(viewer, {
        image: overview,
        sigma: 1.5, // tissue is textured, a little more smoothing helps
        autoAnchor: 12,
        simplify: 0.75,
        onComplete(polygon) {
            // In pixels of the full-resolution slide
            saveAnnotation(polygon.map(p => ({ x: p.x * tool.scale, y: p.y * tool.scale })));
        },
    });
});
