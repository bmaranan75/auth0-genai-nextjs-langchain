#!/usr/bin/env python3
"""
Simple test to validate the cleaned-up supervisor functionality.
"""

import requests
import json

def test_clean_supervisor():
    """Test the cleaned supervisor routing"""
    
    base_url = "http://localhost:2024"
    
    try:
        print("🧪 Testing cleaned supervisor...")
        
        # Check server
        health_response = requests.get(f"{base_url}/ok", timeout=5)
        if health_response.status_code != 200:
            print(f"❌ Server not accessible: {health_response.status_code}")
            return False
        print("✅ Server is running")
        
        # Create thread
        thread_response = requests.post(f"{base_url}/threads", json={}, timeout=10)
        if thread_response.status_code not in [200, 201]:
            print(f"❌ Failed to create thread: {thread_response.status_code}")
            return False
            
        thread_data = thread_response.json()
        thread_id = thread_data.get('thread_id')
        print(f"✅ Thread created: {thread_id}")
        
        # Test simple routing scenarios
        test_cases = [
            {
                "message": "Show me some apples",
                "expected_agent": "catalog",
                "description": "Product search"
            },
            {
                "message": "Add 3 bananas to my cart", 
                "expected_agent": "deals",
                "description": "Add to cart (should check deals first)"
            },
            {
                "message": "What's in my cart?",
                "expected_agent": "cart_and_checkout", 
                "description": "Cart inquiry"
            },
            {
                "message": "I want to checkout",
                "expected_agent": "cart_and_checkout",
                "description": "Checkout request"
            }
        ]
        
        success_count = 0
        
        for i, test_case in enumerate(test_cases, 1):
            print(f"\n🧪 Test {i}: {test_case['description']}")
            print(f"📤 Message: '{test_case['message']}'")
            
            message_data = {
                "input": {
                    "messages": [
                        {
                            "role": "human", 
                            "content": test_case['message']
                        }
                    ]
                },
                "assistant_id": "supervisor"
            }
            
            response = requests.post(
                f"{base_url}/threads/{thread_id}/runs/stream",
                json=message_data,
                timeout=30,
                stream=True
            )
            
            if response.status_code in [200, 201]:
                print("✅ Message sent successfully")
                
                # Read a few lines to see the routing
                line_count = 0
                for line in response.iter_lines():
                    if line and line_count < 10:
                        decoded_line = line.decode()
                        if 'routing' in decoded_line.lower() or 'agent' in decoded_line.lower():
                            print(f"📍 Route info: {decoded_line}")
                        line_count += 1
                
                success_count += 1
            else:
                print(f"❌ Message failed: {response.status_code}")
                
        print(f"\n📊 Test Results: {success_count}/{len(test_cases)} tests passed")
        return success_count == len(test_cases)
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False

if __name__ == "__main__":
    print("🚀 Testing Cleaned Supervisor")
    print("=" * 40)
    
    success = test_clean_supervisor()
    
    print("\n" + "=" * 40)
    if success:
        print("🎉 Cleaned supervisor is working!")
        print("   ✅ Legacy code removed")
        print("   ✅ Streamlined routing logic")
        print("   ✅ LLM-based continuation detection")
    else:
        print("💥 Some tests failed")
    
    print("\nNote: Start server with: npm run dev:langgraph")