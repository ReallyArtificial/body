/**
 * Body — Durable action execution for AI agents
 *
 * @packageDocumentation
 */

// Core action types and utilities
export { Action, ActionResult, ActionContext } from './action/types';
export { defineAction } from './action/define';

// Example actions
export { httpRequest } from './action/examples/http-request';

// Version
export const VERSION = '0.0.1';
