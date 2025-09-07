import { buildOpenFgaClient } from '@auth0/ai';

// Check if FGA is properly configured with all required fields
const isFgaConfigured = !!(
  process.env.FGA_CLIENT_ID && 
  process.env.FGA_STORE_ID && 
  process.env.FGA_CLIENT_SECRET &&
  process.env.FGA_API_URL
);

// Only create the client if properly configured
let fgaClient: any = null;
if (isFgaConfigured) {
  try {
    fgaClient = buildOpenFgaClient();
  } catch (error) {
    console.warn('Failed to initialize FGA client:', error);
    fgaClient = null;
  }
}

export { fgaClient };

export const addRelation = async (userEmail: string, documentId: string, relation = 'owner') => {
  if (!fgaClient) {
    console.warn('FGA client not configured, skipping addRelation');
    return;
  }
  return fgaClient.write({
    writes: [{ user: `user:${userEmail}`, relation, object: `doc:${documentId}` }],
  });
};

export const deleteRelation = async (userEmail: string, documentId: string, relation = 'owner') => {
  if (!fgaClient) {
    console.warn('FGA client not configured, skipping deleteRelation');
    return;
  }
  return fgaClient.write({
    deletes: [{ user: `user:${userEmail}`, relation, object: `doc:${documentId}` }],
  });
};
