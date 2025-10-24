#!/usr/bin/env node

/**
 * Test script to verify LangGraph configuration
 * Run: node test-langgraph-config.js
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying LangGraph Configuration...\n');

// Step 1: Check langgraph.json exists
const langgraphJsonPath = path.join(__dirname, 'langgraph.json');
if (!fs.existsSync(langgraphJsonPath)) {
  console.error('❌ langgraph.json not found!');
  process.exit(1);
}

console.log('✅ langgraph.json exists');

// Step 2: Parse and validate langgraph.json
let config;
try {
  config = JSON.parse(fs.readFileSync(langgraphJsonPath, 'utf8'));
  console.log('✅ langgraph.json is valid JSON\n');
} catch (err) {
  console.error('❌ langgraph.json is invalid JSON:', err.message);
  process.exit(1);
}

// Step 3: Check graphs configuration
if (!config.graphs || typeof config.graphs !== 'object') {
  console.error('❌ No "graphs" configuration found in langgraph.json');
  process.exit(1);
}

console.log('📊 Registered Graphs:\n');
const graphNames = Object.keys(config.graphs);

if (graphNames.length === 0) {
  console.error('❌ No graphs registered!');
  process.exit(1);
}

let allGraphsValid = true;

graphNames.forEach(graphName => {
  const graphPath = config.graphs[graphName];
  console.log(`  • ${graphName}: ${graphPath}`);
  
  // Parse the path (format: "./path/to/file.ts:exportName")
  const [filePath, exportName] = graphPath.split(':');
  
  // Check if file exists
  const fullFilePath = path.join(__dirname, filePath);
  if (!fs.existsSync(fullFilePath)) {
    console.error(`    ❌ File not found: ${fullFilePath}`);
    allGraphsValid = false;
    return;
  }
  
  // Check if export exists in file
  const fileContent = fs.readFileSync(fullFilePath, 'utf8');
  const exportRegex = new RegExp(`export\\s+(const|let|var|class|function)\\s+${exportName}`, 'g');
  
  if (!exportRegex.test(fileContent)) {
    console.error(`    ❌ Export "${exportName}" not found in ${filePath}`);
    allGraphsValid = false;
    return;
  }
  
  console.log(`    ✅ File exists and export "${exportName}" found`);
});

console.log('');

// Step 4: Verify supervisor is registered
if (!config.graphs.supervisor) {
  console.error('❌ CRITICAL: "supervisor" graph is not registered!');
  console.error('   This is required for full separation architecture.');
  allGraphsValid = false;
} else {
  console.log('✅ CRITICAL: "supervisor" graph is registered');
}

// Step 5: Check environment configuration
console.log('\n📝 Environment Configuration:\n');
if (config.env) {
  console.log(`  • Environment file: ${config.env}`);
  const envPath = path.join(__dirname, config.env);
  if (fs.existsSync(envPath)) {
    console.log(`    ✅ Environment file exists`);
  } else {
    console.log(`    ⚠️  Environment file not found: ${envPath}`);
  }
} else {
  console.log('  ⚠️  No environment file configured');
}

// Step 6: Summary
console.log('\n' + '='.repeat(50));
if (allGraphsValid) {
  console.log('✅ All checks passed! LangGraph configuration is valid.');
  console.log('\n📋 Summary:');
  console.log(`   • Total graphs: ${graphNames.length}`);
  console.log(`   • Graphs: ${graphNames.join(', ')}`);
  console.log('\n🚀 Ready for Step 2: Deploy to LangGraph server');
  process.exit(0);
} else {
  console.log('❌ Configuration has errors. Please fix them before proceeding.');
  process.exit(1);
}
