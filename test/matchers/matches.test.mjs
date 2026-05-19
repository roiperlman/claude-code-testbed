import { describe, test, expect } from 'vitest';
import { matches } from '../../src/matchers/wait.mjs';

describe('matches', () => {
  test('string: strict equality', () => {
    expect(matches('foo', 'foo')).toBe(true);
    expect(matches('foo', 'bar')).toBe(false);
    expect(matches('foo bar', 'foo')).toBe(false); // not substring
  });

  test('regex: test()', () => {
    expect(matches('hello world', /world/)).toBe(true);
    expect(matches('hello', /world/)).toBe(false);
  });

  test('function: predicate', () => {
    expect(matches(7, (n) => n > 5)).toBe(true);
    expect(matches(3, (n) => n > 5)).toBe(false);
  });

  test('object: deep partial match', () => {
    const actual = { a: 1, b: { c: 2, d: 3 }, e: [1, 2, 3] };
    expect(matches(actual, { a: 1 })).toBe(true);
    expect(matches(actual, { b: { c: 2 } })).toBe(true);
    expect(matches(actual, { a: 2 })).toBe(false);
    expect(matches(actual, { b: { c: 99 } })).toBe(false);
    expect(matches(actual, { missing: 1 })).toBe(false);
  });

  test('object: nested matcher types', () => {
    const actual = { name: 'Edit', input: { file_path: '/abs/foo.mjs' } };
    expect(matches(actual, { name: 'Edit', input: { file_path: /foo\.mjs/ } })).toBe(true);
    expect(matches(actual, { input: { file_path: (p) => p.endsWith('.mjs') } })).toBe(true);
  });

  test('null/undefined safety', () => {
    expect(matches(null, null)).toBe(true);
    expect(matches(undefined, undefined)).toBe(true);
    expect(matches(null, 'foo')).toBe(false);
    expect(matches({ a: null }, { a: null })).toBe(true);
  });

  test('arrays: positional match', () => {
    expect(matches([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(matches([1, 2, 3], [1, 2])).toBe(true); // partial: matcher is shorter
    expect(matches([1, 2], [1, 2, 3])).toBe(false); // matcher longer than actual
    expect(matches([{ a: 1 }, { a: 2 }], [{ a: 1 }])).toBe(true);
  });
});
