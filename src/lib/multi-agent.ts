// Backward compatibility export for existing API routes
// This file maintains the existing API while using the new multi-agent system

import { createSupervisorAgent } from './agents/supervisor';

// Export the createAgent function for backward compatibility
export const createAgent = createSupervisorAgent;

// Export the supervisor graph as the main graph for existing uses
export { supervisorGraph as graph } from './agents/supervisor';

// Also export individual agents for direct access if needed
export { createCatalogCartAgent } from './agents/catalog-cart-agent';
export { createPaymentCheckoutAgent } from './agents/payment-checkout-agent';
export { createSupervisorAgent } from './agents/supervisor';