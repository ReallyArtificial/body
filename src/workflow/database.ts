import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { createHmac } from 'crypto';
import type { Workflow, WorkflowAction, AuditLogEntry, WorkflowStatus, ActionStatus } from './types';

/**
 * SQLite database for workflow state and audit log
 */
export class WorkflowDatabase {
  private db: Database.Database;
  private auditSecret: string;

  constructor(dbPath: string, auditSecret?: string) {
    this.db = new Database(dbPath);
    this.auditSecret = auditSecret || process.env.BODY_AUDIT_SECRET || 'default-secret-change-me';
    this.initializeSchema();
  }

  private initializeSchema() {
    // Workflows table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        error TEXT
      );
    `);

    // Actions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS actions (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        name TEXT NOT NULL,
        inputs TEXT NOT NULL,
        outputs TEXT,
        status TEXT NOT NULL,
        retry_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        error TEXT,
        FOREIGN KEY (workflow_id) REFERENCES workflows(id)
      );

      CREATE INDEX IF NOT EXISTS idx_actions_workflow ON actions(workflow_id);
    `);

    // Audit log table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        workflow_id TEXT NOT NULL,
        action_name TEXT NOT NULL,
        inputs TEXT NOT NULL,
        outputs TEXT,
        status TEXT NOT NULL,
        triggered_by TEXT,
        approved_by TEXT,
        error TEXT,
        signature TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_workflow ON audit_log(workflow_id);
      CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action_name);
    `);
  }

  /**
   * Create a new workflow
   */
  createWorkflow(name: string, status: WorkflowStatus = 'pending'): Workflow {
    const id = randomUUID();
    const createdAt = Date.now();

    this.db
      .prepare(
        `INSERT INTO workflows (id, name, status, created_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(id, name, status, createdAt);

    return {
      id,
      name,
      status,
      createdAt: new Date(createdAt),
    };
  }

  /**
   * Get workflow by ID
   */
  getWorkflow(id: string): Workflow | null {
    const row = this.db
      .prepare(`SELECT * FROM workflows WHERE id = ?`)
      .get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      status: row.status,
      createdAt: new Date(row.created_at),
      startedAt: row.started_at ? new Date(row.started_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      error: row.error,
    };
  }

  /**
   * Update workflow status
   */
  updateWorkflowStatus(id: string, status: WorkflowStatus, error?: string) {
    const updates: string[] = ['status = ?'];
    const params: any[] = [status];

    if (status === 'running') {
      updates.push('started_at = ?');
      params.push(Date.now());
    }

    if (status === 'success' || status === 'failed' || status === 'rolled_back') {
      updates.push('completed_at = ?');
      params.push(Date.now());
    }

    if (error) {
      updates.push('error = ?');
      params.push(error);
    }

    params.push(id);

    this.db
      .prepare(`UPDATE workflows SET ${updates.join(', ')} WHERE id = ?`)
      .run(...params);
  }

  /**
   * Create a new action execution record
   */
  createAction(
    workflowId: string,
    name: string,
    inputs: unknown,
    status: ActionStatus = 'pending'
  ): WorkflowAction {
    const id = randomUUID();
    const createdAt = Date.now();

    this.db
      .prepare(
        `INSERT INTO actions (id, workflow_id, name, inputs, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, workflowId, name, JSON.stringify(inputs), status, createdAt);

    return {
      id,
      workflowId,
      name,
      inputs,
      status,
      retryCount: 0,
      createdAt: new Date(createdAt),
    };
  }

  /**
   * Update action status
   */
  updateActionStatus(
    id: string,
    status: ActionStatus,
    outputs?: unknown,
    error?: string,
    incrementRetry = false
  ) {
    const updates: string[] = ['status = ?'];
    const params: any[] = [status];

    if (status === 'running') {
      updates.push('started_at = ?');
      params.push(Date.now());
    }

    if (status === 'success' || status === 'failed' || status === 'rolled_back') {
      updates.push('completed_at = ?');
      params.push(Date.now());
    }

    if (outputs !== undefined) {
      updates.push('outputs = ?');
      params.push(JSON.stringify(outputs));
    }

    if (error) {
      updates.push('error = ?');
      params.push(error);
    }

    if (incrementRetry) {
      updates.push('retry_count = retry_count + 1');
    }

    params.push(id);

    this.db
      .prepare(`UPDATE actions SET ${updates.join(', ')} WHERE id = ?`)
      .run(...params);
  }

  /**
   * Get all actions for a workflow
   */
  getWorkflowActions(workflowId: string): WorkflowAction[] {
    const rows = this.db
      .prepare(`SELECT * FROM actions WHERE workflow_id = ? ORDER BY created_at ASC`)
      .all(workflowId) as any[];

    return rows.map((row) => ({
      id: row.id,
      workflowId: row.workflow_id,
      name: row.name,
      inputs: JSON.parse(row.inputs),
      outputs: row.outputs ? JSON.parse(row.outputs) : undefined,
      status: row.status,
      retryCount: row.retry_count,
      createdAt: new Date(row.created_at),
      startedAt: row.started_at ? new Date(row.started_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      error: row.error,
    }));
  }

  /**
   * Create audit log entry
   */
  createAuditEntry(entry: Omit<AuditLogEntry, 'id' | 'signature'>): AuditLogEntry {
    const id = randomUUID();
    const timestamp = Date.now();

    // Generate HMAC signature
    const signature = this.generateSignature(
      id,
      timestamp,
      entry.actionName,
      entry.inputs,
      entry.outputs
    );

    this.db
      .prepare(
        `INSERT INTO audit_log
         (id, timestamp, workflow_id, action_name, inputs, outputs, status, triggered_by, approved_by, error, signature)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        timestamp,
        entry.workflowId,
        entry.actionName,
        JSON.stringify(entry.inputs),
        entry.outputs ? JSON.stringify(entry.outputs) : null,
        entry.status,
        entry.triggeredBy || null,
        entry.approvedBy || null,
        entry.error || null,
        signature
      );

    return {
      id,
      timestamp: new Date(timestamp),
      ...entry,
      signature,
    };
  }

  /**
   * Generate HMAC signature for audit log entry
   */
  private generateSignature(
    id: string,
    timestamp: number,
    actionName: string,
    inputs: unknown,
    outputs?: unknown
  ): string {
    const data = JSON.stringify({
      id,
      timestamp,
      actionName,
      inputs,
      outputs,
    });

    return createHmac('sha256', this.auditSecret).update(data).digest('hex');
  }

  /**
   * Verify audit log entry signature
   */
  verifyAuditSignature(entry: AuditLogEntry): boolean {
    const expected = this.generateSignature(
      entry.id,
      entry.timestamp.getTime(),
      entry.actionName,
      entry.inputs,
      entry.outputs
    );

    return entry.signature === expected;
  }

  /**
   * Query audit log
   */
  queryAuditLog(filters: {
    workflowId?: string;
    actionName?: string;
    from?: Date;
    to?: Date;
    triggeredBy?: string;
    limit?: number;
  }): AuditLogEntry[] {
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.workflowId) {
      conditions.push('workflow_id = ?');
      params.push(filters.workflowId);
    }

    if (filters.actionName) {
      conditions.push('action_name = ?');
      params.push(filters.actionName);
    }

    if (filters.from) {
      conditions.push('timestamp >= ?');
      params.push(filters.from.getTime());
    }

    if (filters.to) {
      conditions.push('timestamp <= ?');
      params.push(filters.to.getTime());
    }

    if (filters.triggeredBy) {
      conditions.push('triggered_by = ?');
      params.push(filters.triggeredBy);
    }

    let sql = 'SELECT * FROM audit_log';
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    sql += ' ORDER BY timestamp DESC';

    if (filters.limit) {
      sql += ` LIMIT ?`;
      params.push(filters.limit);
    }

    const rows = this.db.prepare(sql).all(...params) as any[];

    return rows.map((row) => ({
      id: row.id,
      timestamp: new Date(row.timestamp),
      workflowId: row.workflow_id,
      actionName: row.action_name,
      inputs: JSON.parse(row.inputs),
      outputs: row.outputs ? JSON.parse(row.outputs) : undefined,
      status: row.status as 'success' | 'failed' | 'rolled_back',
      triggeredBy: row.triggered_by,
      approvedBy: row.approved_by,
      error: row.error,
      signature: row.signature,
    }));
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}
