'use client';

import { useState, useEffect, useRef } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { toast } from 'sonner';
import { ArrowUpIcon, LoaderCircle, MessageSquarePlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import { generateConversationId } from '@/utils/conversation-id';

interface LangChainMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isEphemeral?: boolean;
  ephemeralType?: 'authorization-request' | 'authorization-approved' | 'authorization-denied' | 'authorization-pending';
}

function ChatInput(props: {
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  loading?: boolean;
  placeholder?: string;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.stopPropagation();
        e.preventDefault();
        props.onSubmit(e);
      }}
      className="flex w-full flex-col p-4"
    >
      <div className="border border-input bg-background rounded-lg flex flex-col gap-2 max-w-[768px] w-full mx-auto">
        <input
          value={props.value}
          placeholder={props.placeholder}
          onChange={props.onChange}
          className="border-none outline-none bg-transparent p-4 text-foreground placeholder:text-muted-foreground"
        />

        <div className="flex justify-between ml-4 mr-2 mb-2">
          <div className="flex gap-3"></div>

          <Button
            className="rounded-full p-1.5 h-fit border dark:border-zinc-600"
            type="submit"
            disabled={props.loading}
          >
            {props.loading ? <LoaderCircle className="animate-spin" /> : <ArrowUpIcon size={14} />}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function ChatWindow(props: {
  endpoint: string;
  emptyStateComponent: ReactNode;
  placeholder?: string;
  emoji?: string;
}) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<LangChainMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>(''); // NEW: Single status indicator
  const [conversationId, setConversationId] = useState<string>(() => generateConversationId());
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Function to add ephemeral messages as part of chat
  const addEphemeralMessage = (type: NonNullable<LangChainMessage['ephemeralType']>, content: string) => {
    const ephemeralMessage: LangChainMessage = {
      id: `ephemeral-${Date.now()}`,
      role: 'system',
      content,
      isEphemeral: true,
      ephemeralType: type,
    };
    setMessages(prev => [...prev, ephemeralMessage]);
    
    // Scroll to bottom after adding ephemeral message
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 50);
    
    // Auto-remove ephemeral messages after 10 seconds (except pending ones)
    if (type !== 'authorization-pending') {
      setTimeout(() => {
        setMessages(prev => prev.filter(msg => msg.id !== ephemeralMessage.id));
      }, 10000);
    }
  };

  // Function to remove specific ephemeral message
  const removeEphemeralMessage = (id: string) => {
    setMessages(prev => prev.filter(msg => msg.id !== id));
  };

  // Function to remove pending authorization messages
  const removePendingAuthMessages = () => {
    setMessages(prev => prev.filter(msg => !(msg.isEphemeral && msg.ephemeralType === 'authorization-pending')));
  };

  // Function to remove completed authorization messages (but keep initial request message)
  const removeCompletedAuthMessages = () => {
    setMessages(prev => prev.filter(msg => !(msg.isEphemeral && ['authorization-pending', 'authorization-approved', 'authorization-denied'].includes(msg.ephemeralType || ''))));
  };

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    const scrollToBottom = () => {
      // Try multiple methods to ensure reliable scrolling
      if (messagesEndRef.current) {
        // Method 1: Scroll the target element into view
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
      
      if (chatContainerRef.current) {
        // Method 2: Directly scroll the container (fallback)
        setTimeout(() => {
          if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
          }
        }, 50);
      }
    };
    
    // Use a small delay to ensure DOM has updated
    const timeoutId = setTimeout(scrollToBottom, 100);
    
    return () => clearTimeout(timeoutId);
  }, [messages]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Function to start polling for authorization status
  const startAuthorizationPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    
    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch('/api/auth-status');
        if (response.ok) {
          const data = await response.json();
          if (data.authorizationStatus && data.authorizationStatus !== 'pending') {
            // Stop polling
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            
            // Remove pending messages
            removePendingAuthMessages();
            
            // Add status message
            if (data.authorizationStatus === 'approved') {
              addEphemeralMessage('authorization-approved', 
                `✅ Authorization approved! Processing your request...`);
            } else if (data.authorizationStatus === 'denied') {
              addEphemeralMessage('authorization-denied', 
                `❌ Authorization was denied.`);
            }
          }
        }
      } catch (error) {
        console.error('Error polling authorization status:', error);
      }
    }, 2000); // Poll every 2 seconds
  };

  // Function to start a new chat conversation
  const startNewChat = () => {
    const newConversationId = generateConversationId();
    setConversationId(newConversationId);
    setMessages([]);
    setInput('');
    
    // Stop any ongoing polling
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    
    console.log('[ChatWindow] Started new conversation:', newConversationId);
    toast.success('New conversation started');
  };

  // Function to check if message requires authorization
  const requiresAuthorization = (content: string): boolean => {
    // Only treat explicit checkout/payment intents as requiring authorization.
    // Do NOT treat generic 'add to cart' or ambiguous words like 'order' as
    // triggers for an authorization flow.
    const authKeywords = [
      'checkout', 'buy', 'purchase', 'proceed to checkout', 'complete purchase', 'make payment'
    ];
    const lowerContent = content.toLowerCase();
    return authKeywords.some(keyword => lowerContent.includes(keyword));
  };

  async function sendMessage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isLoading || !input.trim()) return;
    
    const userMessage: LangChainMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    // Scroll to bottom after adding user message
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 50);
    
    // Check if this message likely requires authorization
    const needsAuth = requiresAuthorization(userMessage.content);
    
    setInput('');
    setIsLoading(true);
    
    // Show immediate authorization message if needed
    if (needsAuth) {
      setTimeout(() => {
        addEphemeralMessage('authorization-pending', 
          `🔐 Authorization request sent. Please check your device to approve the transaction...`);
      }, 500); // Small delay to feel more natural
    }
    
    try {
      // Use EventSource for SSE streaming
      const response = await fetch(props.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMessage]
            .filter(msg => !msg.isEphemeral) // Exclude ephemeral messages from context
            .map(msg => ({
              role: msg.role,
              content: msg.content,
            })),
          conversationId, // Include conversation ID for agent context
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Check if response is streaming (SSE)
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('text/event-stream')) {
        // Handle SSE streaming
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        
        if (!reader) {
          throw new Error('No reader available for stream');
        }

        let buffer = '';
        let finalMessage = '';
        let authStatus: any = undefined;
        let authMessage: string | undefined = undefined;
        
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;
          
          // Decode the chunk and add to buffer
          buffer += decoder.decode(value, { stream: true });
          
          // Process complete SSE messages (separated by \n\n)
          const messages = buffer.split('\n\n');
          buffer = messages.pop() || ''; // Keep incomplete message in buffer
          
          for (const message of messages) {
            if (!message.trim() || !message.startsWith('data: ')) continue;
            
            try {
              const data = JSON.parse(message.slice(6)); // Remove 'data: ' prefix
              
              console.log('[ChatWindow] SSE event:', data);
              
              if (data.type === 'progress') {
                // Update the single status indicator instead of adding chat messages
                setStatusMessage(data.content);
                
                // Auto-clear after 5 seconds of no updates
                setTimeout(() => {
                  setStatusMessage(prev => prev === data.content ? '' : prev);
                }, 5000);
                
              } else if (data.type === 'message') {
                // Final message from agent
                finalMessage = data.content;
                authStatus = data.authorizationStatus;
                authMessage = data.authorizationMessage;
                
              } else if (data.type === 'error') {
                // Error message
                finalMessage = data.content;
                
              } else if (data.type === 'done') {
                // Stream completed
                console.log('[ChatWindow] Stream completed');
              }
              
            } catch (parseError) {
              console.error('[ChatWindow] Error parsing SSE message:', parseError, message);
            }
          }
        }
        
        // Clear the status message when stream is complete
        setStatusMessage('');
        
        // Handle authorization status if present
        if (authStatus) {
          switch (authStatus) {
            case 'requested':
              setMessages(currentMessages => {
                const hasPendingAuth = currentMessages.some(msg => 
                  msg.isEphemeral && msg.ephemeralType === 'authorization-pending'
                );
                
                if (!hasPendingAuth) {
                  const requestMessage: LangChainMessage = {
                    id: `ephemeral-request-${Date.now()}`,
                    role: 'system',
                    content: `🔐 Authorization requested: ${authMessage || 'Please check your device for approval'}`,
                    isEphemeral: true,
                    ephemeralType: 'authorization-request',
                  };
                  
                  setTimeout(() => {
                    addEphemeralMessage('authorization-pending', 
                      `⏳ Waiting for authorization approval...`);
                    startAuthorizationPolling();
                  }, 1000);
                  
                  return [...currentMessages, requestMessage];
                } else {
                  startAuthorizationPolling();
                  return currentMessages;
                }
              });
              break;
            case 'pending':
              setMessages(currentMessages => {
                const hasExistingPending = currentMessages.some(msg => 
                  msg.isEphemeral && msg.ephemeralType === 'authorization-pending'
                );
                
                if (!hasExistingPending) {
                  addEphemeralMessage('authorization-pending', 
                    `⏳ Waiting for authorization approval...`);
                }
                startAuthorizationPolling();
                return currentMessages;
              });
              break;
            case 'approved':
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
              removePendingAuthMessages();
              addEphemeralMessage('authorization-approved', 
                `✅ Authorization approved! Processing your request...`);
              break;
            case 'denied':
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
              removePendingAuthMessages();
              addEphemeralMessage('authorization-denied', 
                `❌ Authorization was denied.`);
              break;
          }
        }
        
        // Add final assistant message
        if (finalMessage) {
          const assistantMessage: LangChainMessage = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: finalMessage,
          };
          
          setMessages(prev => [...prev, assistantMessage]);
        }
        
      } else {
        // Fallback to non-streaming JSON response (backward compatibility)
        const data = await response.json();
      
        // Handle authorization status if present
        if (data.authorizationStatus) {
          switch (data.authorizationStatus) {
            case 'requested':
              // Only add request message if we haven't already shown pending auth
              setMessages(currentMessages => {
                const hasPendingAuth = currentMessages.some(msg => 
                  msg.isEphemeral && msg.ephemeralType === 'authorization-pending'
                );
                
                if (!hasPendingAuth) {
                  const requestMessage: LangChainMessage = {
                    id: `ephemeral-request-${Date.now()}`,
                    role: 'system',
                    content: `🔐 Authorization requested: ${data.authorizationMessage || 'Please check your device for approval'}`,
                    isEphemeral: true,
                    ephemeralType: 'authorization-request',
                  };
                  
                  // Start polling for status updates after a delay
                  setTimeout(() => {
                    addEphemeralMessage('authorization-pending', 
                      `⏳ Waiting for authorization approval...`);
                    startAuthorizationPolling();
                  }, 1000);
                  
                  return [...currentMessages, requestMessage];
                } else {
                  // Just start polling since we already have pending message
                  startAuthorizationPolling();
                  return currentMessages;
                }
              });
              break;
            case 'pending':
              // Only add pending message if we don't already have one
              setMessages(currentMessages => {
                const hasExistingPending = currentMessages.some(msg => 
                  msg.isEphemeral && msg.ephemeralType === 'authorization-pending'
                );
                
                if (!hasExistingPending) {
                  addEphemeralMessage('authorization-pending', 
                    `⏳ Waiting for authorization approval...`);
                }
                startAuthorizationPolling();
                return currentMessages;
              });
              break;
            case 'approved':
              // Stop any polling
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
              // Remove any pending messages
              removePendingAuthMessages();
              addEphemeralMessage('authorization-approved', 
                `✅ Authorization approved! Processing your request...`);
              break;
            case 'denied':
              // Stop any polling
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
              // Remove any pending messages
              removePendingAuthMessages();
              addEphemeralMessage('authorization-denied', 
                `❌ Authorization was denied.`);
              break;
          }
        }
        
        // Add the response as an assistant message
        const assistantMessage: LangChainMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.message || 'No response received',
        };
        
        setMessages(prev => [...prev, assistantMessage]);
        
        // Scroll to bottom after adding assistant response
        setTimeout(() => {
          if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
          }
        }, 150);
        
        // Clear completed authorization messages after successful response
        // Give a short delay to let the user see the approved message before clearing
        setTimeout(() => {
          removeCompletedAuthMessages();
        }, 3000);
      }

    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to get response');
      
      // Clear status message on error
      setStatusMessage('');
      
      // Add error message
      const errorMessage: LangChainMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      // Ensure status is cleared when loading stops
      setStatusMessage('');
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInput(e.target.value);
  }

  // Function to get styling for ephemeral messages
  const getEphemeralMessageStyle = (ephemeralType: NonNullable<LangChainMessage['ephemeralType']>) => {
    switch (ephemeralType) {
      case 'authorization-request':
        return 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100';
      case 'authorization-pending':
        return 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800 text-yellow-900 dark:text-yellow-100';
      case 'authorization-approved':
        return 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-900 dark:text-green-100';
      case 'authorization-denied':
        return 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-900 dark:text-red-100';
      default:
        return 'bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100';
    }
  };

  const getEphemeralIcon = (ephemeralType: NonNullable<LangChainMessage['ephemeralType']>) => {
    switch (ephemeralType) {
      case 'authorization-request':
        return '🔐';
      case 'authorization-pending':
        return '⏳';
      case 'authorization-approved':
        return '✅';
      case 'authorization-denied':
        return '❌';
      default:
        return 'ℹ️';
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* New Chat Button */}
      <div className="flex justify-end p-4 pb-2 border-b border-gray-200 dark:border-gray-700">
        <Button
          onClick={startNewChat}
          variant="outline"
          size="sm"
          className="flex items-center gap-2 text-sm"
          disabled={isLoading}
        >
          <MessageSquarePlus className="h-4 w-4" />
          New Chat
        </Button>
      </div>
      
      <div className="flex-1 overflow-auto p-4" id="chat-container" ref={chatContainerRef}>
        {messages.length === 0 ? (
          <div>{props.emptyStateComponent}</div>
        ) : (
          <div className="flex flex-col max-w-[768px] mx-auto pb-12 w-full">
            {messages.map((m) => {
              // Handle ephemeral messages differently
              if (m.isEphemeral && m.ephemeralType) {
                return (
                  <div key={m.id} className="mb-4">
                    <div className={cn(
                      'rounded-lg px-4 py-3 border text-sm max-w-[90%] mx-auto',
                      'transition-all duration-300 ease-in-out transform',
                      'animate-in slide-in-from-top-2 fade-in duration-300',
                      getEphemeralMessageStyle(m.ephemeralType)
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{getEphemeralIcon(m.ephemeralType)}</span>
                          <span className="font-medium">{m.content}</span>
                          {m.ephemeralType === 'authorization-pending' && (
                            <div className="ml-2">
                              <LoaderCircle className="animate-spin h-4 w-4" />
                            </div>
                          )}
                        </div>
                        {m.ephemeralType !== 'authorization-pending' && (
                          <button
                            onClick={() => removeEphemeralMessage(m.id)}
                            className="ml-3 text-xs opacity-60 hover:opacity-100 transition-opacity"
                            aria-label="Dismiss"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              // Handle regular messages
              return (
                <div
                  key={m.id}
                  className={cn(
                    'rounded-[24px] max-w-[80%] mb-8 flex',
                    m.role === 'user' ? 'bg-secondary text-secondary-foreground px-4 py-2' : null,
                    m.role === 'user' ? 'ml-auto' : 'mr-auto',
                  )}
                >
                  {m.role !== 'user' && (
                    <div className="mr-4 mt-1 border bg-secondary -mt-2 rounded-full w-10 h-10 flex-shrink-0 flex items-center justify-center">
                      {props.emoji}
                    </div>
                  )}
                  <div className="prose dark:prose-invert">
                    {m.content}
                  </div>
                </div>
              );
            })}
            {/* Invisible element for auto-scrolling */}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      
      <div className="sticky bottom-0 bg-background">
        {/* Status Indicator - Single location for all progress updates */}
        {statusMessage && (
          <div className="max-w-[768px] mx-auto px-4 pb-2">
            <div className={cn(
              'rounded-lg px-4 py-3 border text-sm',
              'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
              'text-blue-900 dark:text-blue-100',
              'transition-all duration-300 ease-in-out',
              'animate-in slide-in-from-bottom-2 fade-in'
            )}>
              <div className="flex items-center gap-2">
                <LoaderCircle className="animate-spin h-4 w-4 flex-shrink-0" />
                <span className="font-medium">{statusMessage}</span>
              </div>
            </div>
          </div>
        )}
        
        <ChatInput
          value={input}
          onChange={handleInputChange}
          onSubmit={sendMessage}
          loading={isLoading}
          placeholder={props.placeholder ?? 'What can I help you with?'}
        />
      </div>
    </div>
  );
}
