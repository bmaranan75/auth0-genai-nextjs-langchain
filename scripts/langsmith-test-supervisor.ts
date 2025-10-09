// Load environment variables before importing modules that initialize LLM clients
require('dotenv').config({ path: '.env.local' });

const { SupervisorAgent } = require('../src/lib/agents/supervisor');

async function main() {
  const agent = new SupervisorAgent('test-user', 'test-conv');
  console.log('[langsmith-test] Sending message to SupervisorAgent.chat: "show me product catalog"');
  try {
    const res = await agent.chat('show me product catalog', 'test-conv');
    console.log('[langsmith-test] Supervisor response:');
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error('[langsmith-test] Error running supervisor chat:', err);
    process.exit(1);
  }
}

main();
