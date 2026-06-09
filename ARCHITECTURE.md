# Architecture — Body v0.1

This document explains the core design decisions for Body's first release.

---

## Design Principles

1. **Simplicity over features** — v0.1 solves one problem well (email workflows)
2. **Durable by default** — State survives crashes, retries are automatic
3. **MCP-native** — Actions are discoverable like MCP tools
4. **Approval-first** — Integration with approvalprotocol from day one
5. **Observable** — Every action is logged, queryable, auditable

---

## Core Components

### 1. Action SDK

**Purpose:** Define actions that agents can execute.

**Interface:**
```typescript
interface Action<TInput, TOutput> {
  name: string;
  description?: string;
  inputs: ZodSchema<TInput>;
  outputs?: ZodSchema<TOutput>;
  requiresApproval?: boolean;
  execute: (input: TInput) => Promise<TOutput>;
  undo?: (output: TOutput) => Promise<void>;
}
```

**Key decisions:**
- **Zod for schema validation** — Runtime type safety + auto-generated docs
- **Optional `undo` handler** — For actions that can be rolled back
- **`requiresApproval` flag** — Integrates with approvalprotocol

**Example:**
```typescript
const sendEmail = defineAction({
  name: 'send_email',
  description: 'Send an email via SMTP',
  inputs: z.object({
    to: z.string().email(),
    subject: z.string(),
    body: z.string(),
  }),
  outputs: z.object({
    messageId: z.string(),
  }),
  requiresApproval: false,
  execute: async ({ to, subject, body }) => {
    const messageId = await smtp.send({ to, subject, body });
    return { messageId };
  },
  undo: async ({ messageId }) => {
    await smtp.send({
      to: to,
      subject: `RETRACTION: ${subject}`,
      body: 'This message has been retracted.',
    });
  },
});
```

---

### 2. Workflow Engine

**Purpose:** Execute actions durably, with retry and rollback support.

**State machine:**
```
pending → running → success
                  → failed (→ retrying → success)
                           (→ rolling_back → rolled_back)
```

**Storage:** SQLite (single file, zero deps, easy backups)

**Schema:**
```sql
CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL, -- pending | running | success | failed | rolled_back
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  error TEXT
);

CREATE TABLE actions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  name TEXT NOT NULL,
  inputs TEXT NOT NULL, -- JSON
  outputs TEXT, -- JSON
  status TEXT NOT NULL, -- pending | running | success | failed
  retry_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  error TEXT,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id)
);
```

**Retry logic:**
- Max 3 retries by default
- Exponential backoff (1s, 2s, 4s)
- Configurable per action

**Rollback:**
- If an action fails after 3 retries, trigger `undo()` on all completed actions in reverse order
- Log rollback progress in audit log

---

### 3. Action Registry

**Purpose:** Agents discover available actions (like MCP tool listing).

**HTTP API:**
```
GET /actions → List all actions
GET /actions/:name → Get action schema
POST /actions/:name/execute → Execute action (async, returns workflow_id)
```

**Response format (MCP-compatible):**
```json
{
  "actions": [
    {
      "name": "send_email",
      "description": "Send an email via SMTP",
      "inputSchema": {
        "type": "object",
        "properties": {
          "to": { "type": "string", "format": "email" },
          "subject": { "type": "string" },
          "body": { "type": "string" }
        },
        "required": ["to", "subject", "body"]
      },
      "requiresApproval": false
    }
  ]
}
```

**Why HTTP?**
- MCP servers can proxy it
- Easy to test with curl
- Works with any agent framework

---

### 4. Audit Log

**Purpose:** Immutable record of every action.

**Schema:**
```sql
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  workflow_id TEXT NOT NULL,
  action_name TEXT NOT NULL,
  inputs TEXT NOT NULL, -- JSON
  outputs TEXT, -- JSON
  status TEXT NOT NULL, -- success | failed | rolled_back
  triggered_by TEXT, -- agent identifier
  approved_by TEXT, -- if approvalprotocol was used
  error TEXT,
  signature TEXT -- HMAC of (id + timestamp + action_name + inputs + outputs)
);

CREATE INDEX idx_audit_timestamp ON audit_log(timestamp);
CREATE INDEX idx_audit_workflow ON audit_log(workflow_id);
CREATE INDEX idx_audit_action ON audit_log(action_name);
```

**Tamper-proofing:**
- Each entry has an HMAC signature
- Signature verifies: id + timestamp + action_name + inputs + outputs
- Secret key stored in env var `BODY_AUDIT_SECRET`

**Queryable:**
```
GET /audit?workflow_id=<id>
GET /audit?action=send_email&from=2026-06-01&to=2026-06-30
GET /audit?triggered_by=agent-friday
```

---

### 5. Integration with approvalprotocol

**How it works:**

1. Agent requests action execution: `POST /actions/send_email/execute`
2. If `requiresApproval: true`, Body creates a pending workflow and emits an approval request:
   ```json
   {
     "id": "workflow-abc123",
     "action": "send_email",
     "inputs": { "to": "user@example.com", "subject": "...", "body": "..." },
     "requestedBy": "agent-friday"
   }
   ```
3. approvalprotocol handles approval flow (Telegram, Slack, email, etc.)
4. When approved, approvalprotocol calls: `POST /workflows/abc123/approve`
5. Body starts execution

**Rejection:**
If rejected, workflow transitions to `rejected` state (logged in audit, never executed).

---

## Admin UI

**Purpose:** Visibility into running workflows, audit log, action status.

**Tech stack:**
- React + Vite (simple SPA)
- TailwindCSS (fast styling)
- Recharts (metrics visualization)

**Pages:**

1. **Dashboard**
   - Active workflows (running, pending approval)
   - Recent actions (last 24h)
   - Success/failure rate

2. **Workflows**
   - List all workflows (filterable by status, date)
   - Workflow detail (steps, status, timeline)
   - Cancel in-progress workflows

3. **Audit Log**
   - Searchable table (by action, date, agent)
   - Export as CSV / JSON
   - Signature verification

4. **Actions**
   - List all registered actions
   - Schema viewer
   - Test action execution (manual trigger)

---

## Deployment

**v0.1 target:** Single-node deployments (Pi, VPS, localhost).

**How to run:**
```bash
npx body-init
cd my-body-project
npm install
npm run dev
```

**Ports:**
- `3000` — Admin UI
- `3001` — HTTP API

**Data:**
- `./data/body.db` — SQLite database (workflows + audit log)

**Environment variables:**
```
BODY_AUDIT_SECRET=<random-secret-for-signing>
BODY_APPROVAL_URL=http://localhost:4000 (optional, if using approvalprotocol)
```

---

## v0.2 Design Considerations (not implemented yet)

**Scheduled Actions:**
- Add `schedule` field to workflows: `"*/5 * * * *"` (cron syntax)
- Background cron runner checks pending schedules every 1 min

**Conditional Workflows:**
- Add `if` / `else` branching in workflow definitions
- Example: "If test_result.passed === true, deploy to prod"

**Parallel Execution:**
- Add `parallel` block in workflows
- Max concurrency configurable per workflow

**Distributed Workers:**
- Redis-backed job queue (replace SQLite state for multi-node)
- Worker nodes pull jobs from queue

---

## Open Questions

1. **Should actions be MCP tools themselves, or should Body integrate with MCP servers?**
   - Option A: Body actions ARE MCP tools (register via MCP protocol)
   - Option B: Body has its own protocol, MCP servers can proxy to it
   - **Proposed:** Option B for v0.1 (simpler), consider Option A for v0.2

2. **How do we handle long-running actions (>1 hour)?**
   - Example: "Deploy to prod" might take 20 minutes
   - Keep HTTP connection open? Or poll for status?
   - **Proposed:** Return workflow_id immediately, client polls `GET /workflows/:id`

3. **What's the rollback strategy for actions that can't be undone?**
   - Example: Charging a credit card (can refund, but not the same as undo)
   - **Proposed:** `undo()` is optional; if missing, rollback logs a warning but continues

4. **Should we support custom storage backends (Postgres, Redis)?**
   - **Proposed:** SQLite for v0.1, pluggable backend for v0.2

---

*Friday — CEO, Really Artificial*  
*2026-06-09*
