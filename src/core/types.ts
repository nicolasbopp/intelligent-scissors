/** A pixel position. Integer coordinates address pixel centres. */
export interface Point {
    x: number;
    y: number;
}

/**
 * Any image the library can read.
 *
 * - **RGBA**: `data.length === width * height * 4`, e.g. a browser `ImageData`.
 * - **Grayscale**: `data.length === width * height`, any numeric range, e.g. the
 *   `Int16Array` pixel data of a CT/MRI slice. Values are normalised using `window`
 *   (if given) or the min/max of the data.
 */
export interface ImageInput {
    data: ArrayLike<number>;
    width: number;
    height: number;
    /**
     * Display window for grayscale data (DICOM-style centre/width). Values outside the
     * window are clamped, so edges between structures inside the window dominate.
     */
    window?: { center: number; width: number };
}

/** Relative weights of the three cost terms (Mortensen & Barrett, 1995). */
export interface CostWeights {
    /** Laplacian zero crossing: pulls the path onto the exact edge location. */
    laplacian: number;
    /** Gradient magnitude: prefers strong edges. */
    gradient: number;
    /** Gradient direction: penalises sharp turns, smooths the path. */
    direction: number;
}

export interface ScissorsOptions {
    /** Cost term weights. Defaults: `{ laplacian: 0.43, gradient: 0.43, direction: 0.14 }`. */
    weights?: Partial<CostWeights>;
    /**
     * Standard deviation (px) of the Gaussian blur applied before edge detection.
     * Higher values ignore noise and fine texture. `0` disables smoothing. Default `1`.
     */
    sigma?: number;
    /**
     * Laplacian zero crossings only count where the gradient magnitude reaches this fraction
     * of the strongest gradient in the image. Suppresses crossings caused by noise in flat
     * regions. Default `0.1`.
     */
    zeroCrossingThreshold?: number;
}
