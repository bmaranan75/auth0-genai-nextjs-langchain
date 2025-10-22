/**
 * NOTIFICATION AGENT
 * 
 * Handles post-checkout notifications to users via Pushover.
 * 
 * This agent is triggered after successful checkout completion and sends
 * order confirmation notifications to the user's configured notification channels.
 * 
 * Features:
 * - Pushover integration for mobile/desktop notifications
 * - Order summary and confirmation details
 * - Testable with mock implementations
 * - Error handling and fallback messaging
 */

import { AIMessage } from '@langchain/core/messages';
import { END } from '@langchain/langgraph';
import fetch from 'node-fetch';

// Type definitions for notification agent state
export interface NotificationState {
  notificationData?: {
    userId: string;
    conversationId: string;
    summary: string;
    cartData?: any;
    orderId?: string | null;
    total?: number | null;
    timestamp: number;
  };
  userId: string;
  conversationId: string;
  messages: Array<any>;
  workflowContext?: string | null;
  next?: string;
}

export interface PushoverPayload {
  title: string;
  message: string;
  user?: string;
  token?: string;
}

export interface PushoverResult {
  ok: boolean;
  result?: any;
  error?: any;
}

/**
 * PUSHOVER NOTIFICATION SERVICE
 * 
 * Simple Pushover client helper - uses fetch to call Pushover API
 * Expects environment variables: PUSHOVER_TOKEN (application token), PUSHOVER_USER (user key)
 */
let sendPushoverNotificationImpl: (payload: PushoverPayload) => Promise<PushoverResult> = async (payload) => {
  const token = payload.token || process.env.PUSHOVER_TOKEN;
  const user = payload.user || process.env.PUSHOVER_USER;

  if (!token || !user) {
    console.warn('[notification_agent] Missing Pushover configuration (PUSHOVER_TOKEN/PUSHOVER_USER)');
    return { ok: false, error: 'Missing pushover config' };
  }

  const form = new URLSearchParams();
  form.append('token', token);
  form.append('user', user);
  form.append('title', payload.title);
  form.append('message', payload.message);

  try {
    const res = await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      body: form
    });
    const json = await res.json();
    return { ok: res.ok, result: json };
  } catch (error) {
    console.error('[notification_agent] Error sending pushover notification:', error);
    return { ok: false, error };
  }
};

/**
 * Send a Pushover notification
 * 
 * @param payload - Notification payload with title and message
 * @returns Result object with success status
 */
export async function sendPushoverNotification(payload: PushoverPayload): Promise<PushoverResult> {
  return sendPushoverNotificationImpl(payload);
}

/**
 * Test helper to override Pushover notification implementation
 */
export function __setSendPushoverNotificationForTests(fn: (payload: PushoverPayload) => Promise<PushoverResult>) {
  sendPushoverNotificationImpl = fn;
}

/**
 * Test helper to reset Pushover notification implementation to default
 */
export function __resetSendPushoverNotificationForTests() {
  sendPushoverNotificationImpl = async (payload) => {
    const token = payload.token || process.env.PUSHOVER_TOKEN;
    const user = payload.user || process.env.PUSHOVER_USER;
    if (!token || !user) return { ok: false, error: 'Missing pushover config' };
    const form = new URLSearchParams();
    form.append('token', token);
    form.append('user', user);
    form.append('title', payload.title);
    form.append('message', payload.message);
    try {
      const res = await fetch('https://api.pushover.net/1/messages.json', { method: 'POST', body: form });
      const json = await res.json();
      return { ok: res.ok, result: json };
    } catch (error) {
      return { ok: false, error };
    }
  };
}

/**
 * NOTIFICATION AGENT NODE
 * 
 * Processes notification data from checkout completion and sends
 * order confirmation notifications via Pushover.
 * 
 * @param state - Current state with notification data
 * @returns Updated state with notification feedback messages
 */
export async function notificationAgent(state: NotificationState, annotateMessage?: Function, createProgressMessage?: Function) {
  const { notificationData, userId, conversationId } = state;

  console.log('[notificationAgent] Running notification agent for user:', userId, 'conversation:', conversationId);
  
  // Helper functions - use provided or create simple defaults
  const annotate = annotateMessage || ((msg: any, role: string, agent?: string) => ({
    message: msg,
    role,
    agent,
    timestamp: Date.now()
  }));
  
  const createProgress = createProgressMessage || ((content: string, agent?: string) => ({
    message: new AIMessage(content),
    role: 'assistant',
    agent: agent || 'notification_agent',
    timestamp: Date.now(),
    progress: {
      isProgressUpdate: true,
      step: content,
      agent: agent || 'notification_agent',
      ephemeral: true,
      autoRemoveMs: 5000
    }
  }));
  
  // Add ephemeral message for notification processing
  const notificationProgressMessage = createProgress('📧 Sending notifications...', 'notification_agent');
  
  if (!notificationData) {
    console.log('[notificationAgent] No notificationData present - nothing to send');
    
    // Log routing decision for debugging
    console.log('[notificationAgent] ROUTING DECISION:', {
      fromAgent: 'notification_agent',
      toAgent: END,
      reason: 'No notification data - ending workflow',
      state: { workflowContext: null, notificationData: null }
    });
    
    return {
      messages: [notificationProgressMessage, annotate(new AIMessage('No notification to send.'), 'assistant', 'notification_agent')],
      userId,
      conversationId,
      workflowContext: null,
      notificationData: null,
      next: END
    };
  }

  const title = `Order Confirmation - ${userId}`;
  const message = `Your order was completed. Summary: ${notificationData.summary || "(no summary)"}`;

  const sendResult = await sendPushoverNotification({ title, message });

  const feedbackMessage = sendResult.ok
    ? new AIMessage('Notification sent successfully.')
    : new AIMessage(`Failed to send notification: ${sendResult.error || JSON.stringify(sendResult.result)}`);

  // Log routing decision for debugging
  console.log('[notificationAgent] ROUTING DECISION:', {
    fromAgent: 'notification_agent',
    toAgent: END,
    reason: sendResult.ok ? 'Notification sent successfully' : 'Notification send failed',
    state: { workflowContext: null, notificationData: null }
  });

  return {
    // Return the feedback message first so callers/tests that inspect the first
    // message receive the success/failure text immediately. Keep the progress
    // message present for streaming/UIs that prefer progress updates.
    messages: [annotate(feedbackMessage, 'assistant', 'notification_agent'), notificationProgressMessage],
    userId,
    conversationId,
    workflowContext: null,
    notificationData: null, // clear after sending
    next: END
  };
}
