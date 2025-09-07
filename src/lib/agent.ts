import { createReactAgent, ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';

import { withAsyncAuthorization } from './auth0-ai-langchain';
import { shopOnlineTool } from './tools/shop-online-langchain';

const date = new Date().toISOString();

const AGENT_SYSTEM_TEMPLATE = `You are a personal assistant named Assistant0. You are a helpful assistant that can answer questions and help with tasks. You have access to a set of tools, use the tools as needed to answer the user's question. Today is ${date}.`;

const llm = new ChatOpenAI({
  model: 'gpt-4o-mini',
  temperature: 0,
});

const tools = [
  withAsyncAuthorization(shopOnlineTool),
];

/**
 * Use a prebuilt LangGraph agent.
 */
export const graph = createReactAgent({
  llm,
  tools: new ToolNode(tools, {
    // Error handler must be disabled in order to trigger interruptions from within tools.
    handleToolErrors: false,
  }),
  // Modify the stock prompt in the prebuilt agent.
  prompt: AGENT_SYSTEM_TEMPLATE,
});
