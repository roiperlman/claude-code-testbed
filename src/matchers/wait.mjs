/**
 * Polymorphic value matcher.
 *
 * - string: strict equality
 * - RegExp: .test(value)
 * - function: predicate
 * - plain object: deep partial match (each key in matcher must `matches` the
 *   corresponding key in value; extra keys in value are ignored)
 * - array: positional partial match (matcher.length <= value.length, each
 *   index must `matches`)
 *
 * @param {unknown} value
 * @param {unknown} matcher
 * @returns {boolean}
 */
export function matches(value, matcher) {
  if (matcher === null || matcher === undefined) return value === matcher;
  if (typeof matcher === 'string') return value === matcher;
  if (matcher instanceof RegExp) return typeof value === 'string' && matcher.test(value);
  if (typeof matcher === 'function') return matcher(value) === true;
  if (Array.isArray(matcher)) {
    if (!Array.isArray(value)) return false;
    if (matcher.length > value.length) return false;
    return matcher.every((m, i) => matches(value[i], m));
  }
  if (typeof matcher === 'object') {
    if (value === null || typeof value !== 'object') return false;
    return Object.keys(matcher).every((k) => matches(/** @type {any} */ (value)[k], /** @type {any} */ (matcher)[k]));
  }
  return value === matcher;
}
