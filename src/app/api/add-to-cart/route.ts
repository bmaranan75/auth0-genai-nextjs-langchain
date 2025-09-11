import { NextRequest, NextResponse } from 'next/server';
import { cartCache, type CartItem, Cart } from '@/lib/cache/cart-cache';

async function findProduct(productCode?: string, productName?: string) {
  // First, try to find the product in the local catalog
  let product = null;
  
  // If product not found locally, call the catalog API
  if (!product) {
    try {
      const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
      
      if (productCode) {
        // Search by exact product code using POST
        const response = await fetch(`${baseUrl}/api/catalog`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ productCode }),
        });
        
        if (response.ok) {
          const data = await response.json();
          product = data.product;
        }
      } 
    } catch (error) {
      console.error('[findProduct] Error calling catalog API:', error);
      // Fall through to return null if API call fails
    }
  }
  
  return product;
}

export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const body = await request.json();
    const { productCode, productName, quantity = 1, userId } = body;

    // Validate required fields
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId is required' },
        { status: 400 }
      );
    }

    if (!productCode && !productName) {
      return NextResponse.json(
        { success: false, error: 'Either productCode or productName is required' },
        { status: 400 }
      );
    }

    // Find the product in the catalog
    const product = await findProduct(productCode, productName);
    
    if (!product) {
      return NextResponse.json(
        { success: false, error: 'Product not found in catalog' },
        { status: 404 }
      );
    }

    // Create cart item
    const cartItem: CartItem = {
      id: product.id,
      quantity: quantity,
      price: product.price,
      totalPrice: product.price * quantity,
    };

    // Add to cache
    const updatedCart = cartCache.addItemToCart(userId, cartItem);

    console.log('[add-to-cart API] Item added successfully to cache:', updatedCart);
    
    return NextResponse.json({
      success: true,
      message: `Added ${cartItem.quantity} x ${cartItem.id} to cart`,
      cartItem: cartItem,
    //   totalItems: updatedCart.totalItems,
    //   totalValue: updatedCart.totalValue,
      cart: updatedCart,
    });
    
  } catch (error) {
    console.error('[add-to-cart API] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      },
      { status: 500 }
    );
  }
}