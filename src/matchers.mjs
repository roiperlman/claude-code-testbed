import { expect } from 'vitest';
import * as M from './matchers/index.mjs';

expect.extend({
  toHaveCalledTool: M.toHaveCalledTool,
  toHaveToolResult: M.toHaveToolResult,
  toHaveAssistantText: M.toHaveAssistantText,
  toHaveUserMessage: M.toHaveUserMessage,
  toHaveTouchedFile: M.toHaveTouchedFile,
  toHaveReachedIdle: M.toHaveReachedIdle,
});
