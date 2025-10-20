# Catalog vs Deals Routing Fix

## Problem

When users asked about deals on specific products (e.g., "What deals are available on apples?" or "Show me apples on sale"), the system was routing to the **catalog agent** instead of the **deals agent**. This resulted in:

1. ❌ Catalog agent showing regular prices (no deal information)
2. ❌ Catalog agent asking follow-up questions about adding/applying to purchase
3. ❌ User not getting the deal information they requested

## Root Cause

### Issue 1: Ambiguous Supervisor Routing Prompt

The supervisor's routing prompt had unclear guidance:

```typescript
// ❌ BEFORE: Ambiguous rule
"For new product inquiries → catalog"
```

The LLM was interpreting **"What deals are on apples?"** as a "product inquiry" and routing to catalog, rather than recognizing it as a **deals query**.

### Issue 2: Catalog Agent Handling Deal Queries

When the catalog agent received deal-related queries, it was:
- Showing regular product prices (correct)
- But then asking about adding to cart or applying deals (incorrect)
- Not clearly redirecting to the deals specialist

## Solution

### 1. Enhanced Supervisor Routing Logic

Updated the supervisor prompt to explicitly prioritize deal-related keywords:

```typescript
Available agents:
• **catalog** - Product discovery, search, browsing, recommendations (NO deals/promotions)
• **cart_and_checkout** - Cart operations, checkout, order completion  
• **payment** - Payment method management only
• **deals** - Deal discovery, promotions, discounts, sales, special offers

Context awareness rules:
- For product search/browsing WITHOUT deals/promotions → catalog
- For ANY mention of deals, discounts, promotions, sales, offers → deals
- For cart actions (add/remove/view) → deals first (to check offers), then cart_and_checkout
- For checkout/purchase → cart_and_checkout
- For payment setup → payment

IMPORTANT: 
- If user mentions "deals", "promotions", "discounts", "sales", "offers", "on sale" → ALWAYS route to deals agent
- If user just wants product info (price, description, availability) without deals → route to catalog
- Catalog agent does NOT handle deal-related queries
```

**Key Changes:**
- ✅ Explicit keyword matching: deals, discounts, promotions, sales, offers, "on sale"
- ✅ Clear separation: catalog = regular prices, deals = promotional prices
- ✅ Added emphasis that catalog does NOT handle deals

### 2. Updated Catalog Agent Prompt

Enhanced the catalog agent to be clearer about its boundaries:

```typescript
## What You DO NOT Handle:
- **Deals, Discounts, Promotions, Sales**: These are handled by the Deals specialist
- **Cart Operations**: Adding/removing items is handled by Cart & Checkout specialist
- **Purchase/Checkout**: Handled by Cart & Checkout specialist
- **Payment Methods**: Handled by Payment specialist

## Handoff Protocol:

**If users ask about deals, discounts, promotions, or sales:**
Respond with: "I can see the regular prices for those items. Would you like me to connect you with our Deals specialist to check for any current promotions or discounts?"
```

**Key Changes:**
- ✅ Explicit list of what catalog does NOT handle
- ✅ Clear handoff message for deal queries
- ✅ Emphasis on "regular prices only" (not promotional prices)
- ✅ Removed any language that might imply catalog handles deals

## Examples

### Before Fix

**User:** "What deals are available on apples?"

```
Supervisor → Catalog Agent (❌ Wrong routing)
Catalog: "Here are apples available:
  - Organic Apples: $3.99/lb
  - Red Delicious: $2.49/lb
  Would you like to add these to your cart?"
```

**Problem:** User asked for deals but got regular prices + cart suggestion

### After Fix

**User:** "What deals are available on apples?"

```
Supervisor → Deals Agent (✅ Correct routing)
Deals: "Let me check for current deals on apples...
  🏷️ Special: Organic Apples - Buy 1 Get 1 Free!
  🏷️ Red Delicious - 20% off this week
  Would you like to apply any of these deals?"
```

**Success:** User gets deal information as requested

### Edge Case: Product Info Without Deals

**User:** "What types of apples do you have?"

```
Supervisor → Catalog Agent (✅ Correct routing)
Catalog: "Here are the apple varieties available:
  - Organic Apples: $3.99/lb
  - Red Delicious: $2.49/lb
  - Granny Smith: $2.99/lb
  Would you like to know about any current promotions on these?"
```

**Success:** Catalog shows products, offers to connect to deals if needed

## Testing Scenarios

### Deal-Related Queries (Should route to Deals Agent)
✅ "What deals are available on apples?"
✅ "Show me apples on sale"
✅ "Are there any discounts on bananas?"
✅ "What promotions do you have?"
✅ "Find me the best deals on produce"
✅ "What's on sale this week?"

### Product Queries (Should route to Catalog Agent)
✅ "What types of apples do you have?"
✅ "Show me produce items"
✅ "Do you have organic milk?"
✅ "What's the price of eggs?"
✅ "Browse dairy products"
✅ "Find me some bread"

### Ambiguous Queries
✅ "Show me apples" → Catalog (product browsing)
✅ "I need apples for cheap" → Deals (implies looking for savings)
✅ "What's available in produce?" → Catalog (general browsing)

## Files Modified

- ✅ `src/lib/agents/supervisor.ts` - Enhanced routing logic with explicit deal keywords
- ✅ `src/lib/agents/catalog-agent.ts` - Clarified boundaries and handoff protocol

## Impact

### User Experience
- ✅ Users asking for deals now get deal information immediately
- ✅ Catalog agent stays focused on product discovery
- ✅ Clear handoff messages when switching between agents
- ✅ No more confusing prompts about adding items when just browsing deals

### Agent Specialization
- ✅ Better separation of concerns
- ✅ Each agent handles its specific domain
- ✅ Clearer routing decisions
- ✅ Reduced ambiguity in agent responsibilities

## Monitoring

To verify the fix is working, check the Dev Metadata panel for:

1. **Deal-related queries** should show:
   ```
   Supervisor Decision → Target: deals
   ```

2. **Product browsing queries** should show:
   ```
   Supervisor Decision → Target: catalog
   ```

3. No longer seeing catalog agent responses for deal queries

## Future Improvements

Consider adding:
- More specific keyword detection in planner
- User intent classification before routing
- Feedback mechanism to correct misrouted queries
- Analytics on routing accuracy
