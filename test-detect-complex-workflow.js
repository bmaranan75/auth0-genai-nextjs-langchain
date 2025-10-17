// Unit tests for detectComplexWorkflow function
console.log('🧪 TESTING detectComplexWorkflow() FUNCTION');
console.log('='.repeat(60));

// Import the function (simulate the logic here for testing)
function detectComplexWorkflow(messageContent) {
  const lowerContent = messageContent.toLowerCase();

  // Pattern 1: "check/find deals + add to cart" type queries
  const dealsAndCartPattern =
    (lowerContent.includes('check') ||
      lowerContent.includes('find') ||
      lowerContent.includes('look')) &&
    (lowerContent.includes('deal') ||
      lowerContent.includes('promotion') ||
      lowerContent.includes('discount') ||
      lowerContent.includes('sale')) &&
    lowerContent.includes('add') &&
    lowerContent.includes('cart');

  // Pattern 2: Conditional workflows with "if" statements
  const conditionalPattern =
    lowerContent.includes('if') &&
    (lowerContent.includes('deal') ||
      lowerContent.includes('discount') ||
      lowerContent.includes('sale') ||
      lowerContent.includes('promotion')) &&
    (lowerContent.includes('add') ||
      lowerContent.includes('buy') ||
      lowerContent.includes('purchase'));

  // Pattern 3: "and" connecting multiple actions
  const multiActionPattern =
    lowerContent.includes(' and ') &&
    (lowerContent.includes('deal') ||
      lowerContent.includes('promotion') ||
      lowerContent.includes('discount')) &&
    (lowerContent.includes('add') || lowerContent.includes('cart'));

  if (dealsAndCartPattern) {
    return {
      isComplex: true,
      workflowType: 'deals_to_cart',
      reason:
        'User wants to check deals first, then add to cart based on availability',
    };
  }

  if (conditionalPattern) {
    return {
      isComplex: true,
      workflowType: 'conditional_purchase',
      reason: 'User wants conditional action based on deal availability',
    };
  }

  if (multiActionPattern) {
    return {
      isComplex: true,
      workflowType: 'multi_step_purchase',
      reason:
        'User wants multiple coordinated actions (deals check + cart addition)',
    };
  }

  return {isComplex: false};
}

// Test cases
const testCases = [
  // Complex workflow cases (should be detected)
  {
    query:
      'Can you check if there are deals for apples and if there is, add few to my cart',
    expectedComplex: true,
    expectedType: 'conditional_purchase',
  },
  {
    query:
      "Check for deals on bananas and add them to my cart if there's a good deal",
    expectedComplex: true,
    expectedType: 'deals_to_cart',
  },
  {
    query: 'Look for discounts on milk and add 2 gallons if there are savings',
    expectedComplex: true,
    expectedType: 'conditional_purchase',
  },
  {
    query: 'Find promotions on vegetables and add some to cart',
    expectedComplex: true,
    expectedType: 'deals_to_cart',
  },
  {
    query: 'Check deals for bread and add if discounted',
    expectedComplex: true,
    expectedType: 'multi_step_purchase',
  },

  // Simple cases (should NOT be detected as complex)
  {
    query: 'Check deals for milk',
    expectedComplex: false,
  },
  {
    query: 'Add bananas to my cart',
    expectedComplex: false,
  },
  {
    query: 'Find organic apples',
    expectedComplex: false,
  },
  {
    query: 'What deals are available today?',
    expectedComplex: false,
  },
  {
    query: 'Show me my cart',
    expectedComplex: false,
  },
];

console.log('\n🔍 RUNNING TEST CASES:');

let passed = 0;
let failed = 0;

testCases.forEach((test, index) => {
  const result = detectComplexWorkflow(test.query);
  const isComplexMatch = result.isComplex === test.expectedComplex;
  const typeMatch =
    !test.expectedComplex || result.workflowType === test.expectedType;

  const testPassed = isComplexMatch && typeMatch;

  if (testPassed) {
    passed++;
    console.log(`  ✅ Test ${index + 1}: "${test.query}"`);
  } else {
    failed++;
    console.log(`  ❌ Test ${index + 1}: "${test.query}"`);
    console.log(
      `     Expected: complex=${test.expectedComplex}${test.expectedType ? ', type=' + test.expectedType : ''}`,
    );
    console.log(
      `     Got: complex=${result.isComplex}${result.workflowType ? ', type=' + result.workflowType : ''}`,
    );
  }
});

console.log('\n📊 TEST RESULTS:');
console.log(`  Passed: ${passed}/${testCases.length}`);
console.log(`  Failed: ${failed}/${testCases.length}`);

if (failed === 0) {
  console.log(
    '\n🎉 ALL TESTS PASSED! Complex workflow detection is working correctly.',
  );
} else {
  console.log('\n⚠️  Some tests failed. Review the logic above.');
}

console.log('\n' + '='.repeat(60));
console.log('✅ UNIT TEST COMPLETE');
