import type { CostWeights, ImageInput, ScissorsOptions } from './types';

export const DEFAULT_WEIGHTS: Readonly<CostWeights> = { laplacian: 0.43, gradient: 0.43, direction: 0.14 };

/**
 * Per-pixel features from which the cost of every link between neighbouring pixels is
 * derived on the fly (Mortensen & Barrett, "Intelligent Scissors for Image Composition", 1995).
 */
export interface CostMap {
    readonly width: number;
    readonly height: number;
    readonly weights: Readonly<CostWeights>;
    /** f_Z: 0 on a Laplacian zero crossing (exact edge position), 1 elsewhere. */
    readonly laplacianCost: Uint8Array;
    /** f_G: 1 − normalised gradient magnitude; 0 on the strongest edge in the image. */
    readonly gradientCost: Float32Array;
    /** Unit vector perpendicular to the gradient (along the edge); (0, 0) in flat regions. */
    readonly edgeDirX: Float32Array;
    readonly edgeDirY: Float32Array;
}

/** Converts any supported input to luminance in [0, 1]. */
export function toLuminance(image: ImageInput): Float32Array {
    const { data, width, height } = image;
    const n = width * height;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
        throw new Error(`intelligent-scissors: invalid image size ${width}×${height}`);
    }
    const out = new Float32Array(n);

    if (data.length === n * 4) {
        for (let i = 0, j = 0; i < n; i++, j += 4) {
            // Rec. 601 luma; alpha is ignored
            out[i] = (0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]) / 255;
        }
        return out;
    }

    if (data.length !== n) {
        throw new Error(
            `intelligent-scissors: data length ${data.length} matches neither RGBA (${n * 4}) nor grayscale (${n}) for a ${width}×${height} image`,
        );
    }

    let lo: number;
    let hi: number;
    if (image.window) {
        lo = image.window.center - image.window.width / 2;
        hi = image.window.center + image.window.width / 2;
    } else {
        lo = Infinity;
        hi = -Infinity;
        for (let i = 0; i < n; i++) {
            const v = data[i];
            if (v < lo) lo = v;
            if (v > hi) hi = v;
        }
    }
    const range = hi - lo || 1;
    for (let i = 0; i < n; i++) {
        const v = (data[i] - lo) / range;
        out[i] = v < 0 ? 0 : v > 1 ? 1 : v;
    }
    return out;
}

/** Separable Gaussian blur with clamped borders. */
export function gaussianBlur(src: Float32Array, width: number, height: number, sigma: number): Float32Array {
    if (sigma <= 0) return src;
    const radius = Math.max(1, Math.ceil(sigma * 3));
    const kernel = new Float32Array(2 * radius + 1);
    let sum = 0;
    for (let i = -radius; i <= radius; i++) {
        const w = Math.exp(-(i * i) / (2 * sigma * sigma));
        kernel[i + radius] = w;
        sum += w;
    }
    for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

    const tmp = new Float32Array(src.length);
    const out = new Float32Array(src.length);
    for (let y = 0; y < height; y++) {
        const row = y * width;
        for (let x = 0; x < width; x++) {
            let acc = 0;
            for (let k = -radius; k <= radius; k++) {
                const xx = x + k < 0 ? 0 : x + k >= width ? width - 1 : x + k;
                acc += src[row + xx] * kernel[k + radius];
            }
            tmp[row + x] = acc;
        }
    }
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let acc = 0;
            for (let k = -radius; k <= radius; k++) {
                const yy = y + k < 0 ? 0 : y + k >= height ? height - 1 : y + k;
                acc += tmp[yy * width + x] * kernel[k + radius];
            }
            out[y * width + x] = acc;
        }
    }
    return out;
}

/** Computes the per-pixel features of the live-wire cost function. */
export function computeCostMap(image: ImageInput, options: ScissorsOptions = {}): CostMap {
    const { width, height } = image;
    const weights: CostWeights = { ...DEFAULT_WEIGHTS, ...options.weights };
    const sigma = options.sigma ?? 1;
    const zcThreshold = options.zeroCrossingThreshold ?? 0.1;
    const n = width * height;

    const img = gaussianBlur(toLuminance(image), width, height, sigma);
    const at = (x: number, y: number) =>
        img[(y < 0 ? 0 : y >= height ? height - 1 : y) * width + (x < 0 ? 0 : x >= width ? width - 1 : x)];

    const magnitude = new Float32Array(n);
    const edgeDirX = new Float32Array(n);
    const edgeDirY = new Float32Array(n);
    const laplacian = new Float32Array(n);
    let maxMagnitude = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
            const l = at(x - 1, y), c = img[i], r = at(x + 1, y);
            const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);

            // Sobel
            const gx = (tr + 2 * r + br - tl - 2 * l - bl) / 8;
            const gy = (bl + 2 * b + br - tl - 2 * t - tr) / 8;
            const g = Math.sqrt(gx * gx + gy * gy);
            magnitude[i] = g;
            if (g > maxMagnitude) maxMagnitude = g;
            if (g > 1e-6) {
                // Rotate the gradient by 90° to get the direction along the edge
                edgeDirX[i] = gy / g;
                edgeDirY[i] = -gx / g;
            }

            // 8-neighbour Laplacian
            laplacian[i] = tl + t + tr + l + r + bl + b + br - 8 * c;
        }
    }

    const gradientCost = new Float32Array(n);
    const laplacianCost = new Uint8Array(n).fill(1);
    // Noise produces Laplacian sign flips everywhere; only crossings on a real edge count.
    const minMagnitude = maxMagnitude * zcThreshold;

    // Zero crossing: the sign flips towards a 4-neighbour, and this pixel is the one closer to
    // zero (so only one pixel per crossing is marked).
    const crossesTowards = (li: number, j: number) => {
        const lj = laplacian[j];
        return (li >= 0) !== (lj >= 0) && Math.abs(li) <= Math.abs(lj);
    };

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            gradientCost[i] = maxMagnitude > 0 ? 1 - magnitude[i] / maxMagnitude : 1;

            const li = laplacian[i];
            if (
                magnitude[i] >= minMagnitude && maxMagnitude > 0 &&
                ((x > 0 && crossesTowards(li, i - 1)) ||
                (x + 1 < width && crossesTowards(li, i + 1)) ||
                (y > 0 && crossesTowards(li, i - width)) ||
                (y + 1 < height && crossesTowards(li, i + width)))
            ) {
                laplacianCost[i] = 0;
            }
        }
    }

    return { width, height, weights, laplacianCost, gradientCost, edgeDirX, edgeDirY };
}

const SQRT1_2 = Math.SQRT1_2;

/**
 * acos for x in [−1, 1], max. error 7e-5 rad (Abramowitz & Stegun 4.4.45). This runs eight
 * times per visited pixel, where Math.acos is a measurable share of the search time.
 */
function fastAcos(x: number): number {
    const negative = x < 0;
    const a = negative ? -x : x;
    const r = Math.sqrt(1 - a) * (1.5707288 + a * (-0.2121144 + a * (0.074261 - 0.0187293 * a)));
    return negative ? Math.PI - r : r;
}
const DIRECTION_SCALE = 2 / (3 * Math.PI);

/**
 * Cost of the link from pixel `p` to its 8-neighbour `q = p + (dx, dy)`.
 * Always in [0, weights.laplacian + weights.gradient + weights.direction].
 */
export function linkCost(map: CostMap, p: number, q: number, dx: number, dy: number): number {
    const w = map.weights;
    const diagonal = dx !== 0 && dy !== 0;

    // Gradient term, scaled so a diagonal step is not cheaper per unit of length
    const fG = map.gradientCost[q] * (diagonal ? 1 : SQRT1_2);
    const fZ = map.laplacianCost[q];

    // Gradient-direction term: link should run along the edge direction at both ends
    const inv = diagonal ? SQRT1_2 : 1;
    let lx = dx * inv;
    let ly = dy * inv;
    const dpX = map.edgeDirX[p];
    const dpY = map.edgeDirY[p];
    let dp = dpX * lx + dpY * ly;
    if (dp < 0) {
        lx = -lx;
        ly = -ly;
        dp = -dp;
    }
    let dq = lx * map.edgeDirX[q] + ly * map.edgeDirY[q];
    if (dp > 1) dp = 1;
    if (dq > 1) dq = 1;
    else if (dq < -1) dq = -1;
    const fD = DIRECTION_SCALE * (fastAcos(dp) + fastAcos(dq));

    return w.laplacian * fZ + w.gradient * fG + w.direction * fD;
}

/**
 * Renders the static part of the cost (zero crossings + gradient) as an RGBA buffer:
 * dark = cheap (edges the wire follows), bright = expensive. Handy for debugging and demos.
 */
export function costMapToRGBA(map: CostMap): Uint8ClampedArray<ArrayBuffer> {
    const n = map.width * map.height;
    const out = new Uint8ClampedArray(n * 4);
    const wz = map.weights.laplacian;
    const wg = map.weights.gradient;
    const total = wz + wg || 1;
    for (let i = 0; i < n; i++) {
        const v = Math.round(((wz * map.laplacianCost[i] + wg * map.gradientCost[i]) / total) * 255);
        const j = i * 4;
        out[j] = out[j + 1] = out[j + 2] = v;
        out[j + 3] = 255;
    }
    return out;
}
