import { describe, expect, it } from 'vitest';
import { createScissors, polygonArea, polygonToMask, ScissorsSession, simplifyPath } from '../src';
import { rectangleImage } from './helpers';

const image = rectangleImage(100, 80, 20, 15, 79, 64);

function traceRectangle() {
    const session = new ScissorsSession(createScissors(image));
    expect(session.click({ x: 20, y: 40 })).toBe('started');
    session.move({ x: 50, y: 15 });
    expect(session.click({ x: 50, y: 15 })).toBe('anchored');
    expect(session.click({ x: 79, y: 40 })).toBe('anchored');
    expect(session.click({ x: 50, y: 64 })).toBe('anchored');
    return session;
}

describe('ScissorsSession', () => {
    it('traces and closes a contour around the object', () => {
        const session = traceRectangle();
        expect(session.canClose).toBe(true);
        expect(session.click({ x: 21, y: 41 })).toBe('closed');
        expect(session.closed).toBe(true);

        const polygon = session.polygon();
        expect(polygon[0]).not.toEqual(polygon[polygon.length - 1]);
        // 60 × 50 rectangle; the traced outline sits within a pixel of the boundary
        expect(polygonArea(polygon)).toBeGreaterThan(55 * 45);
        expect(polygonArea(polygon)).toBeLessThan(63 * 53);
    });

    it('ignores a repeated click on the last anchor (first half of a double-click)', () => {
        const session = traceRectangle();
        const anchors = session.anchors.length;
        expect(session.click({ x: 50, y: 64 })).toBe('ignored');
        expect(session.anchors.length).toBe(anchors);
    });

    it('undoes anchors and re-opens closed contours', () => {
        const session = traceRectangle();
        session.close();
        session.undo();
        expect(session.closed).toBe(false);
        expect(session.anchors.length).toBe(4);
        session.undo();
        expect(session.anchors.length).toBe(3);
        expect(session.segments.length).toBe(2);
        session.undo();
        session.undo();
        session.undo();
        expect(session.started).toBe(false);
    });

    it('cannot close with a single anchor', () => {
        const session = new ScissorsSession(createScissors(image));
        session.click({ x: 20, y: 40 });
        expect(session.close()).toBeNull();
    });
});

describe('geometry', () => {
    it('simplifies a pixel path while keeping corners', () => {
        const path = [
            ...Array.from({ length: 20 }, (_, i) => ({ x: i, y: 0 })),
            ...Array.from({ length: 20 }, (_, i) => ({ x: 19, y: i + 1 })),
        ];
        expect(simplifyPath(path, 0.5)).toEqual([{ x: 0, y: 0 }, { x: 19, y: 0 }, { x: 19, y: 20 }]);
    });

    it('fills a traced (one point per pixel) outline into a mask, boundary included', () => {
        const outline = [
            ...[2, 3, 4, 5, 6, 7].map(x => ({ x, y: 2 })),
            ...[3, 4, 5].map(y => ({ x: 7, y })),
            ...[6, 5, 4, 3, 2].map(x => ({ x, y: 5 })),
            ...[4, 3].map(y => ({ x: 2, y })),
        ];
        const mask = polygonToMask(outline, 10, 8);
        const filled = mask.reduce((sum, v) => sum + v, 0);
        expect(filled).toBe(6 * 4);
        expect(mask[3 * 10 + 4]).toBe(1);
        expect(mask[0]).toBe(0);
    });
});
