# Body

**A small, durable workflow engine for running agent actions — in TypeScript.**

> Part of the Really Artificial ecosystem.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

> ## Status: early / experimental
>
> Body is **~5 days old** (repo created 2026-06-09) and is an **early prototype**, not a finished product.
> It is roughly 1,300 lines of TypeScript that work today, but:
>
> - There are **no automated tests yet** (Jest is configured, but no test files exist).
> - The API will change without notice. There is no published npm release you should depend on.
> - It has not been run in production and is not production-ready.
>
> Treat it as a working proof of concept you can read, run locally, and build on — not as something to ship behind real side effects yet.

---

## What it actually does today

Body is a single-process workflow engine built on `better-sqlite3` and `zod`. Concretely, the current code gives you:

- **An action registry.** Define an action with a name, a Zod input schema, an `execute` function, and (optionally) a Zod output schema and an `undo` function. Register actions on an engine and look them up by name.
- **Single-action execution with retry.** `executeAction` runs one action with configurable retries and **exponential backoff** (`retryDelayMs * 2^attempt`).
- **Sequential multi-step workflows.** `executeWorkflow` runs a list of steps in order. If a step fails after exhausting its retries, the engine performs a **reverse-order rollback**, calling each completed action's `undo` (actions without `undo` are skipped with a warning), and marks the workflow `rolled_back`.
- **SQLite persistence.** Workflows, per-action execution records (status, retry count, timestamps, inputs/outputs), and the audit log are stored in a SQLite file via `better-sqlite3`.
- **An HMAC-signed audit log.** Every action outcome is appended to an `audit_log` table with an HMAC-SHA256 signature over the entry. There is a `verifyAuditSignature` method to check an entry against the configured secret, and a `getAuditLog(filters)` query (by workflow, action name, time range, `triggeredBy`, limit).

That's the whole surface area. It is deliberately small.

## What it does NOT do (yet)

To be clear about claims that earlier drafts of this README made but that the code does **not** implement:

- **No Python SDK.** Body is TypeScript only.
- **No admin UI.** There is no dashboard, web view, or visual audit browser.
- **No `npx body-init` wizard.** There is no scaffolding CLI. You install the package and write code.
- **No MCP integration / action discovery over MCP.** The registry is an in-process `Map`, not an MCP surface.
- **No approvalprotocol integration.** `requiresApproval` exists as a field on the Action interface and `WorkflowConfig`, but nothing enforces or wires up approvals yet.
- **No scheduling, no parallel execution, no distributed execution, no policy engine.**
- **No automatic passing of one step's output into the next step's inputs.** Steps are independent; if a later step needs an earlier step's result, you don't get it automatically yet.

## Install

```bash
npm install @reallyartificial/body
# peer/runtime deps used by the engine:
#   better-sqlite3, zod
```

Requires Node.js >= 18. (Note: there is no published, stable release yet — see the status banner above. To try it now, clone the repo and run the example below.)

## Usage

The real entry point is the `WorkflowEngine` class plus `defineAction`. Here is a minimal, accurate example:

```typescript
import { z } from 'zod';
import { defineAction, WorkflowEngine } from '@reallyartificial/body';

// 1. Define an action. inputs/outputs are Zod schemas.
const sendEmail = defineAction({
  name: 'send_email',
  description: 'Send an email',
  inputs: z.object({
    to: z.string().email(),
    subject: z.string(),
    body: z.string(),
  }),
  outputs: z.object({ messageId: z.string() }),
  execute: async ({ to, subject, body }) => {
    // ...send the email...
    return { messageId: `msg-${Date.now()}` };
  },
  // Optional: used during rollback if a later step fails.
  undo: async ({ messageId }) => {
    // ...send a retraction, cancel, etc...
  },
});

// 2. Create an engine (SQLite file path; optional HMAC secret for the audit log).
const engine = new WorkflowEngine('./body.db', process.env.BODY_AUDIT_SECRET);
engine.registerAction(sendEmail);

// 3a. Run a single action (retries with exponential backoff).
const result = await engine.executeAction(
  'send_email',
  { to: 'user@example.com', subject: 'Hi', body: 'Hello!' },
  { maxRetries: 3, retryDelayMs: 500 }
);
console.log(result.success, result.workflowId, result.output);

// 3b. Or run a sequential, rollback-on-failure workflow.
const wf = await engine.executeWorkflow(
  'welcome_flow',
  [
    { action: 'send_email', inputs: { to: 'user@example.com', subject: 'Hi', body: 'Hello!' } },
    // ...more steps...
  ],
  { maxRetries: 3, retryDelayMs: 500 }
);
console.log(wf.success, wf.results);

// 4. Inspect state and the signed audit log.
console.log(engine.getWorkflow(wf.workflowId));
console.log(engine.getAuditLog({ limit: 10 }));

engine.close();
```

A fuller, runnable version (multiple actions, a deliberately flaky step that triggers rollback, audit-log querying) lives in [`examples/email-workflow.ts`](examples/email-workflow.ts):

```bash
npx ts-node examples/email-workflow.ts
```

### Audit secret

The audit log is signed with HMAC-SHA256. The secret is taken from the `WorkflowEngine` constructor argument, then `process.env.BODY_AUDIT_SECRET`, and otherwise falls back to a hard-coded development default. **Set your own secret** (constructor or `BODY_AUDIT_SECRET`) if signatures need to mean anything — the default is not secret.

## API surface

Exported from the package root:

- `defineAction(definition)` — validates and returns an `Action`.
- `WorkflowEngine` — `registerAction`, `listActions`, `getAction`, `executeAction`, `executeWorkflow`, `getWorkflow`, `getAuditLog`, `close`.
- `WorkflowDatabase` — the SQLite layer (used internally by the engine; also exported).
- `httpRequest` — a sample built-in action.
- Types: `Action`, `ActionResult`, `ActionContext`, `Workflow`, `WorkflowAction`, `WorkflowStatus`, `ActionStatus`, `AuditLogEntry`, `WorkflowConfig`.

## Roadmap (aspirational, not built)

Near-term things that would make this more useful, roughly in priority order:

- Tests for the engine (retry counting, rollback ordering, audit signature verification).
- Pass prior step outputs into later step inputs in `executeWorkflow`.
- Real approval enforcement (wiring `requiresApproval` to something).

Anything beyond that (scheduling, parallelism, distribution, a UI, other language SDKs) is an idea, not a commitment.

## Contributing

It's very early. If you want to poke at it, the most valuable contribution right now is tests for the existing engine behavior. See [CONTRIBUTING.md](CONTRIBUTING.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

## License

MIT — see [LICENSE](LICENSE).

---

Built by [Really Artificial](https://reallyartificial.org).