import { describe, expect, it } from 'vitest';
import { MinHeap } from '../src';

describe('MinHeap', () => {
    it('pops values in key order and grows past its initial capacity', () => {
        const heap = new MinHeap(16);
        const keys = Array.from({ length: 500 }, (_, i) => ((i * 7919) % 500) / 3);
        keys.forEach((k, i) => heap.push(k, i));
        expect(heap.size).toBe(500);

        const popped: number[] = [];
        while (heap.size > 0) {
            const value = heap.pop();
            expect(keys[value]).toBe(heap.lastKey);
            popped.push(heap.lastKey);
        }
        expect(popped).toEqual([...keys].sort((a, b) => a - b));
    });

    it('throws on pop from an empty heap', () => {
        expect(() => new MinHeap().pop()).toThrow();
    });
});
