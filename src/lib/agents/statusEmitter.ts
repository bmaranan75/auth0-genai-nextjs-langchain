/**
 * STATUS EMITTER UTILITY
 * 
 * Provides helpers for agents to emit ephemeral status messages
 * that stream to the UI without being stored in conversation history.
 * 
 * Usage:
 *   const status = createStatusEmitter('catalog');
 *   return {
 *     messages: [
 *       status.emit('🔍 Searching products...'),
 *       status.emit('✅ Found 5 items'),
 *       finalResponse
 *     ]
 *   };
 */

import { AIMessage } from '@langchain/core/messages';

export interface StatusMessage {
  message: AIMessage;
  role: 'assistant';
  agent: string;
  timestamp: number;
  progress: {
    isProgressUpdate: boolean;
    step: string;
    agent: string;
    ephemeral: boolean;
    autoRemoveMs?: number;
  };
}

export interface StatusEmitter {
  /**
   * Emit an ephemeral status message
   * @param text - Status text (keep short, use emojis for visual clarity)
   * @param autoRemoveMs - Optional auto-dismiss timeout (default: 5000ms)
   */
  emit(text: string, autoRemoveMs?: number): StatusMessage;
  
  /**
   * Emit a step in a multi-step workflow
   * @param stepNumber - Current step (e.g., 1)
   * @param totalSteps - Total steps (e.g., 3)
   * @param text - Step description
   */
  step(stepNumber: number, totalSteps: number, text: string): StatusMessage;
  
  /**
   * Emit a completion status
   * @param text - Completion message
   */
  complete(text: string): StatusMessage;
  
  /**
   * Emit an error status
   * @param text - Error message
   */
  error(text: string): StatusMessage;
}

/**
 * Create a status emitter for an agent
 * @param agentName - Name of the agent (e.g., 'catalog', 'cart_and_checkout')
 */
export function createStatusEmitter(agentName: string): StatusEmitter {
  const emit = (text: string, autoRemoveMs: number = 5000): StatusMessage => {
    return {
      message: new AIMessage(text),
      role: 'assistant',
      agent: agentName,
      timestamp: Date.now(),
      progress: {
        isProgressUpdate: true,
        step: text,
        agent: agentName,
        ephemeral: true,
        autoRemoveMs
      }
    };
  };

  return {
    emit,
    
    step: (stepNumber: number, totalSteps: number, text: string): StatusMessage => {
      const stepText = `[${stepNumber}/${totalSteps}] ${text}`;
      return emit(stepText, 3000); // Steps auto-dismiss faster
    },
    
    complete: (text: string): StatusMessage => {
      return emit(`✅ ${text}`, 3000);
    },
    
    error: (text: string): StatusMessage => {
      return emit(`❌ ${text}`, 10000); // Errors stay longer
    }
  };
}

/**
 * Common status templates for consistency across agents
 */
export const StatusTemplates = {
  // Catalog agent
  catalog: {
    searching: '🔍 Searching catalog...',
    found: (count: number) => `📦 Found ${count} ${count === 1 ? 'item' : 'items'}`,
    complete: '✅ Catalog search complete'
  },
  
  // Deals agent
  deals: {
    checking: '🏷️ Checking for available deals...',
    found: (count: number) => `🎉 Found ${count} ${count === 1 ? 'deal' : 'deals'}!`,
    noneFound: '📋 No deals available at this time',
    complete: '✅ Deal search complete'
  },
  
  // Cart agent
  cart: {
    adding: '🛒 Adding items to cart...',
    updating: '🔄 Updating cart...',
    removing: '🗑️ Removing items...',
    complete: '✅ Cart updated successfully'
  },
  
  // Checkout agent
  checkout: {
    preparing: '💳 Preparing checkout...',
    validating: '🔐 Validating payment...',
    processing: '⏳ Processing order...',
    complete: '✅ Order complete!'
  },
  
  // Payment agent
  payment: {
    authorizing: '🔐 Authorizing payment...',
    processing: '💳 Processing payment...',
    complete: '✅ Payment successful'
  },
  
  // Notification agent
  notification: {
    sending: '📧 Sending notifications...',
    complete: '✅ Notifications sent'
  },
  
  // Supervisor
  supervisor: {
    routing: '🧠 Analyzing request...',
    evaluating: '🔄 Evaluating next steps...',
    delegating: (agent: string) => `📤 Routing to ${agent}...`,
    complete: '✅ Task completed'
  }
};

/**
 * Workflow status helpers for multi-step processes
 */
export interface WorkflowStatus {
  start(workflowName: string): StatusMessage[];
  step(stepIndex: number, stepDescription: string): StatusMessage;
  complete(workflowName: string): StatusMessage;
}

/**
 * Create a workflow status tracker
 * @param agentName - Name of the agent running the workflow
 * @param steps - Array of step descriptions
 */
export function createWorkflowStatus(agentName: string, steps: string[]): WorkflowStatus {
  const emitter = createStatusEmitter(agentName);
  
  return {
    start: (workflowName: string) => {
      return [
        emitter.emit(`🚀 Starting ${workflowName}...`, 2000)
      ];
    },
    
    step: (stepIndex: number, stepDescription: string) => {
      return emitter.step(stepIndex + 1, steps.length, stepDescription);
    },
    
    complete: (workflowName: string) => {
      return emitter.complete(`${workflowName} complete`);
    }
  };
}

/**
 * Helper to filter out ephemeral status messages from history
 * Use this before saving to memory or passing to LLM context
 */
export function filterEphemeralMessages<T extends { progress?: { isProgressUpdate?: boolean; ephemeral?: boolean } }>(
  messages: T[]
): T[] {
  return messages.filter(msg => 
    !msg.progress?.isProgressUpdate || 
    !msg.progress?.ephemeral
  );
}

/**
 * Helper to check if a message is ephemeral
 */
export function isEphemeralMessage(message: any): boolean {
  return Boolean(
    message?.progress?.isProgressUpdate && 
    message?.progress?.ephemeral
  );
}
