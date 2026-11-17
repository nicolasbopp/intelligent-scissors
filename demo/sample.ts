/**
 * Procedurally generated sample image (no licensing questions): smooth organic blobs on a
 * textured background with sensor-like noise, so there are realistic edges to trace.
 */
export function createSampleImage(width = 900, height = 600): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const rand = mulberry32(7);

    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, '#2b2f36');
    bg.addColorStop(1, '#16181c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // faint background texture
    for (let i = 0; i < 40; i++) {
        ctx.beginPath();
        ctx.arc(rand() * width, rand() * height, 20 + rand() * 80, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${0.01 + rand() * 0.025})`;
        ctx.fill();
    }

    const blobs: [number, number, number, string, string][] = [
        [230, 220, 130, '#e9c46a', '#b5852a'],
        [520, 330, 170, '#7fb3d5', '#2e5f86'],
        [740, 160, 90, '#e76f51', '#9b3a22'],
        [700, 470, 80, '#a3c9a8', '#4c7a53'],
        [210, 480, 70, '#c9a3d9', '#6e4a82'],
    ];
    for (const [cx, cy, r, inner, outer] of blobs) {
        blob(ctx, cx, cy, r, rand);
        const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r * 1.2);
        g.addColorStop(0, inner);
        g.addColorStop(1, outer);
        ctx.fillStyle = g;
        ctx.fill();
    }

    // a ring with a hole, to show that inner boundaries can be traced too
    ctx.beginPath();
    ctx.arc(520, 330, 55, 0, Math.PI * 2);
    ctx.fillStyle = '#1d3448';
    ctx.fill();

    // noise
    const img = ctx.getImageData(0, 0, width, height);
    for (let i = 0; i < img.data.length; i += 4) {
        const n = (rand() - 0.5) * 18;
        img.data[i] += n;
        img.data[i + 1] += n;
        img.data[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
}

function blob(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rand: () => number) {
    const n = 9;
    const pts = Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        const rr = r * (0.75 + rand() * 0.45);
        return { x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr };
    });
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
        const p = pts[i];
        const q = pts[(i + 1) % n];
        const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
        if (i === 0) ctx.moveTo((pts[n - 1].x + p.x) / 2, (pts[n - 1].y + p.y) / 2);
        ctx.quadraticCurveTo(p.x, p.y, mid.x, mid.y);
    }
    ctx.closePath();
}

function mulberry32(seed: number) {
    return () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
