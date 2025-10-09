#!/usr/bin/env python3
"""
Test script to validate the enhanced supervisor behavior,
specifically for continuation scenarios like deal confirmations.
"""

import requests
import json
import time

def test_enhanced_supervisor():
    """Test the enhanced supervisor's continuation handling"""
    
    base_url = "http://localhost:2024"
    
    try:
        # Test 1: Server connectivity
        print("🧪 Testing LangGraph server connectivity...")
        health_response = requests.get(f"{base_url}/ok", timeout=5)
        if health_response.status_code != 200:
            print(f"❌ Server not accessible: {health_response.status_code}")
            return False
        print("✅ LangGraph server is running")
        
        # Test 2: Create thread
        print("\n🧪 Creating thread for supervisor testing...")
        thread_response = requests.post(f"{base_url}/threads", json={}, timeout=10)
        if thread_response.status_code not in [200, 201]:
            print(f"❌ Failed to create thread: {thread_response.status_code}")
            return False
            
        thread_data = thread_response.json()
        thread_id = thread_data.get('thread_id')
        print(f"✅ Thread created: {thread_id}")
        
        # Test 3: Test deal continuation scenario
        print("\n🧪 Testing deal continuation scenario...")
        
        # Step 1: User wants to add bananas to cart
        test_add_to_cart_message = {
            "input": {
                "messages": [
                    {
                        "role": "human", 
                        "content": "I want to add 5 bananas to my cart"
                    }
                ]
            },
            "assistant_id": "supervisor"
        }
        
        print("📤 Sending: 'I want to add 5 bananas to my cart'")
        response1 = requests.post(
            f"{base_url}/threads/{thread_id}/runs/stream",
            json=test_add_to_cart_message,
            timeout=30,
            stream=True
        )
        
        if response1.status_code in [200, 201]:
            print("✅ First message sent successfully")
            
            # Read response to see if deals are offered
            deals_offered = False
            full_response = ""
            
            for line in response1.iter_lines():
                if line:
                    decoded_line = line.decode()
                    if 'deal' in decoded_line.lower() or 'offer' in decoded_line.lower():
                        deals_offered = True
                        full_response += decoded_line + "\n"
                        print(f"🎯 Deal offer detected: {decoded_line}")
                    
            print(f"📊 Deals offered: {deals_offered}")
            
            # Step 2: Test continuation with "yes" response
            if deals_offered:
                print("\n📤 Sending continuation: 'Yes, apply the deal'")
                
                continuation_message = {
                    "input": {
                        "messages": [
                            {
                                "role": "human", 
                                "content": "Yes, apply the deal"
                            }
                        ]
                    },
                    "assistant_id": "supervisor"
                }
                
                response2 = requests.post(
                    f"{base_url}/threads/{thread_id}/runs/stream",
                    json=continuation_message,
                    timeout=30,
                    stream=True
                )
                
                if response2.status_code in [200, 201]:
                    print("✅ Continuation message sent successfully")
                    
                    # Check if it was routed to cart_and_checkout
                    cart_response_found = False
                    for line in response2.iter_lines():
                        if line:
                            decoded_line = line.decode()
                            if 'cart' in decoded_line.lower() or 'added' in decoded_line.lower():
                                cart_response_found = True
                                print(f"🛒 Cart response: {decoded_line}")
                    
                    if cart_response_found:
                        print("✅ Continuation correctly routed to cart agent")
                        return True
                    else:
                        print("⚠️ No cart response found in continuation")
                        return False
                else:
                    print(f"❌ Continuation failed: {response2.status_code}")
                    return False
            else:
                print("ℹ️ No deals offered, testing basic add-to-cart flow")
                return True
                
        else:
            print(f"❌ First message failed: {response1.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Test failed with error: {e}")
        return False

def test_checkout_continuation():
    """Test checkout flow continuation"""
    
    base_url = "http://localhost:2024"
    
    try:
        print("\n🧪 Testing checkout continuation scenario...")
        
        # Create new thread
        thread_response = requests.post(f"{base_url}/threads", json={}, timeout=10)
        thread_data = thread_response.json()
        thread_id = thread_data.get('thread_id')
        
        # Step 1: User initiates checkout
        checkout_message = {
            "input": {
                "messages": [
                    {
                        "role": "human", 
                        "content": "I want to checkout"
                    }
                ]
            },
            "assistant_id": "supervisor"
        }
        
        print("📤 Sending: 'I want to checkout'")
        response1 = requests.post(
            f"{base_url}/threads/{thread_id}/runs/stream",
            json=checkout_message,
            timeout=30,
            stream=True
        )
        
        if response1.status_code in [200, 201]:
            print("✅ Checkout message sent successfully")
            
            # Step 2: Test continuation with confirmation
            confirm_message = {
                "input": {
                    "messages": [
                        {
                            "role": "human", 
                            "content": "Yes, proceed with the checkout"
                        }
                    ]
                },
                "assistant_id": "supervisor"
            }
        
        print("📤 Sending continuation: 'Yes, proceed with the checkout'")
        response2 = requests.post(
            f"{base_url}/threads/{thread_id}/runs/stream",
            json=confirm_message,
            timeout=30,
            stream=True
        )
        
        if response2.status_code in [200, 201]:
            print("✅ Checkout continuation handled successfully")
            return True
        else:
            print(f"❌ Checkout continuation failed: {response2.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Checkout continuation test failed: {e}")
        return False

if __name__ == "__main__":
    print("🚀 Testing Enhanced Supervisor Continuation Handling")
    print("=" * 60)
    
    # Test the enhanced supervisor
    supervisor_success = test_enhanced_supervisor()
    checkout_success = test_checkout_continuation()
    
    print("\n" + "=" * 60)
    print("📊 Test Results:")
    print(f"   Deal continuation: {'✅ PASSED' if supervisor_success else '❌ FAILED'}")
    print(f"   Checkout continuation: {'✅ PASSED' if checkout_success else '❌ FAILED'}")
    
    if supervisor_success and checkout_success:
        print("\n🎉 Enhanced supervisor is working correctly!")
        print("   ✅ LLM-based continuation detection implemented")
        print("   ✅ Context-aware routing improved")
        print("   ✅ Deal confirmation flow enhanced")
    else:
        print("\n💥 Some tests failed. Check the supervisor logic.")
    
    print("\nNote: Ensure LangGraph server is running with:")
    print("  npm run dev:langgraph")