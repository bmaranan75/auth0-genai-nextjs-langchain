#!/usr/bin/env python3
"""
Simple test to verify supervisor is routing correctly
"""

import requests
import json

def test_supervisor_routing():
    """Test supervisor routing logic"""
    
    base_url = "http://localhost:2024"
    
    try:
        print("🧪 Testing supervisor routing...")
        
        # Create thread
        thread_response = requests.post(f"{base_url}/threads", json={})
        thread_data = thread_response.json()
        thread_id = thread_data.get('thread_id')
        print(f"🧵 Thread: {thread_id}")
        
        # Test simple routing
        message = {
            "input": {
                "messages": [{"role": "human", "content": "Hello"}]
            },
            "assistant_id": "supervisor"
        }
        
        print("📤 Sending simple message to supervisor...")
        response = requests.post(
            f"{base_url}/threads/{thread_id}/runs/stream",
            json=message,
            timeout=10,
            stream=True
        )
        
        found_routing = False
        for line in response.iter_lines():
            if line:
                decoded = line.decode()
                if 'next' in decoded and ('catalog' in decoded or 'cart' in decoded or 'deals' in decoded):
                    print(f"✅ Supervisor routing detected: {decoded[:100]}")
                    found_routing = True
                if 'callLangGraphAgent' in decoded:
                    print("✅ Found callLangGraphAgent in response")
                    
        if found_routing:
            print("✅ Supervisor routing is working")
            return True
        else:
            print("❌ No routing detected")
            return False
            
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False

if __name__ == "__main__":
    test_supervisor_routing()