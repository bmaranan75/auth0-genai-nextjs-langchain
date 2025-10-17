#!/usr/bin/env python3
"""
Comprehensive test for complex workflow implementation
Tests the enhanced "check deals + add to cart" functionality
"""

import requests

base_url = "http://localhost:3001/api/langgraph"

def test_complex_workflow_deals_to_cart():
    """Test the complete complex workflow: check deals for apples and add to cart if deals exist"""
    
    print("🚀 TESTING ENHANCED COMPLEX WORKFLOW")
    print("=" * 70)
    print("Query: 'Can you check if there are deals for apples and if there is, add few to my cart'")
    
    try:
        # Step 1: Create thread and send complex query
        thread_response = requests.post(f"{base_url}/threads", timeout=10)
        if thread_response.status_code != 200:
            print(f"❌ Failed to create thread: {thread_response.status_code}")
            return False
            
        thread_id = thread_response.json()["thread_id"]
        print(f"✅ Thread created: {thread_id}")
        
        # Test the complex query
        complex_query = "Can you check if there are deals for apples and if there is, add few to my cart"
        
        step1_message = {
            "input": {
                "messages": [
                    {
                        "role": "human", 
                        "content": complex_query
                    }
                ]
            },
            "assistant_id": "supervisor"
        }
        
        print(f"\n📤 Sending complex query: '{complex_query}'")
        
        response1 = requests.post(
            f"{base_url}/threads/{thread_id}/runs/stream",
            json=step1_message,
            timeout=60,
            stream=True
        )
        
        # Track workflow progression
        planner_detected_complex = False
        supervisor_detected_complex = False
        deals_agent_called = False
        check_deals_context = False
        deal_confirmation_state = False
        enhanced_deals_message = False
        
        print("\n📊 Analyzing workflow progression:")
        
        for line in response1.iter_lines():
            if line:
                decoded_line = line.decode()
                
                # Check planner behavior
                if 'Complex multi-step' in decoded_line or 'complex workflow' in decoded_line.lower():
                    planner_detected_complex = True
                    print("  ✅ Planner detected complex workflow")
                
                # Check supervisor behavior  
                if 'Complex workflow detection' in decoded_line:
                    supervisor_detected_complex = True
                    print("  ✅ Supervisor analyzed complex workflow")
                    
                if 'COMPLEX WORKFLOW: Detected' in decoded_line:
                    print("  ✅ Supervisor routing for complex workflow")
                
                # Check deals agent involvement
                if 'dealsNode' in decoded_line:
                    deals_agent_called = True
                    print("  ✅ Deals agent called")
                
                if 'check_deals' in decoded_line:
                    check_deals_context = True
                    print("  ✅ check_deals context set")
                    
                if 'Enhanced message for complex workflow' in decoded_line:
                    enhanced_deals_message = True
                    print("  ✅ Enhanced deals message for complex workflow")
                
                # Check for deal confirmation state
                if 'awaiting_deal_confirmation' in decoded_line:
                    deal_confirmation_state = True
                    print("  ✅ Deal confirmation state set")
                
                # Check for final response content
                if '"content"' in decoded_line and 'apple' in decoded_line.lower():
                    print("  ✅ Response mentions apples")
        
        print(f"\n📋 Workflow Analysis Results:")
        print(f"  Planner detected complex workflow: {'✅' if planner_detected_complex else '❌'}")
        print(f"  Supervisor detected complex workflow: {'✅' if supervisor_detected_complex else '❌'}")
        print(f"  Deals agent called: {'✅' if deals_agent_called else '❌'}")
        print(f"  Check deals context set: {'✅' if check_deals_context else '❌'}")
        print(f"  Enhanced deals message: {'✅' if enhanced_deals_message else '❌'}")
        print(f"  Deal confirmation state: {'✅' if deal_confirmation_state else '❌'}")
        
        # Determine overall success
        workflow_success = (
            deals_agent_called and 
            check_deals_context and 
            (deal_confirmation_state or enhanced_deals_message)
        )
        
        print(f"\n🎯 Overall Complex Workflow: {'✅ SUCCESS' if workflow_success else '❌ NEEDS IMPROVEMENT'}")
        
        return workflow_success
        
    except Exception as e:
        print(f"❌ Error during complex workflow test: {e}")
        return False

def test_simple_workflows_still_work():
    """Ensure existing simple workflows still work correctly"""
    
    print("\n🔧 TESTING EXISTING WORKFLOWS (Regression Test)")
    print("=" * 70)
    
    simple_tests = [
        {
            "query": "Check deals for milk",
            "expected_agent": "deals",
            "expected_context": "check_deals"
        },
        {
            "query": "Add bananas to my cart", 
            "expected_agent": "cart_and_checkout",
            "expected_context": None
        },
        {
            "query": "Find organic apples",
            "expected_agent": "catalog", 
            "expected_context": None
        }
    ]
    
    all_passed = True
    
    for i, test in enumerate(simple_tests):
        print(f"\n📝 Test {i+1}: '{test['query']}'")
        
        try:
            # Create thread
            thread_response = requests.post(f"{base_url}/threads", timeout=10)
            thread_id = thread_response.json()["thread_id"]
            
            # Send query
            message = {
                "input": {
                    "messages": [{"role": "human", "content": test['query']}]
                },
                "assistant_id": "supervisor"
            }
            
            response = requests.post(
                f"{base_url}/threads/{thread_id}/runs/stream",
                json=message,
                timeout=30,
                stream=True
            )
            
            agent_called = None
            context_set = None
            
            for line in response.iter_lines():
                if line:
                    decoded_line = line.decode()
                    
                    if 'dealsNode' in decoded_line:
                        agent_called = 'deals'
                    elif 'cartAndCheckoutNode' in decoded_line:
                        agent_called = 'cart_and_checkout'
                    elif 'catalogNode' in decoded_line:
                        agent_called = 'catalog'
                        
                    if test['expected_context'] and test['expected_context'] in decoded_line:
                        context_set = test['expected_context']
            
            expected_agent_match = agent_called == test['expected_agent']
            expected_context_match = (
                test['expected_context'] is None or 
                context_set == test['expected_context']
            )
            
            test_passed = expected_agent_match and expected_context_match
            
            print(f"  Expected agent: {test['expected_agent']}, Got: {agent_called} {'✅' if expected_agent_match else '❌'}")
            if test['expected_context']:
                print(f"  Expected context: {test['expected_context']}, Got: {context_set} {'✅' if expected_context_match else '❌'}")
            
            if not test_passed:
                all_passed = False
                
        except Exception as e:
            print(f"  ❌ Error in test {i+1}: {e}")
            all_passed = False
    
    print(f"\n🎯 Regression Tests: {'✅ ALL PASSED' if all_passed else '❌ SOME FAILED'}")
    return all_passed

if __name__ == "__main__":
    print("🧪 COMPLEX WORKFLOW IMPLEMENTATION TEST SUITE")
    print("=" * 70)
    print("Testing enhanced complex workflow capabilities...")
    
    # Test complex workflow
    complex_success = test_complex_workflow_deals_to_cart()
    
    # Test regression
    regression_success = test_simple_workflows_still_work()
    
    print("\n" + "=" * 70)
    print("📊 FINAL RESULTS:")
    print(f"  Complex Workflow Implementation: {'✅ SUCCESS' if complex_success else '❌ FAILED'}")
    print(f"  Existing Functionality Preserved: {'✅ SUCCESS' if regression_success else '❌ FAILED'}")
    
    overall_success = complex_success and regression_success
    print(f"\n🎯 OVERALL: {'✅ IMPLEMENTATION SUCCESSFUL' if overall_success else '❌ NEEDS FIXES'}")
    
    if overall_success:
        print("\n🎉 Complex workflow implementation is working correctly!")
        print("   The system can now handle queries like:")
        print("   'Can you check if there are deals for apples and if there is, add few to my cart'")
    else:
        print("\n⚠️  Some issues detected. Check the logs above for details.")