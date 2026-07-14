import { NextResponse } from 'next/server';
import { getPermissionMatrix, togglePermission, seedPermissions } from '@/lib/auth/permissions';

export async function GET() {
  try {
    // Keep newly introduced permissions available in existing installations.
    await seedPermissions();

    const matrix = await getPermissionMatrix();
    return NextResponse.json({ success: true, data: matrix });
  } catch (error) {
    console.error('Error fetching permissions:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { permissionId, roleId, granted } = body;

    if (!permissionId || !roleId || typeof granted !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'permissionId, roleId, and granted (boolean) are required' },
        { status: 400 }
      );
    }

    await togglePermission(permissionId, roleId, granted);

    const matrix = await getPermissionMatrix();
    return NextResponse.json({ success: true, data: matrix });
  } catch (error) {
    console.error('Error toggling permission:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
