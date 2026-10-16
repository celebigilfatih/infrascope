import { NextResponse, type NextRequest } from 'next/server';
import { getRequestActor } from './request-actor';
import { canAccessSync, type Action, type Resource } from './permission-policy';

export function forbiddenApiPermission(resource: Resource, action: Action): NextResponse {
  return NextResponse.json({ success: false, error: 'Bu işlem için yetkiniz yok.', required: { resource, action } }, { status: 403 });
}

/** Use the current ACTIVE database user, never role headers or stale JWT roles. */
export async function authorizeApiRequest(request: NextRequest, resource: Resource, action: Action) {
  try {
    const auth = await getRequestActor(request);
    if (!auth) return { allowed: false as const,
      response: NextResponse.json({ success: false, error: 'Oturum açmanız gerekiyor.' }, { status: 401 }) };
    if (!canAccessSync(auth.role, resource, action)) {
      return { allowed: false as const, response: forbiddenApiPermission(resource, action) };
    }
    return { allowed: true as const, auth };
  } catch (error) {
    console.error('[API Permission] Identity lookup failed', error instanceof Error ? error.name : 'UnknownError');
    return { allowed: false as const,
      response: NextResponse.json({ success: false, error: 'Yetki kontrolü şu anda yapılamıyor.' }, { status: 503 }) };
  }
}
