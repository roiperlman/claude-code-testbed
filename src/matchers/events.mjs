/**
 * Helpers for finding semantically-meaningful sub-objects within a flat
 * array of JSONL events. Each helper accepts raw events from
 * `events(sessionId)` and returns plain objects suitable for matching.
 */

/** @typedef {Record<string, any>} Event */

function contentBlocks(event) {
  const content = event?.message?.content;
  if (Array.isArray(content)) return content;
  return [];
}

/**
 * Return all tool_use blocks across assistant events. Each result is
 * shaped: { id, name, input, event_index }.
 *
 * @param {Event[]} events
 * @param {string} [name]
 */
export function findToolCalls(events, name) {
  const out = [];
  events.forEach((event, i) => {
    if (event.type !== 'assistant') return;
    for (const block of contentBlocks(event)) {
      if (block?.type !== 'tool_use') continue;
      if (name && block.name !== name) continue;
      out.push({ id: block.id, name: block.name, input: block.input ?? {}, event_index: i });
    }
  });
  return out;
}

/**
 * Return all tool_result blocks across user events, optionally joined with
 * the matching tool_use to expose `tool_name`. Each result:
 * { tool_use_id, tool_name, content, is_error, event_index }.
 *
 * @param {Event[]} events
 * @param {string} [toolName]
 */
export function findToolResults(events, toolName) {
  const calls = new Map();
  for (const call of findToolCalls(events)) calls.set(call.id, call.name);
  const out = [];
  events.forEach((event, i) => {
    if (event.type !== 'user') return;
    for (const block of contentBlocks(event)) {
      if (block?.type !== 'tool_result') continue;
      const tool_name = calls.get(block.tool_use_id) ?? null;
      if (toolName && tool_name !== toolName) continue;
      out.push({
        tool_use_id: block.tool_use_id,
        tool_name,
        content: block.content,
        is_error: Boolean(block.is_error),
        event_index: i,
      });
    }
  });
  return out;
}

/**
 * Return all assistant text blocks as plain strings, in order.
 *
 * @param {Event[]} events
 */
export function findAssistantTexts(events) {
  const out = [];
  for (const event of events) {
    if (event.type !== 'assistant') continue;
    for (const block of contentBlocks(event)) {
      if (block?.type === 'text' && typeof block.text === 'string') out.push(block.text);
    }
  }
  return out;
}

/**
 * Return user-typed messages (strings or text-block content), excluding
 * tool_result blocks. Slash commands appear here.
 *
 * @param {Event[]} events
 */
export function findUserMessages(events) {
  const out = [];
  for (const event of events) {
    if (event.type !== 'user') continue;
    const content = event?.message?.content;
    if (typeof content === 'string') {
      out.push(content);
      continue;
    }
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block?.type === 'text' && typeof block.text === 'string') out.push(block.text);
      }
    }
  }
  return out;
}

/**
 * Return error indicators: tool_results with is_error:true, or any event
 * with type:'error' or is_error:true at the top level.
 *
 * @param {Event[]} events
 */
export function findErrors(events) {
  const errs = findToolResults(events).filter((r) => r.is_error);
  events.forEach((event, i) => {
    if (event.type === 'error' || event.is_error === true) {
      errs.push({ event_index: i, content: event.message ?? event.error ?? event, is_error: true, tool_use_id: null, tool_name: null });
    }
  });
  return errs;
}
