import { createHash } from 'crypto';

export type ScopedInventoryType = 'VMWARE_VCENTER' | 'ZABBIX';

/** Non-secret identity; keep normalization equivalent to the B16 SQL migration. */
export function inventorySourceScope(type: ScopedInventoryType, configId: string | undefined, endpoint: string): string {
  if (!configId?.trim() || /[\r\n]/.test(configId)) throw new Error('Saved inventory configuration ID is required');
  let target: string;
  if (type === 'VMWARE_VCENTER') {
    target = endpoint.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase().replace(/:443$/, '');
    const url = new URL(`https://${target}`);
    if (!target || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid inventory endpoint');
  } else {
    const raw = endpoint.trim();
    const url = new URL(raw);
    const match = /^(https?):\/\/([^/?#]+)(\/[^?#]*)?$/i.exec(raw);
    if (!match || url.username || url.password || url.search || url.hash) throw new Error('Invalid inventory endpoint');
    const protocol = match[1].toLowerCase();
    const authority = match[2].toLowerCase().replace(protocol === 'https' ? /:443$/ : /:80$/, '');
    const path = (match[3] || '').replace(/\/+$/, '').replace(/\/api_jsonrpc\.php$/, '').replace(/\/+$/, '');
    target = `${protocol}://${authority}${path}`;
  }
  return createHash('sha256').update([type, configId, target].join('\n')).digest('hex');
}
