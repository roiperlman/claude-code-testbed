import { expect } from 'vitest';
import * as M from './matchers/index.mjs';

expect.extend({
  toHaveCalledTool: M.toHaveCalledTool,
});
