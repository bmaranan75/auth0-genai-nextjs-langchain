#!/usr/bin/env python3
"""
Test deals agent directly to verify it works
"""

import requests

def test_deals_agent():
    """Test deals agent directly"""
    
    base_url = "http://localhost:2024"
    
    try:
        print("🧪 Testing deals agent directly...")
        
        # Create thread
        thread_response = requests.post(f"{base_url}/threads", json={})
        thread_data = thread_response.json()
        thread_id = thread_data.get('thread_id')
        
        # Test deals agent with bananas
        message = {
            "input": {
                "messages": [{"role": "human", "content": "Check for deals on bananas (quantity: 5)"}]
            },
            "assistant_id": "deals"
        }
        
        print("📤 Calling deals agent directly...")
        response = requests.post(
            f"{base_url}/threads/{thread_id}/runs/stream",
            json=message,
            timeout=30,
            stream=True
        )
        
        deal_found = False
        for line in response.iter_lines():
            if line:
                decoded = line.decode()
                if 'deal' in decoded.lower() and ('banana' in decoded.lower() or 'save' in decoded.lower()):
                    print(f"🎯 Deal response: {decoded[:200]}")
                    deal_found = True
                if 'would you like' in decoded.lower():
                    print("✅ Deal confirmation prompt found")
                    return True
                    
        if deal_found:
            print("✅ Deals agent is working")
            return True
        else:
            print("❌ No deals found")
            return False
            
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False

if __name__ == "__main__":
    test_deals_agent()