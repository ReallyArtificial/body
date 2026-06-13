/**
 * Example: Email workflow with Body
 *
 * Demonstrates:
 * - Action definition
 * - Workflow execution with retry
 * - Rollback on failure
 * - Audit log querying
 */

import { z } from 'zod';
import { defineAction, WorkflowEngine } from '../src';

// Define email actions

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
    console.log(`[send_email] Sending to ${to}: ${subject}`);

    // Simulate SMTP send
    await new Promise((resolve) => setTimeout(resolve, 100));

    const messageId = `msg-${Date.now()}`;
    console.log(`[send_email] Sent! Message ID: ${messageId}`);

    return { messageId };
  },
  undo: async ({ messageId }, { to, subject }) => {
    console.log(`[send_email:undo] Retracting message ${messageId}`);

    // Send retraction email
    await new Promise((resolve) => setTimeout(resolve, 100));

    console.log(`[send_email:undo] Sent retraction to ${to}`);
  },
});

const scheduleFollowUp = defineAction({
  name: 'schedule_follow_up',
  description: 'Schedule a follow-up email',
  inputs: z.object({
    messageId: z.string(),
    daysLater: z.number().int().positive(),
    subject: z.string(),
  }),
  outputs: z.object({
    followUpId: z.string(),
  }),
  execute: async ({ messageId, daysLater, subject }) => {
    console.log(`[schedule_follow_up] Scheduling follow-up for message ${messageId} in ${daysLater} days`);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const followUpId = `followup-${Date.now()}`;
    console.log(`[schedule_follow_up] Scheduled! Follow-up ID: ${followUpId}`);

    return { followUpId };
  },
  undo: async ({ followUpId }) => {
    console.log(`[schedule_follow_up:undo] Canceling follow-up ${followUpId}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    console.log(`[schedule_follow_up:undo] Canceled!`);
  },
});

const updateCRM = defineAction({
  name: 'update_crm',
  description: 'Update CRM with email activity',
  inputs: z.object({
    email: z.string().email(),
    activity: z.string(),
  }),
  outputs: z.object({
    crmId: z.string(),
  }),
  execute: async ({ email, activity }) => {
    console.log(`[update_crm] Updating CRM for ${email}: ${activity}`);

    // Simulate CRM API call that occasionally fails
    if (Math.random() < 0.3) {
      throw new Error('CRM API timeout');
    }

    await new Promise((resolve) => setTimeout(resolve, 150));

    const crmId = `crm-${Date.now()}`;
    console.log(`[update_crm] Updated! CRM ID: ${crmId}`);

    return { crmId };
  },
  undo: async ({ crmId }) => {
    console.log(`[update_crm:undo] Reverting CRM update ${crmId}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    console.log(`[update_crm:undo] Reverted!`);
  },
});

// Example usage

async function main() {
  console.log('🤖 Body Email Workflow Example\n');

  // Create workflow engine
  const engine = new WorkflowEngine('./examples/body.db');

  // Register actions
  engine.registerAction(sendEmail);
  engine.registerAction(scheduleFollowUp);
  engine.registerAction(updateCRM);

  console.log(`✅ Registered ${engine.listActions().length} actions\n`);

  // Example 1: Single action execution (will retry on failure)
  console.log('📧 Example 1: Send single email\n');

  const result1 = await engine.executeAction('send_email', {
    to: 'user@example.com',
    subject: 'Welcome to Body!',
    body: 'This is your first email workflow.',
  });

  console.log(`\n✅ Result: ${result1.success ? 'SUCCESS' : 'FAILED'}`);
  console.log(`   Workflow ID: ${result1.workflowId}`);
  if (result1.output) {
    console.log(`   Output: ${JSON.stringify(result1.output)}\n`);
  }

  // Example 2: Multi-action workflow (with automatic rollback on failure)
  console.log('📧 Example 2: Full email workflow (with potential rollback)\n');

  const result2 = await engine.executeWorkflow(
    'email_campaign',
    [
      {
        action: 'send_email',
        inputs: {
          to: 'lead@example.com',
          subject: 'Product Update',
          body: 'Check out our new features!',
        },
      },
      {
        action: 'schedule_follow_up',
        inputs: {
          messageId: 'temp-msg-id', // Will be replaced with real messageId in v0.2
          daysLater: 3,
          subject: 'Follow-up: Product Update',
        },
      },
      {
        action: 'update_crm',
        inputs: {
          email: 'lead@example.com',
          activity: 'Sent product update email',
        },
      },
    ],
    {
      maxRetries: 3,
      retryDelayMs: 500,
    }
  );

  console.log(`\n✅ Result: ${result2.success ? 'SUCCESS' : 'FAILED (ROLLED BACK)'}`);
  console.log(`   Workflow ID: ${result2.workflowId}`);
  console.log(`   Steps completed: ${result2.results.length}/3\n`);

  // Example 3: Query audit log
  console.log('📜 Example 3: Audit log\n');

  const auditLog = engine.getAuditLog({ limit: 10 });

  console.log(`Found ${auditLog.length} audit entries:\n`);
  auditLog.forEach((entry, i) => {
    console.log(`${i + 1}. ${entry.actionName} - ${entry.status}`);
    console.log(`   Workflow: ${entry.workflowId}`);
    console.log(`   Time: ${entry.timestamp.toISOString()}`);
    console.log(`   Signature: ${entry.signature.substring(0, 16)}...`);
    console.log('');
  });

  // Example 4: Get workflow details
  console.log('🔍 Example 4: Workflow details\n');

  const workflowDetails = engine.getWorkflow(result2.workflowId);
  if (workflowDetails) {
    console.log(`Workflow: ${workflowDetails.workflow.name}`);
    console.log(`Status: ${workflowDetails.workflow.status}`);
    console.log(`Actions: ${workflowDetails.actions.length}\n`);

    workflowDetails.actions.forEach((action, i) => {
      console.log(`  ${i + 1}. ${action.name} - ${action.status}`);
      console.log(`     Retries: ${action.retryCount}`);
      if (action.error) {
        console.log(`     Error: ${action.error}`);
      }
    });
  }

  // Cleanup
  engine.close();
  console.log('\n✅ Done!');
}

// Run the example
main().catch(console.error);
