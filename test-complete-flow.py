#!/usr/bin/env python3
"""
Test the complete flow with the new LangGraph service calls
"""

import requests
import json

def test_complete_flow():
    """Test the complete deal flow with detailed output"""
    
    base_url = "http://localhost:2024"
    
    try:
        print("🧪 Testing complete deal flow with LangGraph services...")
        
        # Create thread
        thread_response = requests.post(f"{base_url}/threads", json={}, timeout=10)
        thread_data = thread_response.json()
        thread_id = thread_data.get('thread_id')
        print(f"🧵 Thread created: {thread_id}")
        
        # Step 1: Request bananas
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
        
        deal_state = False
        step1_complete = False
        
        for line in response1.iter_lines():
            if line:
                decoded_line = line.decode()
                if 'awaiting_deal_confirmation' in decoded_line:
                    deal_state = True
                    print("✅ Deal confirmation state detected")
                if 'would you like' in decoded_line.lower() or 'apply this deal' in decoded_line.lower():
                    print("🎯 Deal offer detected in response")
                if '"next": "END"' in decoded_line or 'event": "end"' in decoded_line:
                    step1_complete = True
                    
        print(f"📊 Step 1 Results: Deal state: {deal_state}, Complete: {step1_complete}")
        
        if not deal_state:
            print("❌ No deal confirmation state found, checking if direct cart call works")
            return False
            
        # Step 2: Confirm deal
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
        
        print("\n📤 Step 2: Confirming deal...")
        response2 = requests.post(
            f"{base_url}/threads/{thread_id}/runs/stream",
            json=step2_message,
            timeout=30,
            stream=True
        )
        
        cart_called = False
        tool_executed = False
        final_response = ""
        
        for line in response2.iter_lines():
            if line:
                decoded_line = line.decode()
                if 'cart_and_checkout' in decoded_line:
                    cart_called = True
                if 'add_to_cart' in decoded_line and '"name"' in decoded_line:
                    tool_executed = True
                    print("🔧 Add to cart tool executed!")
                if '"content"' in decoded_line and len(decoded_line) > 50:
                    try:
                        data = json.loads(decoded_line.split('data: ')[1])
                        if 'messages' in data and data['messages']:
                            last_msg = data['messages'][-1]
                            if 'content' in last_msg:
                                final_response = last_msg['content'][:200]
                    except:
                        pass
                        
        print(f"📊 Step 2 Results:")
        print(f"   Cart called: {cart_called}")
        print(f"   Tool executed: {tool_executed}")
        print(f"   Final response: {final_response}")
        
        if tool_executed:
            print("✅ SUCCESS: Complete flow working with tool execution!")
            return True
        elif cart_called:
            print("⚠️ Cart called but tool not executed")
            return False
        else:
            print("❌ Cart not called")
            return False
            
    except Exception as e:
        print(f"❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_complete_flow()
    exit(0 if success else 1)