export const INCIDENT_NOTE_MAX_LENGTH = 4000;

export function incidentNoteRequestId(value: unknown): string | undefined {
  // Older API clients may omit a key; the note composer always supplies one.
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('Geçerli bir not istek kimliği gerekiyor.');
  }
  return value.toLowerCase();
}

export function incidentNote(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Operasyon notu boş olamaz.');
  const note = value.trim();
  if (note.length > INCIDENT_NOTE_MAX_LENGTH) throw new Error(`Operasyon notu en fazla ${INCIDENT_NOTE_MAX_LENGTH} karakter olabilir.`);
  return note;
}

export function incidentAssigneeId(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new Error('Geçerli bir sorumlu seçin.');
  return value.trim();
}
