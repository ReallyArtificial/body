# Body

**Durable action execution for AI agents.**

> "An LLM call is artificial intelligence the way a heartbeat is a person."  
> — Really Artificial Manifesto

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## What is Body?

**Body** is the action execution layer for AI systems. It enables agents to take real-world actions — send emails, create files, deploy code, charge payments — **safely, reliably, and with the right constraints**.

Think Temporal/Prefect/Airflow, but designed for LLM-driven workflows instead of batch jobs.

### The Problem

Right now, AI "actions" are fragile:

- **No durable execution** — If the agent crashes mid-action, state is lost
- **No action history** — What did the agent do? When? Why? Hard to audit
- **No idempotency** — Same action twice → double-charge, duplicate emails
- **No dependencies** — Multi-step workflows are duct-taped shell scripts
- **No visibility** — Agents do things in the background; humans don't know until it breaks

**Result:** Agents are confined to read-only tools or toy demos. Production systems don't trust them.

### The Solution

Body provides:

✅ **Durable workflows** — Survives crashes, retries on failure  
✅ **Action registry** — Agents discover available actions (MCP-compatible)  
✅ **Audit log** — Immutable record of every action (who, when, what, why)  
✅ **Idempotency** — Safe to retry (no duplicate side effects)  
✅ **Approval integration** — High-risk actions require human approval (via [approvalprotocol](https://github.com/reallyartificial/approvalprotocol))

---

## Quick Start

```bash
npx body-init
```

This wizard creates:
- A new Body project
- Example actions (send_email, create_file, http_request)
- Admin UI (view workflows, audit log)
- Integration with approvalprotocol (optional)

Then:

```typescript
import { defineAction, createWorkflow } from '@reallyartificial/body';

// Define an action
const sendEmail = defineAction({
  name: 'send_email',
  inputs: { to: 'string', subject: 'string', body: 'string' },
  execute: async ({ to, subject, body }) => {
    await smtp.send({ to, subject, body });
    return { messageId: '...' };
  },
  undo: async ({ messageId }) => {
    // Can't unsend, but can send a retraction
    await smtp.send({ to, subject: 'RETRACTION', body: '...' });
  },
});

// Create a workflow
const emailWorkflow = createWorkflow({
  name: 'send_welcome_email',
  steps: [sendEmail],
});

// Execute
await emailWorkflow.run({ to: 'user@example.com', subject: 'Welcome!', body: '...' });
```

---

## Architecture

Body has four core primitives:

### 1. **Action**
A unit of work: "send email", "deploy commit abc123", "charge $50.00".

- Has inputs, outputs, side effects
- Idempotent (safe to retry)
- Rollback-aware (can undo if something goes wrong)

### 2. **Workflow**
A sequence of actions with dependencies: "A → B → C, but if B fails, rollback A".

- Handles retries, timeouts, conditional logic
- Survives agent crashes (durable state)
- Visibility into what's running, what's done, what failed

### 3. **Action Registry**
Agents discover available actions (like MCP tools, but for execution).

- Schema for inputs/outputs
- Constraints (who can run this? when? with what approval?)
- Examples + test cases (via [mcp-jest](https://github.com/reallyartificial/mcp-jest))

### 4. **Audit Log**
Every action is recorded: who triggered it, when, what inputs, what outputs, what changed.

- Immutable log (append-only)
- Queryable (show me all actions by agent X in the last 24h)
- Tamper-proof (signed, hashed)

---

## Roadmap

### v0.1 (8 weeks) — Email Workflow MVP
- Action SDK (TypeScript + Python)
- SQLite-backed workflow engine
- Action registry (MCP-compatible)
- Audit log
- Admin UI
- Integration with [approvalprotocol](https://github.com/reallyartificial/approvalprotocol)

### v0.2 (16 weeks) — Production Features
- Scheduled actions (cron-like)
- Conditional workflows
- Parallel execution
- Action plugins (community-contributed)
- Observability (metrics, alerts)

### v1.0 (6 months) — Production-Ready
- Distributed execution (scale horizontally)
- Rollback workflows (auto-undo on failure)
- Policy engine (time-based, role-based access)
- Compliance & audit (SOC 2 / GDPR-ready)
- Cloud provider integrations (AWS, GCP, Azure)

---

## Related Projects

Body is part of the **Really Artificial** ecosystem:

- **[Brain (freeport)](https://github.com/reallyartificial/freeport)** — LLM routing & fallback
- **[Memory (engram)](https://github.com/reallyartificial/engram)** — Context persistence
- **[Nerves (mcp-jest)](https://github.com/reallyartificial/mcp-jest)** — Testing framework for MCP servers
- **[Soul (approvalprotocol)](https://github.com/reallyartificial/approvalprotocol)** — Human-in-the-loop approval

Together, they form the infrastructure for AI systems that **remember, act, recover, and know when to ask a human**.

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for:
- How to set up your dev environment
- Where to find good first issues
- Code style and testing guidelines

---

## License

MIT — See [LICENSE](LICENSE) for details.

---

## Status

⚠️ **Early development** — v0.1 shipping end of July 2026.  
Not production-ready yet. Watch this repo for updates!

---

Built by [Really Artificial](https://reallyartificial.org) · [Manifesto](https://github.com/reallyartificial/manifesto)
