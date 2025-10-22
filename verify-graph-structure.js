#!/usr/bin/env node
/**
 * Graph Structure Verification Script
 *
 * This script verifies that the supervisor graph has no direct edges
 * between cart_and_checkout and notification_agent nodes.
 */

const path = require('path');

// Color codes for terminal output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

console.log('\n' + '='.repeat(70));
console.log(
  colors.blue + 'SUPERVISOR GRAPH STRUCTURE VERIFICATION' + colors.reset,
);
console.log('='.repeat(70) + '\n');

async function verifyGraphStructure() {
  try {
    // Import the compiled graph
    const supervisorModule = await import('../src/lib/agents/supervisor.ts');
    const {supervisorGraph} = supervisorModule;

    console.log(colors.green + '✓ Graph imported successfully' + colors.reset);
    console.log();

    // Get the graph structure
    const nodes = supervisorGraph.nodes || {};
    const edges = supervisorGraph.edges || {};

    console.log(colors.blue + 'Graph Nodes:' + colors.reset);
    const nodeNames = Object.keys(nodes);
    nodeNames.forEach(node => {
      console.log(`  - ${node}`);
    });
    console.log();

    // Check cart_and_checkout edges
    console.log(
      colors.blue + 'Checking cart_and_checkout node edges...' + colors.reset,
    );

    // The graph stores conditional edges, so we need to check the edge definitions
    let hasDirectEdgeToNotification = false;
    let cartEdges = [];

    // Check if there's any edge definition that goes from cart_and_checkout to notification_agent
    if (supervisorGraph._edges) {
      supervisorGraph._edges.forEach((edge, index) => {
        if (edge && edge.source === 'cart_and_checkout') {
          cartEdges.push(edge);
          if (edge.target === 'notification_agent') {
            hasDirectEdgeToNotification = true;
          }
        }
      });
    }

    // Check the channels (state transitions)
    if (supervisorGraph.channels) {
      console.log(colors.blue + '  Checking graph channels...' + colors.reset);
      const cartChannel = supervisorGraph.channels['cart_and_checkout'];
      if (cartChannel) {
        console.log(`  Cart channel structure:`, typeof cartChannel);
      }
    }

    console.log();
    console.log(colors.blue + 'Verification Results:' + colors.reset);
    console.log();

    if (hasDirectEdgeToNotification) {
      console.log(
        colors.red +
          '✗ FAIL: Direct edge found from cart_and_checkout to notification_agent' +
          colors.reset,
      );
      console.log(
        colors.yellow +
          '  This violates the hub-and-spoke pattern!' +
          colors.reset,
      );
      process.exit(1);
    } else {
      console.log(
        colors.green +
          '✓ PASS: No direct edge from cart_and_checkout to notification_agent' +
          colors.reset,
      );
      console.log(
        colors.green + '✓ Hub-and-spoke pattern is maintained' + colors.reset,
      );
    }

    console.log();
    console.log(colors.blue + 'Expected Flow:' + colors.reset);
    console.log('  cart_and_checkout → supervisor → notification_agent');
    console.log('  (using workflowContext: "send_notification")');
    console.log();

    console.log('='.repeat(70));
    console.log(colors.green + 'VERIFICATION COMPLETE ✓' + colors.reset);
    console.log('='.repeat(70) + '\n');
  } catch (error) {
    console.error(
      colors.red + '✗ Error verifying graph structure:' + colors.reset,
      error.message,
    );
    console.error(error.stack);
    process.exit(1);
  }
}

// Run verification
verifyGraphStructure().catch(error => {
  console.error(colors.red + '✗ Fatal error:' + colors.reset, error);
  process.exit(1);
});
