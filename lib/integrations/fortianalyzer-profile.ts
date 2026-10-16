import { SourceQueryError } from './source-query-error';

export type FortiAnalyzerProfileInput = {
  host: string; adom?: string; authMode?: 'session' | 'api-key';
  username?: string; password?: string; apiKey?: string; accessToken?: string; pollingInterval?: number;
};
export type FortiAnalyzerProfile = FortiAnalyzerProfileInput & { adom: string; authMode: 'session' | 'api-key' };
export const FA_PROFILE_VERSION = 1;

export function normalizeFortiAnalyzerAdom(value: unknown): string {
  const adom = value === undefined ? 'root' : typeof value === 'string' ? value.trim() : '';
  if (!adom || adom.length > 128 || adom === '.' || adom === '..' || /[/\\\x00-\x1f\x7f]/.test(adom)) {
    throw new SourceQueryError('SOURCE_INVALID_CONFIG', 'FortiAnalyzer ADOM is invalid');
  }
  return adom;
}

export function normalizeFortiAnalyzerProfile(input: FortiAnalyzerProfileInput): FortiAnalyzerProfile {
  const host = typeof input.host === 'string' ? input.host.trim().toLowerCase() : '';
  const apiKey = input.apiKey || input.accessToken;
  if (input.apiKey && input.accessToken && input.apiKey !== input.accessToken) {
    throw new SourceQueryError('SOURCE_INVALID_CONFIG', 'FortiAnalyzer API key aliases conflict');
  }
  const authMode = input.authMode ?? (apiKey ? 'api-key' : 'session');
  if (!host || !['session', 'api-key'].includes(authMode)) throw new SourceQueryError('SOURCE_INVALID_CONFIG', 'FortiAnalyzer connection profile is invalid');
  const adom = normalizeFortiAnalyzerAdom(input.adom);
  if (authMode === 'api-key') {
    if (typeof apiKey !== 'string' || !apiKey || /\s/.test(apiKey)) throw new SourceQueryError('SOURCE_INVALID_CONFIG', 'FortiAnalyzer API key is required and must not contain whitespace');
    return { host, adom, authMode, accessToken: apiKey, pollingInterval: input.pollingInterval };
  }
  if (typeof input.username !== 'string' || !input.username.trim() || typeof input.password !== 'string' || !input.password) throw new SourceQueryError('SOURCE_INVALID_CONFIG', 'FortiAnalyzer session credentials are incomplete');
  return { host, adom, authMode, username: input.username.trim(), password: input.password, pollingInterval: input.pollingInterval };
}

/** Resolve an edit without borrowing a secret from a different server/principal. */
export function mergeFortiAnalyzerProfile(input: FortiAnalyzerProfileInput, saved?: FortiAnalyzerProfileInput): FortiAnalyzerProfile {
  const authMode = input.authMode ?? (input.apiKey || input.accessToken ? 'api-key' : 'session');
  const priorMode = saved?.authMode ?? (saved?.apiKey || saved?.accessToken ? 'api-key' : 'session');
  const samePrincipal = saved?.host?.trim().toLowerCase() === input.host.trim().toLowerCase()
    && authMode === priorMode && (authMode === 'api-key' || saved?.username?.trim() === input.username?.trim());
  const edited = (value: string | undefined) => value && value !== '********' ? value : undefined;
  const enteredKey = edited(input.apiKey) || edited(input.accessToken);
  return normalizeFortiAnalyzerProfile({ ...input, authMode,
    adom: input.adom ?? (samePrincipal ? saved?.adom : undefined),
    pollingInterval: input.pollingInterval ?? saved?.pollingInterval,
    password: edited(input.password) ?? (samePrincipal ? saved?.password : undefined),
    apiKey: edited(input.apiKey) ?? (samePrincipal && !enteredKey ? saved?.apiKey : undefined),
    accessToken: edited(input.accessToken) ?? (samePrincipal && !enteredKey ? saved?.accessToken : undefined),
  });
}
