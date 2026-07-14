const DEFAULT_NMS_URL = 'http://nms:8500';

export class NmsInternalError extends Error {
  constructor(
    message: string,
    public readonly status = 502
  ) {
    super(message);
    this.name = 'NmsInternalError';
  }
}

export async function nmsInternalFetch(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const token = process.env.NMS_INTERNAL_TOKEN?.trim();
  if (!token) {
    throw new NmsInternalError('Internal NMS authentication is not configured', 503);
  }
  const baseUrl = (process.env.NMS_BACKEND_URL || process.env.NMS_INTERNAL_URL || DEFAULT_NMS_URL)
    .replace(/\/$/, '');
  const { timeoutMs = 15_000, ...requestInit } = init;
  const headers = new Headers(requestInit.headers);
  headers.set('X-InfraScope-Internal-Token', token);
  const response = await fetch(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
    ...requestInit,
    headers,
    signal: requestInit.signal || AbortSignal.timeout(timeoutMs),
  });
  return response;
}

export async function parseNmsResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const safeMessage = response.status === 401
      ? 'Internal NMS authentication failed'
      : response.status === 404
        ? 'NMS device is not configured'
        : 'NMS operation is currently unavailable';
    throw new NmsInternalError(safeMessage, response.status === 404 ? 404 : 502);
  }
  return response.json() as Promise<T>;
}
