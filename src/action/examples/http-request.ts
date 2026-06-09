import { z } from 'zod';
import { defineAction } from '../define';

/**
 * Example action: Make an HTTP request
 *
 * This demonstrates:
 * - Input/output validation with Zod
 * - Async execution
 * - Error handling
 */
export const httpRequest = defineAction({
  name: 'http_request',
  description: 'Make an HTTP request to a URL',

  inputs: z.object({
    url: z.string().url(),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET'),
    headers: z.record(z.string()).optional(),
    body: z.string().optional(),
  }),

  outputs: z.object({
    status: z.number(),
    headers: z.record(z.string()),
    body: z.string(),
  }),

  requiresApproval: false,

  execute: async ({ url, method, headers, body }) => {
    const response = await fetch(url, {
      method,
      headers,
      body,
    });

    const responseBody = await response.text();

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseBody,
    };
  },

  // HTTP requests can't be undone
  undo: undefined,
});
