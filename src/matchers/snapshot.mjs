import { relative, isAbsolute } from 'node:path';

const STRIP_FIELDS = new Set([
  'timestamp', 'id', 'parent_id', 'session_id', 'request_id',
  'usage', 'input_tokens', 'output_tokens',
  'cache_creation_input_tokens', 'cache_read_input_tokens',
]);

/**
 * Default transcript normalizer: strips non-deterministic fields, replaces
 * assistant text with placeholder, relativizes absolute paths under cwd.
 *
 * @param {Record<string, unknown>[]} events
 * @param {(events: Record<string, unknown>[]) => Record<string, unknown>[]} [custom]
 *        Optional caller-supplied normalizer. If provided, replaces the default.
 * @returns {Record<string, unknown>[]}
 */
export function normalizeTranscript(events, custom) {
  if (typeof custom === 'function') return custom(events);
  return events.map((e) => normalizeEvent(e));
}

function normalizeEvent(event) {
  return walk(event, /* inAssistantText */ false);
}

function walk(node, inAssistantText) {
  if (Array.isArray(node)) return node.map((n) => walk(n, inAssistantText));
  if (node === null || typeof node !== 'object') {
    if (typeof node === 'string') return relativizePath(node);
    return node;
  }
  const out = {};
  const isAssistantTextBlock = node?.type === 'text';
  for (const [k, v] of Object.entries(node)) {
    if (STRIP_FIELDS.has(k)) continue;
    if (isAssistantTextBlock && k === 'text') {
      out[k] = '<text>';
      continue;
    }
    out[k] = walk(v, inAssistantText);
  }
  return out;
}

function relativizePath(s) {
  if (!isAbsolute(s)) return s;
  const rel = relative(process.cwd(), s);
  if (rel.startsWith('..') || isAbsolute(rel)) return s; // path is outside cwd
  return rel;
}
