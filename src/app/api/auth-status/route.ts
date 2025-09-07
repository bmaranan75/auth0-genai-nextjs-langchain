import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth0';
import { getAuthorizationState } from '@/lib/auth0-ai-langchain';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser();
    const authState = getAuthorizationState();
    
    const response: any = {
      authenticated: !!user,
      user: user ? {
        sub: user.sub,
        email: user.email,
        name: user.name,
        picture: user.picture
      } : null,
      timestamp: new Date().toISOString()
    };

    // Include authorization status if there's an active authorization
    if (authState.status !== 'idle') {
      response.authorizationStatus = authState.status;
      if (authState.message) {
        response.authorizationMessage = authState.message;
      }
    }
    
    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[auth-status] Error getting user:', error);
    return NextResponse.json({
      authenticated: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
