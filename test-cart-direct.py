#!/usr/bin/env python3
"""
Direct test of cart agent to isolate tool execution issue
"""

import requests
import json

def test_cart_agent_directly():
    """Test cart agent directly with the deal context message"""
    
    base_url = "http://localhost:2024"
    
    try:
        print("🧪 Testing cart agent directly...")
        
        # Create thread
        thread_response = requests.post(f"{base_url}/threads", json={}, timeout=10)
        thread_data = thread_response.json()
        thread_id = thread_data.get('thread_id')
        print(f"🧵 Thread created: {thread_id}")
        
        # Test the exact message that should trigger add_to_cart tool
        test_message = {
            "input": {
                "messages": [
                    {
                        "role": "human", 
                        "content": 'User confirmed: "Yes, apply the deal". Please add 5 bananas to cart using productCode "banana" and apply the product_deal deal that was offered'
                    }
                ]
            },
            "assistant_id": "cart_and_checkout"  # Call cart agent directly
        }
        
        print("📤 Sending direct cart message...")
        print(f"📝 Message: {test_message['input']['messages'][0]['content']}")
        
        response = requests.post(
            f"{base_url}/threads/{thread_id}/runs/stream",
            json=test_message,
            timeout=30,
            stream=True
        )
        
        tool_called = False
        tool_result = False
        response_text = ""
        
        for line in response.iter_lines():
            if line:
                decoded_line = line.decode()
                
                # Look for tool execution
                if 'add_to_cart' in decoded_line and '"name"' in decoded_line:
                    tool_called = True
                    print(f"🔧 Tool execution detected!")
                
                # Look for tool result
                if '"success"' in decoded_line and ('true' in decoded_line or 'false' in decoded_line):
                    tool_result = True
                    print(f"📊 Tool result: {decoded_line[:200]}...")
                
                # Collect response text
                if '"content"' in decoded_line and '"messages"' in decoded_line:
                    response_text += decoded_line
                    print(f"💬 Response: {decoded_line[:150]}...")
        
        print(f"\n📊 Results:")
        print(f"   Tool called: {tool_called}")
        print(f"   Tool result: {tool_result}")
        
        if tool_called:
            print("✅ Cart agent successfully called add_to_cart tool!")
            return True
        else:
            print("❌ Cart agent did not call add_to_cart tool")
            print("🔍 This indicates a problem with the cart agent's prompt or logic")
            return False
            
    except Exception as e:
        print(f"❌ Test failed with error: {e}")
        return False

if __name__ == "__main__":
    success = test_cart_agent_directly()
    exit(0 if success else 1)