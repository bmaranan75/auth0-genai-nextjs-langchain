#!/usr/bin/env python3
"""
Test bananas request step by step
"""

import requests
import json

def test_bananas_step_by_step():
    """Test bananas request with detailed logging"""
    
    base_url = "http://localhost:2024"
    
    try:
        print("🧪 Testing bananas request step by step...")
        
        # Create thread
        thread_response = requests.post(f"{base_url}/threads", json={})
        thread_data = thread_response.json()
        thread_id = thread_data.get('thread_id')
        print(f"🧵 Thread: {thread_id}")
        
        # Test bananas request
        message = {
            "input": {
                "messages": [{"role": "human", "content": "I want to add 5 bananas to my cart"}]
            },
            "assistant_id": "supervisor"
        }
        
        print("📤 Sending: 'I want to add 5 bananas to my cart'")
        response = requests.post(
            f"{base_url}/threads/{thread_id}/runs/stream",
            json=message,
            timeout=30,
            stream=True
        )
        
        step_count = 0
        for line in response.iter_lines():
            if line:
                decoded = line.decode()
                step_count += 1
                
                # Look for key events
                if 'next' in decoded:
                    print(f"📍 Step {step_count}: Routing - {decoded[:150]}")
                if 'workflowContext' in decoded:
                    print(f"📍 Step {step_count}: Context - {decoded[:150]}")
                if 'callLangGraphAgent' in decoded:
                    print(f"📍 Step {step_count}: Agent call - {decoded[:150]}")
                if 'deals' in decoded and 'agent' in decoded:
                    print(f"📍 Step {step_count}: Deals agent - {decoded[:150]}")
                if 'awaiting_deal' in decoded:
                    print(f"📍 Step {step_count}: Deal state - {decoded[:150]}")
                if 'would you like' in decoded.lower():
                    print(f"🎯 Step {step_count}: Deal offer - {decoded[:200]}")
                    
                if step_count > 50:  # Prevent infinite loops
                    print("⚠️ Stopping after 50 steps")
                    break
                    
        print(f"📊 Total steps processed: {step_count}")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_bananas_step_by_step()