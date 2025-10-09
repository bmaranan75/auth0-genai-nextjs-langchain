#!/usr/bin/env python3
"""
Test to verify supervisor doesn't make direct tool calls
"""

import requests
import json
import re

def test_supervisor_no_tools():
    """Test that supervisor only routes and doesn't call tools directly"""
    
    base_url = "http://localhost:2024"
    
    try:
        print("🔍 Testing supervisor for direct tool calls...")
        
        # Create thread
        thread_response = requests.post(f"{base_url}/threads", json={})
        thread_data = thread_response.json()
        thread_id = thread_data.get('thread_id')
        print(f"🧵 Thread: {thread_id}")
        
        # Test message that would typically trigger tool calls
        message = {
            "input": {
                "messages": [{"role": "human", "content": "Add 5 apples to my cart"}]
            },
            "assistant_id": "supervisor"
        }
        
        print("📤 Sending add-to-cart message to supervisor...")
        response = requests.post(
            f"{base_url}/threads/{thread_id}/runs/stream",
            json=message,
            timeout=15,
            stream=True
        )
        
        tool_calls_from_supervisor = []
        agent_routing_found = False
        
        for line in response.iter_lines():
            if line:
                decoded = line.decode()
                
                # Check for agent routing (good)
                if 'next' in decoded and ('catalog' in decoded or 'cart' in decoded or 'deals' in decoded):
                    print(f"✅ Agent routing found: {decoded[:100]}")
                    agent_routing_found = True
                
                # Check for direct tool calls from supervisor (bad)
                if ('tool_calls' in decoded or 'ToolMessage' in decoded) and 'supervisor' in decoded:
                    tool_calls_from_supervisor.append(decoded[:200])
                    print(f"⚠️  Potential tool call from supervisor: {decoded[:100]}")
                
                # Check for callLangGraphAgent (good - this is routing)
                if 'callLangGraphAgent' in decoded:
                    print("✅ Found callLangGraphAgent - supervisor is delegating properly")
        
        # Verify results
        if agent_routing_found and not tool_calls_from_supervisor:
            print("✅ SUCCESS: Supervisor only routes, no direct tool calls detected")
            return True
        elif tool_calls_from_supervisor:
            print("❌ ISSUE: Supervisor is making direct tool calls:")
            for call in tool_calls_from_supervisor:
                print(f"   - {call}")
            return False
        else:
            print("⚠️  No clear routing detected")
            return False
            
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False

if __name__ == "__main__":
    success = test_supervisor_no_tools()
    exit(0 if success else 1)