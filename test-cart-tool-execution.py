#!/usr/bin/env python3
"""
Enhanced test specifically for cart agent tool execution
"""

import requests
import json
import time

def test_cart_tool_execution():
    """Test if cart agent actually calls add_to_cart tool"""
    
    base_url = "http://localhost:2024"
    
    try:
        print("🧪 Testing cart agent tool execution...")
        
        # Create thread
        thread_response = requests.post(f"{base_url}/threads", json={}, timeout=10)
        thread_data = thread_response.json()
        thread_id = thread_data.get('thread_id')
        print(f"🧵 Thread created: {thread_id}")
        
        # Step 1: Get deals offer
        step1_message = {
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
        
        print("📤 Step 1: Requesting bananas...")
        response1 = requests.post(
            f"{base_url}/threads/{thread_id}/runs/stream",
            json=step1_message,
            timeout=30,
            stream=True
        )
        
        # Look for deal confirmation state
        deals_offered = False
        for line in response1.iter_lines():
            if line:
                decoded_line = line.decode()
                if 'awaiting_deal_confirmation' in decoded_line:
                    deals_offered = True
                    print("✅ Deal confirmation state detected")
                    break
        
        if not deals_offered:
            print("❌ No deal confirmation state found")
            return False
        
        # Step 2: Confirm deal and check for tool execution
        step2_message = {
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
        
        print("📤 Step 2: Confirming deal...")
        response2 = requests.post(
            f"{base_url}/threads/{thread_id}/runs/stream",
            json=step2_message,
            timeout=30,
            stream=True
        )
        
        tool_called = False
        cart_response = False
        tool_content = ""
        
        for line in response2.iter_lines():
            if line:
                decoded_line = line.decode()
                
                # Look for tool execution
                if 'add_to_cart' in decoded_line and '"name"' in decoded_line:
                    tool_called = True
                    print(f"🔧 Tool execution detected: {decoded_line[:100]}...")
                
                # Look for tool result
                if '"success"' in decoded_line and 'cart' in decoded_line.lower():
                    tool_content = decoded_line
                    print(f"📊 Tool result: {decoded_line[:150]}...")
                
                # Look for final cart response
                if 'added' in decoded_line.lower() or 'cart' in decoded_line.lower():
                    cart_response = True
                    print(f"🛒 Cart response: {decoded_line[:100]}...")
        
        print(f"\n📊 Results:")
        print(f"   Tool called: {tool_called}")
        print(f"   Cart response: {cart_response}")
        
        if tool_called and cart_response:
            print("✅ Cart agent successfully executed add_to_cart tool!")
            return True
        elif cart_response and not tool_called:
            print("⚠️ Cart response found but no tool execution detected")
            return False
        else:
            print("❌ No cart tool execution or response found")
            return False
            
    except Exception as e:
        print(f"❌ Test failed with error: {e}")
        return False

if __name__ == "__main__":
    success = test_cart_tool_execution()
    exit(0 if success else 1)