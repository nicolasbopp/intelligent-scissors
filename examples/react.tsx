/**
 * The React hook: an image that can be traced, with a list of the finished shapes.
 */
import { useEffect, useState } from 'react';
import { polygonArea } from 'intelligent-scissors';
import { useScissors } from 'intelligent-scissors/react';

export function Tracer({ src }: { src: string }) {
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [autoAnchor, setAutoAnchor] = useState(true);

    // The tool needs a decoded image; until then the hook waits
    useEffect(() => {
        let current = true;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = src;
        void img.decode().then(() => current && setImage(img));
        return () => {
            current = false;
            setImage(null);
        };
    }, [src]);

    const { ref, shapes, tracing, tool } = useScissors({
        image,
        autoAnchor: autoAnchor ? 12 : 0,
        simplify: 0.75,
        onComplete: polygon => console.log('traced', polygon.length, 'points'),
    });

    return (
        <div>
            <canvas ref={ref} style={{ maxWidth: '100%' }} />
            <p>
                <label>
                    <input type="checkbox" checked={autoAnchor} onChange={e => setAutoAnchor(e.target.checked)} />
                    Auto anchors
                </label>{' '}
                <button onClick={() => tool?.undo()} disabled={!tracing}>Undo</button>{' '}
                <button onClick={() => tool?.clear()} disabled={shapes.length === 0}>Clear</button>
            </p>
            <ul>
                {shapes.map((shape, i) => (
                    <li key={i}>
                        Shape {i + 1}: {shape.length} points, {Math.round(polygonArea(shape))} px²
                    </li>
                ))}
            </ul>
        </div>
    );
}
