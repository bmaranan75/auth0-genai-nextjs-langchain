#!/usr/bin/env python3
"""
Test script to validate the automatic workflow fix
Tests both automatic complex workflows and manual confirmation preservation
"""

import requests

base_url = "http://localhost:3001/api/langgraph"


def test_automatic_complex_workflow():
    """Test that complex workflows auto-proceed to cart when deals found"""
    
    print("🤖 TESTING AUTOMATIC COMPLEX WORKFLOW")
    print("-" * 50)
    
    try:
        # Create thread
        thread_response = requests.post(f"{base_url}/threads", timeout=10)
        if thread_response.status_code != 200:
            print(f"❌ Failed to create thread: {thread_response.status_code}")
            return False
            
        thread_id = thread_response.json()["thread_id"]
        print(f"✅ Thread created: {thread_id}")
        
        # Test complex query
        complex_query = "Can you check if there are deals for apples and if there is, add few to my cart"
        
        message = {
            "input": {
                "messages": [{"role": "human", "content": complex_query}]
            },
            "assistant_id": "supervisor"
        }
        
        print(f"📤 Query: '{complex_query}'")
        
        response = requests.post(
            f"{base_url}/threads/{thread_id}/runs/stream",
            json=message,
            timeout=60,
            stream=True
        )
        
        # Track workflow progression
        deals_called = False
        auto_proceed = False
        cart_called = False
        add_to_cart_with_deals = False
        automatic_flow = False
        
        for line in response.iter_lines():
            if line:
                decoded_line = line.decode()
                
                if 'dealsNode' in decoded_line:
                    deals_called = True
                    
                if 'Complex workflow with deals found - auto-proceeding to cart' in decoded_line:
                    auto_proceed = True
                    print("  ✅ Auto-proceeding to cart detected")
                    
                if 'cartAndCheckoutNode' in decoded_line:
                    cart_called = True
                    
                if 'add_to_cart_with_deals' in decoded_line:
                    add_to_cart_with_deals = True
                    
                if 'Auto-proceeding with deal application for complex workflow' in decoded_line:
                    automatic_flow = True
                    print("  ✅ Automatic flow in cart node detected")
        
        workflow_success = (
            deals_called and 
            auto_proceed and 
            cart_called and 
            add_to_cart_with_deals and
            automatic_flow
        )
        
        print(f"📊 Results:")
        print(f"  Deals agent called: {'✅' if deals_called else '❌'}")
        print(f"  Auto-proceed triggered: {'✅' if auto_proceed else '❌'}")
        print(f"  Cart agent called: {'✅' if cart_called else '❌'}")
        print(f"  Correct workflow context: {'✅' if add_to_cart_with_deals else '❌'}")
        print(f"  Automatic flow detected: {'✅' if automatic_flow else '❌'}")
        
        print(f"🎯 Automatic Complex Workflow: {'✅ SUCCESS' if workflow_success else '❌ FAILED'}")
        return workflow_success
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


def test_manual_confirmation_preserved():
    """Test that simple deal queries still require manual confirmation"""
    
    print("\n🙋 TESTING MANUAL CONFIRMATION PRESERVATION")
    print("-" * 50)
    
    try:
        # Create thread  
        thread_response = requests.post(f"{base_url}/threads", timeout=10)
        thread_id = thread_response.json()["thread_id"]
        
        # Test simple deal query
        simple_query = "Check deals for milk"
        
        message = {
            "input": {
                "messages": [{"role": "human", "content": simple_query}]
            },
            "assistant_id": "supervisor"
        }
        
        print(f"📤 Query: '{simple_query}'")
        
        response = requests.post(
            f"{base_url}/threads/{thread_id}/runs/stream",
            json=message,
            timeout=30,
            stream=True
        )
        
        deals_called = False
        manual_confirmation = False
        awaiting_confirmation = False
        no_auto_proceed = True
        
        for line in response.iter_lines():
            if line:
                decoded_line = line.decode()
                
                if 'dealsNode' in decoded_line:
                    deals_called = True
                    
                if 'Simple deal query - requiring manual confirmation' in decoded_line:
                    manual_confirmation = True
                    print("  ✅ Manual confirmation detected")
                    
                if 'awaiting_deal_confirmation' in decoded_line:
                    awaiting_confirmation = True
                    
                if 'auto-proceeding to cart' in decoded_line.lower():
                    no_auto_proceed = False
                    print("  ❌ Unexpected auto-proceed detected")
        
        preservation_success = (
            deals_called and 
            manual_confirmation and 
            awaiting_confirmation and
            no_auto_proceed
        )
        
        print(f"📊 Results:")
        print(f"  Deals agent called: {'✅' if deals_called else '❌'}")
        print(f"  Manual confirmation triggered: {'✅' if manual_confirmation else '❌'}")
        print(f"  Awaiting confirmation state: {'✅' if awaiting_confirmation else '❌'}")
        print(f"  No auto-proceed: {'✅' if no_auto_proceed else '❌'}")
        
        print(f"🎯 Manual Confirmation Preserved: {'✅ SUCCESS' if preservation_success else '❌ FAILED'}")
        return preservation_success
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


if __name__ == "__main__":
    print("🧪 AUTOMATIC WORKFLOW FIX VALIDATION")
    print("=" * 70)
    
    # Test automatic flow
    automatic_success = test_automatic_complex_workflow()
    
    # Test manual confirmation preservation  
    manual_success = test_manual_confirmation_preserved()
    
    print("\n" + "=" * 70)
    print("📊 FINAL RESULTS:")
    print(f"  Automatic Complex Workflow: {'✅ SUCCESS' if automatic_success else '❌ FAILED'}")
    print(f"  Manual Confirmation Preserved: {'✅ SUCCESS' if manual_success else '❌ FAILED'}")
    
    overall_success = automatic_success and manual_success
    
    if overall_success:
        print(f"\n🎉 AUTOMATIC WORKFLOW FIX: ✅ SUCCESSFUL")
        print("   Complex workflows now auto-proceed when deals found!")
        print("   Simple workflows still require manual confirmation!")
    else:
        print(f"\n⚠️ AUTOMATIC WORKFLOW FIX: ❌ NEEDS ATTENTION")
        print("   Check the logs above for specific issues.")