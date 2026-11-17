import { toLuminance } from '../core/costMap';
import type { ImageInput } from '../core/types';

/**
 * What the canvas tool can trace: anything the browser can draw, `ImageData`, or raw pixel
 * data as accepted by `createScissors`, e.g. a 16-bit MRI slice with a display window.
 */
export type ImageSource = HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas | ImageData | ImageInput;

export interface RasterizedImage {
    /** The pixels the cost map is computed from. Raw input stays raw, at full precision. */
    pixels: ImageInput;
    /** The image on a canvas of its own size, for drawing. */
    canvas: HTMLCanvasElement;
}

export function rasterize(image: ImageSource): RasterizedImage {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('intelligent-scissors: could not create a 2D canvas context');

    if (image instanceof ImageData) {
        canvas.width = image.width;
        canvas.height = image.height;
        ctx.putImageData(image, 0, 0);
        return { pixels: image, canvas };
    }

    if (isPixelData(image)) {
        canvas.width = image.width;
        canvas.height = image.height;
        ctx.putImageData(toDisplayImage(image), 0, 0);
        return { pixels: image, canvas };
    }

    const { width, height } = sizeOf(image);
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(image, 0, 0);
    return { pixels: ctx.getImageData(0, 0, width, height), canvas };
}

function isPixelData(image: ImageSource): image is ImageInput {
    return 'data' in image && !(image instanceof ImageData);
}

/** Renders raw input the way the cost map sees it: grayscale, windowed, 0 to 255. */
function toDisplayImage(image: ImageInput): ImageData {
    const n = image.width * image.height;
    if (image.data.length === n * 4) {
        return new ImageData(Uint8ClampedArray.from(image.data), image.width, image.height);
    }
    const gray = toLuminance(image);
    const rgba = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
        const v = Math.round(gray[i] * 255);
        rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v;
        rgba[i * 4 + 3] = 255;
    }
    return new ImageData(rgba, image.width, image.height);
}

function sizeOf(image: HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas) {
    if (image instanceof HTMLImageElement) {
        if (!image.complete || image.naturalWidth === 0) {
            throw new Error('intelligent-scissors: the image has not loaded yet, await img.decode() first');
        }
        return { width: image.naturalWidth, height: image.naturalHeight };
    }
    return { width: image.width, height: image.height };
}
