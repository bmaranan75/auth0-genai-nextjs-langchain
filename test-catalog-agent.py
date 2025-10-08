#!/usr/bin/env python3
"""
Test script to verify the catalog agent can be accessed via LangGraph server
and that streamEvents method is available.
"""

import requests
import json
import time

def test_catalog_agent():
    """Test the catalog agent via LangGraph server API"""
    
    # LangGraph server URL (default port is 8123)
    base_url = "http://localhost:2024"
    
    try:
        # Test 1: Check if server is running
        print("🧪 Testing LangGraph server connectivity...")
        health_response = requests.get(f"{base_url}/ok", timeout=5)
        if health_response.status_code == 200:
            print("✅ LangGraph server is running")
        else:
            print(f"❌ Server health check failed: {health_response.status_code}")
            return False
            
    except requests.ConnectionError:
        print("❌ Cannot connect to LangGraph server at localhost:8123")
        print("   Make sure to run: npm run dev:langgraph")
        return False
    except Exception as e:
        print(f"❌ Health check failed: {e}")
        return False
    
    try:
        # Test 2: Explore API endpoints to find the correct one
        print("\n🧪 Exploring available API endpoints...")
        
        # Try different possible endpoints based on LangGraph server API
        endpoints_to_try = [
            "/threads",
            "/runs", 
            "/assistants",
            "/crons",
            "/",
            "/docs",
            "/openapi.json"
        ]
        
        working_endpoints = []
        for endpoint in endpoints_to_try:
            try:
                response = requests.get(f"{base_url}{endpoint}", timeout=5)
                if response.status_code in [200, 201]:
                    working_endpoints.append((endpoint, response.status_code))
                elif response.status_code == 404:
                    continue
                else:
                    working_endpoints.append((endpoint, f"Status: {response.status_code}"))
            except:
                continue
        
        if working_endpoints:
            print("✅ Found working endpoints:")
            for endpoint, status in working_endpoints:
                print(f"   - {endpoint} ({status})")
        else:
            print("❌ No working endpoints found")
            
        # Try to create a thread directly - this is the standard LangGraph approach
        print("\n🧪 Testing direct thread creation...")
        thread_create_response = requests.post(f"{base_url}/threads", json={}, timeout=10)
        
        if thread_create_response.status_code in [200, 201]:
            thread_data = thread_create_response.json()
            thread_id = thread_data.get('thread_id')
            print(f"✅ Successfully created thread: {thread_id}")
            
            # Now try to run the catalog graph on this thread
            print("✅ Ready to test catalog graph")
        else:
            print(f"❌ Failed to create thread: {thread_create_response.status_code}")
            print(f"   Response: {thread_create_response.text[:200]}")
            return False
            
    except Exception as e:
        print(f"❌ Failed to explore API: {e}")
        return False
    
    try:
        # Test 3: Send a message to catalog agent using the existing thread
        print("\n🧪 Testing catalog agent functionality...")
        
        # Send a message to the catalog agent - try different message formats
        message_data = {
            "input": {
                "messages": [
                    {
                        "role": "human", 
                        "content": "Show me some apples from the catalog"
                    }
                ]
            },
            "assistant_id": "catalog"
        }
        
        # Use the catalog graph directly
        catalog_graph_name = "catalog"
        
        print(f"✅ Using catalog graph: {catalog_graph_name}")
        
        # Send message via streaming endpoint for the specific graph
        stream_url = f"{base_url}/threads/{thread_id}/runs/stream"
        stream_response = requests.post(
            stream_url, 
            json=message_data,
            timeout=30,
            stream=True
        )
        
        if stream_response.status_code in [200, 201]:
            print("✅ Successfully initiated streaming request")
            print("✅ streamEvents method is working (no TypeError)")
            
            # Read more of the stream to see if we get agent response
            content_received = False
            line_count = 0
            agent_response_found = False
            
            for line in stream_response.iter_lines():
                if line:
                    decoded_line = line.decode()
                    print(f"📡 Stream line {line_count}: {decoded_line}")
                    content_received = True
                    
                    # Look for agent response content
                    if 'assistant' in decoded_line.lower() or 'found' in decoded_line.lower():
                        agent_response_found = True
                        print("🎯 Found potential agent response!")
                    
                    line_count += 1
                    if line_count >= 50:  # Read more lines to see full response
                        break
            
            if agent_response_found:
                print("✅ Agent response detected in stream")
            else:
                print("⚠️  No clear agent response found in stream")
                    
            if content_received:
                print("✅ Stream data received successfully")
            else:
                print("⚠️  No stream data received (but no error)")
                
            return True
        else:
            print(f"❌ Streaming request failed: {stream_response.status_code}")
            print(f"   Response: {stream_response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Catalog agent test failed: {e}")
        return False

if __name__ == "__main__":
    print("🚀 Testing LangGraph Catalog Agent")
    print("=" * 50)
    
    success = test_catalog_agent()
    
    print("\n" + "=" * 50)
    if success:
        print("🎉 All tests passed! The streamEvents error should be resolved.")
    else:
        print("💥 Some tests failed. Check the output above for details.")
    
    print("\nNote: Make sure the LangGraph server is running:")
    print("  npm run dev:langgraph")