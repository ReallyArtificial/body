import type { Action } from '../action/types';
import type { WorkflowConfig } from './types';
import { WorkflowDatabase } from './database';

/**
 * Workflow execution engine
 *
 * Handles action execution with:
 * - Retry logic (exponential backoff)
 * - Rollback support
 * - Audit logging
 * - State persistence
 */
export class WorkflowEngine {
  private db: WorkflowDatabase;
  private actions: Map<string, Action<any, any>> = new Map();

  constructor(dbPath: string, auditSecret?: string) {
    this.db = new WorkflowDatabase(dbPath, auditSecret);
  }

  /**
   * Register an action
   */
  registerAction(action: Action<any, any>) {
    if (this.actions.has(action.name)) {
      throw new Error(`Action '${action.name}' is already registered`);
    }
    this.actions.set(action.name, action);
  }

  /**
   * Get all registered actions
   */
  listActions(): Action<any, any>[] {
    return Array.from(this.actions.values());
  }

  /**
   * Get action by name
   */
  getAction(name: string): Action<any, any> | undefined {
    return this.actions.get(name);
  }

  /**
   * Execute a single action
   */
  async executeAction(
    actionName: string,
    inputs: unknown,
    config: WorkflowConfig = {}
  ): Promise<{ workflowId: string; success: boolean; output?: unknown; error?: string }> {
    const action = this.actions.get(actionName);
    if (!action) {
      throw new Error(`Action '${actionName}' not found`);
    }

    // Create workflow
    const workflow = this.db.createWorkflow(actionName, 'pending');

    try {
      // Validate inputs
      const validatedInputs = action.inputs.parse(inputs);

      // Create action execution record
      const actionExecution = this.db.createAction(workflow.id, actionName, validatedInputs);

      // Start workflow
      this.db.updateWorkflowStatus(workflow.id, 'running');
      this.db.updateActionStatus(actionExecution.id, 'running');

      // Execute with retry logic
      const maxRetries = config.maxRetries ?? 3;
      const retryDelayMs = config.retryDelayMs ?? 1000;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          // Execute action
          const output = await action.execute(validatedInputs);

          // Validate output
          if (action.outputs) {
            action.outputs.parse(output);
          }

          // Mark as success
          this.db.updateActionStatus(actionExecution.id, 'success', output);
          this.db.updateWorkflowStatus(workflow.id, 'success');

          // Create audit log entry
          this.db.createAuditEntry({
            workflowId: workflow.id,
            actionName,
            inputs: validatedInputs,
            outputs: output,
            status: 'success',
          });

          return {
            workflowId: workflow.id,
            success: true,
            output,
          };
        } catch (error) {
          lastError = error as Error;

          // If not the last retry, wait with exponential backoff
          if (attempt < maxRetries) {
            this.db.updateActionStatus(actionExecution.id, 'failed', undefined, lastError.message, true);
            await this.sleep(retryDelayMs * Math.pow(2, attempt));
          }
        }
      }

      // All retries failed
      this.db.updateActionStatus(actionExecution.id, 'failed', undefined, lastError?.message);
      this.db.updateWorkflowStatus(workflow.id, 'failed', lastError?.message);

      // Create audit log entry
      this.db.createAuditEntry({
        workflowId: workflow.id,
        actionName,
        inputs: validatedInputs,
        status: 'failed',
        error: lastError?.message,
      });

      return {
        workflowId: workflow.id,
        success: false,
        error: lastError?.message || 'Unknown error',
      };
    } catch (error) {
      // Input validation or setup error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.db.updateWorkflowStatus(workflow.id, 'failed', errorMessage);

      return {
        workflowId: workflow.id,
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Execute a multi-action workflow
   */
  async executeWorkflow(
    name: string,
    steps: Array<{ action: string; inputs: unknown }>,
    config: WorkflowConfig = {}
  ): Promise<{ workflowId: string; success: boolean; results: unknown[]; error?: string }> {
    // Create workflow
    const workflow = this.db.createWorkflow(name, 'pending');
    const results: unknown[] = [];
    const completedActions: Array<{ actionName: string; output: unknown; inputs: unknown }> = [];

    try {
      // Start workflow
      this.db.updateWorkflowStatus(workflow.id, 'running');

      // Execute each step sequentially
      for (const step of steps) {
        const action = this.actions.get(step.action);
        if (!action) {
          throw new Error(`Action '${step.action}' not found`);
        }

        // Validate inputs
        const validatedInputs = action.inputs.parse(step.inputs);

        // Create action execution record
        const actionExecution = this.db.createAction(workflow.id, step.action, validatedInputs);

        // Execute with retry
        const maxRetries = config.maxRetries ?? 3;
        const retryDelayMs = config.retryDelayMs ?? 1000;
        let lastError: Error | null = null;
        let output: unknown;

        this.db.updateActionStatus(actionExecution.id, 'running');

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            output = await action.execute(validatedInputs);

            if (action.outputs) {
              action.outputs.parse(output);
            }

            // Success!
            this.db.updateActionStatus(actionExecution.id, 'success', output);
            this.db.createAuditEntry({
              workflowId: workflow.id,
              actionName: step.action,
              inputs: validatedInputs,
              outputs: output,
              status: 'success',
            });

            completedActions.push({ actionName: step.action, output, inputs: validatedInputs });
            results.push(output);
            lastError = null;
            break;
          } catch (error) {
            lastError = error as Error;

            if (attempt < maxRetries) {
              this.db.updateActionStatus(actionExecution.id, 'failed', undefined, lastError.message, true);
              await this.sleep(retryDelayMs * Math.pow(2, attempt));
            }
          }
        }

        // If action failed after all retries, roll back
        if (lastError) {
          this.db.updateActionStatus(actionExecution.id, 'failed', undefined, lastError.message);
          this.db.createAuditEntry({
            workflowId: workflow.id,
            actionName: step.action,
            inputs: validatedInputs,
            status: 'failed',
            error: lastError.message,
          });

          // Trigger rollback
          await this.rollback(workflow.id, completedActions);

          this.db.updateWorkflowStatus(workflow.id, 'rolled_back', lastError.message);

          return {
            workflowId: workflow.id,
            success: false,
            results,
            error: lastError.message,
          };
        }
      }

      // All steps succeeded
      this.db.updateWorkflowStatus(workflow.id, 'success');

      return {
        workflowId: workflow.id,
        success: true,
        results,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.db.updateWorkflowStatus(workflow.id, 'failed', errorMessage);

      return {
        workflowId: workflow.id,
        success: false,
        results,
        error: errorMessage,
      };
    }
  }

  /**
   * Rollback a workflow by undoing completed actions in reverse order
   */
  private async rollback(
    workflowId: string,
    completedActions: Array<{ actionName: string; output: unknown; inputs: unknown }>
  ) {
    // Undo in reverse order
    for (const { actionName, output, inputs } of completedActions.reverse()) {
      const action = this.actions.get(actionName);
      if (!action?.undo) {
        // Action doesn't support undo, log warning
        console.warn(`Action '${actionName}' doesn't support undo, skipping rollback`);
        continue;
      }

      try {
        await action.undo(output, inputs);

        // Log successful rollback
        this.db.createAuditEntry({
          workflowId,
          actionName,
          inputs,
          outputs: output,
          status: 'rolled_back',
        });
      } catch (error) {
        // Rollback failed, log but continue
        console.error(`Failed to undo action '${actionName}':`, error);
        this.db.createAuditEntry({
          workflowId,
          actionName,
          inputs,
          outputs: output,
          status: 'rolled_back',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Get workflow status
   */
  getWorkflow(workflowId: string) {
    const workflow = this.db.getWorkflow(workflowId);
    if (!workflow) return null;

    const actions = this.db.getWorkflowActions(workflowId);

    return {
      workflow,
      actions,
    };
  }

  /**
   * Query audit log
   */
  getAuditLog(filters: {
    workflowId?: string;
    actionName?: string;
    from?: Date;
    to?: Date;
    triggeredBy?: string;
    limit?: number;
  }) {
    return this.db.queryAuditLog(filters);
  }

  /**
   * Close the engine
   */
  close() {
    this.db.close();
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
