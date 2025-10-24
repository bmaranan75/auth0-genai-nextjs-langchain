/**
 * Message utilities for the Supervisor Agent
 */

import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { AgentRole, AnnotatedMessage } from './types';

/**
 * Helper to wrap messages consistently
 */
export function annotateMessage(
  msg: HumanMessage | AIMessage | SystemMessage, 
  role: AgentRole, 
  agent?: string, 
  senderId?: string
): AnnotatedMessage {
  return {
    message: msg,
    role,
    agent,
    senderId,
    timestamp: Date.now()
  };
}

/**
 * Build a compact context string for specialized agents.
 * Include: recent user messages (always), system messages, and assistant messages produced by the same agent.
 * Limit entries to avoid large payloads.
 */
export function buildAgentContextMessage(
  annotatedMessages: Array<AnnotatedMessage>,
  targetAgent: string,
  currentUserMessage: string,
  maxEntries = 6
): string {
  const filtered = annotatedMessages
    .filter(m => {
      // Always include user messages and system messages
      if (m.role === 'user' || m.role === 'system') return true;
      // Include assistant messages only if produced by the target agent
      if (m.role === 'assistant' && m.agent === targetAgent) return true;
      return false;
    });

  // Deduplicate by message content while preserving the most recent occurrence order
  const seen = new Set<string>();
  const deduped: AnnotatedMessage[] = [];
  for (let i = filtered.length - 1; i >= 0; i--) {
    const m = filtered[i];
    const content = m?.message?.content 
      ? (typeof m.message.content === 'string' ? m.message.content : JSON.stringify(m.message.content))
      : '';
    if (content && !seen.has(content)) {
      seen.add(content);
      deduped.push(m);
    }
  }
  deduped.reverse();

  const recent = deduped.slice(-maxEntries); // take last N relevant entries

  // Compose lines with agent/source annotation to help the LLM quickly contextualize
  const lines = recent.map(m => {
    const content = m?.message?.content
      ? (typeof m.message.content === 'string' ? m.message.content : JSON.stringify(m.message.content))
      : '';
    const src = m.role === 'assistant' ? (m.agent || 'assistant') : (m.role === 'system' ? 'system' : 'user');
    return `${src.toUpperCase()}: ${content}`;
  }).filter(line => line.includes(': ')); // Filter out empty content lines

  // Add the current user message at the end (most relevant) only if it's not already present
  const alreadyPresent = lines.some(l => l.includes(currentUserMessage));
  if (!alreadyPresent) {
    lines.push(`USER_LATEST: ${currentUserMessage}`);
  }

  // Keep the context compact
  return lines.join('\n\n');
}

/**
 * PROGRESS TRACKING HELPERS
 * 
 * Helper functions to create user-friendly progress messages for streaming
 */
export function createProgressMessage(content: string, agent?: string, ephemeral: boolean = true): AnnotatedMessage {
  return {
    message: new AIMessage(content),
    role: 'assistant',
    agent: agent || 'supervisor',
    timestamp: Date.now(),
    progress: {
      isProgressUpdate: true,
      step: content,
      agent: agent || 'supervisor',
      ephemeral,            // Mark as ephemeral by default
      autoRemoveMs: 5000    // Auto-dismiss after 5 seconds
    }
  };
}

/**
 * Get agent-specific progress message for routing
 * This is shown to the user BEFORE the agent starts working
 */
export function getAgentProgressMessage(agentName: string, context?: string): AnnotatedMessage {
  let message: string;
  
  switch (agentName) {
    case 'catalog':
      message = '🛍️ Searching our catalog...';
      break;
    case 'deals':
      message = '🏷️ Checking for deals...';
      break;
    case 'cart_and_checkout':
      if (context === 'process_checkout' || context === 'prepare_checkout') {
        message = '💳 Processing checkout...';
      } else {
        message = '🛒 Managing your cart...';
      }
      break;
    case 'payment':
      message = '💳 Managing payments...';
      break;
    case 'notification_agent':
      message = '📧 Sending notifications...';
      break;
    default:
      message = `⏳ Delegating to ${agentName}...`;
  }
  
  return createProgressMessage(message, 'supervisor');
}

/**
 * Get workflow steps for progress tracking
 */
export function getWorkflowSteps(workflowType: string): string[] {
  switch (workflowType) {
    case 'complex_checkout':
      return [
        '🔍 Searching for available deals...',
        '🛒 Adding items to your cart...',
        '💳 Proceeding to checkout...'
      ];
    case 'deal_search':
      return [
        '🔍 Searching for available deals...',
        '📋 Analyzing best offers...'
      ];
    case 'cart_addition':
      return [
        '🛒 Adding items to your cart...',
        '✅ Updating cart totals...'
      ];
    case 'checkout_process':
      return [
        '💳 Preparing checkout...',
        '🔐 Processing payment authorization...',
        '✅ Completing your order...'
      ];
    default:
      return ['⏳ Processing your request...'];
  }
}
