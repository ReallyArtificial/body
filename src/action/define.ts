import { Action } from './types';

/**
 * Define a new action
 *
 * @example
 * ```typescript
 * const sendEmail = defineAction({
 *   name: 'send_email',
 *   description: 'Send an email via SMTP',
 *   inputs: z.object({
 *     to: z.string().email(),
 *     subject: z.string(),
 *     body: z.string(),
 *   }),
 *   execute: async ({ to, subject, body }) => {
 *     const messageId = await smtp.send({ to, subject, body });
 *     return { messageId };
 *   },
 * });
 * ```
 */
export function defineAction<TInput, TOutput>(
  definition: Action<TInput, TOutput>
): Action<TInput, TOutput> {
  // Validate that the action has required fields
  if (!definition.name) {
    throw new Error('Action must have a name');
  }

  if (!definition.inputs) {
    throw new Error('Action must define input schema');
  }

  if (!definition.execute) {
    throw new Error('Action must have an execute function');
  }

  return definition;
}
