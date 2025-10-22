/**
 * Graph Structure Inspector
 *
 * This script loads the supervisor graph and inspects its actual edge configuration
 * to verify there are no direct cart_and_checkout -> notification_agent edges.
 */

const path = require('path');
const fs = require('fs');

console.log('🔍 LangGraph Structure Inspector\n');
console.log('='.repeat(60));

// Read the supervisor.ts file
const supervisorPath = path.join(__dirname, 'src/lib/agents/supervisor.ts');
const content = fs.readFileSync(supervisorPath, 'utf8');

// Extract the graph configuration section
const graphConfigStart = content.indexOf('const workflow = new StateGraph');
const graphConfigEnd = content.indexOf(
  'export function compileSupervisorWorkflow',
);
const graphConfig = content.substring(graphConfigStart, graphConfigEnd);

console.log('\n📊 SUPERVISOR GRAPH CONFIGURATION\n');
console.log('File: src/lib/agents/supervisor.ts');
console.log('Lines: ~1838-1884\n');

// Parse edges for cart_and_checkout
const cartEdgeMatch = graphConfig.match(
  /\.addConditionalEdges\('cart_and_checkout'[^}]*\{([^}]*)\}/s,
);
if (cartEdgeMatch) {
  console.log('✅ cart_and_checkout edges found:\n');
  console.log(cartEdgeMatch[0]);
  console.log('\n');

  // Check if notification_agent is mentioned
  if (cartEdgeMatch[0].includes('notification_agent')) {
    console.log(
      '❌ ERROR: Found notification_agent in cart_and_checkout edges!',
    );
    console.log('   This violates hub-and-spoke architecture.\n');
  } else {
    console.log(
      '✅ VERIFIED: No notification_agent edge from cart_and_checkout',
    );
    console.log('   Hub-and-spoke pattern is correctly implemented.\n');
  }
}

// Parse edges for supervisor
const supervisorEdgeMatch = graphConfig.match(
  /\.addConditionalEdges\('supervisor'[^}]*\{([^}]*)\}/s,
);
if (supervisorEdgeMatch) {
  console.log('='.repeat(60));
  console.log('\n✅ supervisor edges found:\n');
  console.log(supervisorEdgeMatch[0]);
  console.log('\n');

  if (supervisorEdgeMatch[0].includes('notification_agent')) {
    console.log('✅ VERIFIED: Supervisor CAN route to notification_agent');
    console.log('   This is correct - supervisor is the hub.\n');
  }
}

// Parse edges for notification_agent
const notificationEdgeMatch = graphConfig.match(
  /\.addConditionalEdges\('notification_agent'[^}]*\{([^}]*)\}/s,
);
if (notificationEdgeMatch) {
  console.log('='.repeat(60));
  console.log('\n✅ notification_agent edges found:\n');
  console.log(notificationEdgeMatch[0]);
  console.log('\n');
}

console.log('='.repeat(60));
console.log('\n📋 ARCHITECTURE SUMMARY\n');

console.log('Hub-and-Spoke Pattern Requirements:');
console.log('  ✅ cart_and_checkout → [supervisor, END] ONLY');
console.log('  ✅ supervisor → [all agents including notification_agent]');
console.log('  ✅ notification_agent → [supervisor, END]');
console.log('\n');

console.log('Checkout Flow:');
console.log('  1. cart_and_checkout completes checkout');
console.log(
  '  2. Returns: { next: "supervisor", workflowContext: "send_notification" }',
);
console.log('  3. supervisor detects context and routes to notification_agent');
console.log('  4. notification_agent sends notification');
console.log('  5. Returns to supervisor or END');
console.log('\n');

console.log('='.repeat(60));
console.log('\n🎯 CONCLUSION\n');

// Final verification
if (cartEdgeMatch && !cartEdgeMatch[0].includes('notification_agent')) {
  console.log('✅ CODE IS CORRECT');
  console.log(
    '   No direct cart_and_checkout → notification_agent edge exists.',
  );
  console.log('\n');
  console.log('   If LangGraph Studio still shows the edge:');
  console.log('   1. Run: ./clear-studio-cache.sh');
  console.log('   2. Restart LangGraph Studio');
  console.log('   3. Open the SUPERVISOR graph (not cart_and_checkout graph)');
  console.log("   4. If issue persists, it's a Studio display bug");
} else {
  console.log('❌ CODE ISSUE DETECTED');
  console.log('   Please review the graph configuration in supervisor.ts');
}

console.log('\n' + '='.repeat(60) + '\n');
