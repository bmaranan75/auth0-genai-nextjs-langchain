import { Auth0AI } from "@auth0/ai-langchain";
import { getUser } from "./auth0";

// Manual CIBA implementation for direct tool calls
export async function performCIBAAuthorization(product: string, qty: number): Promise<string | null> {
  try {
    console.log("[manual-ciba] Starting CIBA authorization for:", product, qty);
    
    const user = await getUser();
    if (!user?.sub) {
      throw new Error("User not authenticated");
    }
    
    console.log("[manual-ciba] User ID:", user.sub);
    
    // Initialize Auth0AI
    const auth0AI = new Auth0AI();
    
    // Create a manual CIBA request
    const cibaResult = await auth0AI.requestAsyncUserConfirmation({
      userID: user.sub,
      bindingMessage: `Purchase approval: ${qty} ${product}`,
      scopes: ["openid", "checkout:buy"],
      audience: process.env["SHOP_API_AUDIENCE"]!,
      onAuthorizationRequest: "block", // Wait for user approval
    });
    
    console.log("[manual-ciba] CIBA result:", {
      hasAccessToken: !!cibaResult?.accessToken,
      tokenLength: cibaResult?.accessToken?.length || 0,
      scopes: cibaResult?.scopes
    });
    
    return cibaResult?.accessToken || null;
    
  } catch (error) {
    console.error("[manual-ciba] CIBA authorization failed:", error);
    return null;
  }
}
