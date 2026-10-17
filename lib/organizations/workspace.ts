export interface OrganizationDraft { name: string; code: string; description: string }
export interface OrganizationRoom { id: string; name: string; racks: number | null }
export interface OrganizationFloor { id: string; name: string; rooms: OrganizationRoom[] | null }
export interface OrganizationBuilding { id: string; name: string; address: string; city: string; country: string; floors: OrganizationFloor[] | null }
export interface OrganizationRow extends OrganizationDraft { id: string; createdAt: string | null; updatedAt: string | null; buildings: OrganizationBuilding[] | null; related: Record<'vlans' | 'subnets' | 'vmwareClusters' | 'vmwareDatastores', number | null> }
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value: unknown) => typeof value === 'string' ? value : '';
const date = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
function identity(value: unknown): Record<string, unknown> & { id: string; name: string } {
  if (!record(value) || typeof value.id !== 'string' || !value.id || typeof value.name !== 'string') throw new Error('Organizasyon bilgileri beklenen biçimde alınamadı.');
  return value as Record<string, unknown> & { id: string; name: string };
}
export function parseOrganizations(value: unknown): OrganizationRow[] {
  if (!record(value) || value.success !== true || !Array.isArray(value.data)) throw new Error('Organizasyon listesi beklenen biçimde alınamadı.');
  return value.data.map(raw => {
    const row = identity(raw), related = record(row._count) ? row._count : {};
    return { id: row.id, name: row.name, code: text(row.code), description: text(row.description), createdAt: date(row.createdAt), updatedAt: date(row.updatedAt),
      related: { vlans: count(related.vlans), subnets: count(related.subnets), vmwareClusters: count(related.vmwareClusters), vmwareDatastores: count(related.vmwareDatastores) },
      buildings: Array.isArray(row.buildings) ? row.buildings.map(rawBuilding => {
        const building = identity(rawBuilding);
        return { id: building.id, name: building.name, address: text(building.address), city: text(building.city), country: text(building.country), floors: Array.isArray(building.floors) ? building.floors.map(rawFloor => {
          const floor = identity(rawFloor);
          return { id: floor.id, name: floor.name, rooms: Array.isArray(floor.rooms) ? floor.rooms.map(rawRoom => { const room = identity(rawRoom); return { id: room.id, name: room.name, racks: Array.isArray(room.racks) ? room.racks.length : null }; }) : null };
        }) : null };
      }) : null };
  });
}
export function locationTotals(row: Pick<OrganizationRow, 'buildings'>) {
  const buildings = row.buildings;
  const floors = buildings && buildings.every(building => building.floors !== null) ? buildings.flatMap(building => building.floors!) : null;
  const rooms = floors && floors.every(floor => floor.rooms !== null) ? floors.flatMap(floor => floor.rooms!) : null;
  return { buildings: buildings?.length ?? null, floors: floors?.length ?? null, rooms: rooms?.length ?? null, racks: rooms && rooms.every(room => room.racks !== null) ? rooms.reduce((sum, room) => sum + room.racks!, 0) : null };
}
export function organizationPayload(value: unknown, partial = false): Partial<OrganizationDraft> {
  if (!record(value)) throw new Error('Ad, kod ve açıklama bilgilerini kontrol edin.');
  const data: Partial<OrganizationDraft> = {};
  for (const [field, label, max] of [['name', 'Organizasyon adı', 160], ['code', 'Organizasyon kodu', 64], ['description', 'Açıklama', 2000]] as const) {
    if (partial && !Object.prototype.hasOwnProperty.call(value, field)) continue;
    if (field === 'description' && (value[field] === undefined || value[field] === null)) { data.description = ''; continue; }
    if (typeof value[field] !== 'string' || value[field].trim().length > max || (field !== 'description' && !value[field].trim())) throw new Error(`${label} ${field === 'description' ? 'en fazla 2000' : `1–${max}`} karakter olmalıdır.`);
    data[field] = value[field].trim();
  }
  if (!Object.keys(data).length) throw new Error('Güncellenecek ad, kod veya açıklama bilgisi gönderin.');
  return data;
}
export function organizationChanges(row: OrganizationDraft, draft: OrganizationDraft) {
  return (['name', 'code', 'description'] as const).filter(field => draft[field].trim() !== row[field]).map(field => ({ field, label: { name: 'Organizasyon adı', code: 'Organizasyon kodu', description: 'Açıklama' }[field], before: row[field] || 'Belirtilmemiş', after: draft[field].trim() || 'Belirtilmemiş' }));
}
export const organizationErrors: Record<string, string> = { INVALID: 'Ad, kod ve açıklama bilgilerini kontrol edin.', DUPLICATE: 'Bu ad veya kod başka bir organizasyonda kullanılıyor.', NOT_FOUND: 'Organizasyon artık bulunamıyor. Listeyi yenileyin.', RELATED: 'Bağlı kayıtlar nedeniyle organizasyon silinemedi. Konum ve kaynak ilişkilerini kontrol edin.' };
export const uncertainOrganization = 'İşlemin sonucu doğrulanamadı. Tekrar denemeden önce pencereyi kapatıp listeyi yenileyin.';
export function verifyOrganizationWrite(value: Record<string, unknown>, expected: { id?: string; fields?: Partial<OrganizationDraft> }) {
  if (!record(value.data) || typeof value.data.id !== 'string' || !value.data.id || (expected.id && value.data.id !== expected.id) || Object.entries(expected.fields || {}).some(([field, entry]) => value.data && (value.data as Record<string, unknown>)[field] !== entry)) throw new Error(uncertainOrganization);
}
export async function requestOrganizations(url: string, options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; signal?: AbortSignal } = {}): Promise<Record<string, unknown>> {
  const controller = new AbortController(), abort = () => controller.abort(), mutation = options.method && options.method !== 'GET';
  options.signal?.addEventListener('abort', abort, { once: true }); if (options.signal?.aborted) abort();
  const timer = setTimeout(abort, 15000), fallback = mutation ? 'İşlem tamamlanamadı. Bilgileri kontrol edin.' : 'Organizasyon listesi alınamadı.';
  try {
    const response = await fetch(url, { method: options.method || 'GET', cache: 'no-store', credentials: 'same-origin', signal: controller.signal, headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
    if (response.status === 401) throw new Error('Oturumunuz sona ermiş olabilir. Yeniden giriş yapın.');
    if (response.status === 403) throw new Error('Bu işlem için yetkiniz bulunmuyor.');
    let value: unknown; try { value = await response.json(); } catch { throw new Error(mutation ? uncertainOrganization : fallback); }
    if (controller.signal.aborted) throw new Error(mutation ? uncertainOrganization : fallback);
    if (!response.ok || !record(value) || value.success !== true) {
      if (response.status === 401) throw new Error('Oturumunuz sona ermiş olabilir. Yeniden giriş yapın.');
      if (response.status === 403) throw new Error('Bu işlem için yetkiniz bulunmuyor.');
      if (mutation && response.status >= 500) throw new Error(uncertainOrganization);
      throw new Error(record(value) && typeof value.code === 'string' && organizationErrors[value.code] ? organizationErrors[value.code] : fallback);
    }
    return value;
  } catch (error) {
    if (error instanceof Error && [fallback, uncertainOrganization, ...Object.values(organizationErrors), 'Oturumunuz sona ermiş olabilir. Yeniden giriş yapın.', 'Bu işlem için yetkiniz bulunmuyor.'].includes(error.message)) throw error;
    throw new Error(mutation ? uncertainOrganization : fallback);
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
}
