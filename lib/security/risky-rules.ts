import { policyActionLabel, policyNameLabel, type SecurityPolicy } from './policies';
import { userSearch } from '@/lib/users/workspace';

export type RiskSeverity = 'critical' | 'high' | 'low';
export type RiskCheckId = 'unrestricted' | 'external' | 'zero-hits';
export type RiskCheckState = 'match' | 'no-match' | 'unknown';
export const riskSeverityLabels: Record<RiskSeverity, string> = { critical: 'Kritik', high: 'Yüksek', low: 'Düşük' };
export const riskCheckDefinitions: Record<RiskCheckId, { title: string; severity: RiskSeverity; evidence: string; reason: string; limitation: string; nextStep: string }> = {
  unrestricted: {
    title: 'Geniş kapsamlı izin', severity: 'critical',
    evidence: 'Kaynak ve hedef: all · Hizmet: ALL · Hariç tutma kapalı',
    reason: 'İzin veren tanımda kaynak ve hedef adresleri “all”, hizmet ise “ALL” içeriyor ve üç hariç tutma ayarı da kapalı.',
    limitation: 'Bulgu tanımın genişliğini gösterir. Arabirim, zamanlama, kural sırası ve diğer kontroller fiili erişimi etkiler.',
    nextStep: 'İş ihtiyacına göre kaynak, hedef ve gerekli hizmetlerin daraltılıp daraltılamayacağını inceleyin.',
  },
  external: {
    title: 'Dıştan içe izin adayı', severity: 'high',
    evidence: 'Arabirim adına göre dış ağ → iç ağ adayı',
    reason: 'İzin veren tanımdaki kaynak arabirim adı WAN/Internet/External, hedef adı LAN/Internal/DMZ örüntüsüne uyuyor.',
    limitation: 'Arabirim adından çıkarım yapılır; ağ yönü ve İnternet erişilebilirliği doğrulanmış değildir.',
    nextStep: 'Arabirimlerin gerçek ağ rollerini, hedef nesneleri ve izin verilen hizmet ihtiyacını doğrulayın.',
  },
  'zero-hits': {
    title: 'Sıfır eşleşme sayacı', severity: 'low',
    evidence: 'Bildirilen eşleşme: 0 · Dönem bilinmiyor',
    reason: 'Kaynağın bildirdiği eşleşme sayacı sıfır.',
    limitation: 'Sayaç dönemi ve sıfırlanma zamanı bilinmiyor. Bu değer kuralın hiç kullanılmadığını kanıtlamaz.',
    nextStep: 'Kuralın iş ihtiyacını ve uygun bir dönemdeki trafik kayıtlarını gözden geçirin.',
  },
};
export interface RiskCheck { id: RiskCheckId; state: RiskCheckState }
export interface RiskReview { policy: SecurityPolicy; checks: RiskCheck[]; reasons: RiskCheckId[]; severity: RiskSeverity | null; incomplete: boolean }
export const riskCheckIds: RiskCheckId[] = ['unrestricted', 'external', 'zero-hits'];
const complete = (names: string[] | null): names is string[] => names !== null && names.length > 0;
// Names indicate candidates only; they do not establish routing or object membership.
const externalName = /^(wan\d*|internet|external)(?:$|[._\s-])/i;
const internalName = /^(lan\d*|internal|dmz\d*)(?:$|[._\s-])/i;
function inspect(policy: SecurityPolicy, id: RiskCheckId): RiskCheckState {
  if (id === 'zero-hits') return policy.hitCount === null ? 'unknown' : policy.hitCount === '0' ? 'match' : 'no-match';
  if (policy.action === null || !['accept', 'deny'].includes(policy.action)) return 'unknown';
  if (policy.action === 'deny') return 'no-match';
  if (id === 'unrestricted') {
    const { sourceAddresses: source, destinationAddresses: destination, services } = policy;
    if (!complete(source) || !complete(destination) || !complete(services)) return 'unknown';
    if (!(source.includes('all') && destination.includes('all') && services.includes('ALL'))) return 'no-match';
    const negation = [policy.sourceNegated, policy.destinationNegated, policy.serviceNegated];
    if (negation.some(value => value === true)) return 'no-match';
    return negation.every(value => value === false) ? 'match' : 'unknown';
  }
  if (!complete(policy.sourceInterfaces) || !complete(policy.destinationInterfaces)) return 'unknown';
  return policy.sourceInterfaces.some(name => externalName.test(name)) && policy.destinationInterfaces.some(name => internalName.test(name)) ? 'match' : 'no-match';
}
export function reviewRiskyPolicies(rows: SecurityPolicy[]): RiskReview[] {
  return rows.map(policy => {
    const checks = riskCheckIds.map(id => ({ id, state: inspect(policy, id) }));
    const reasons = checks.filter(check => check.state === 'match').map(check => check.id);
    return { policy, checks, reasons, severity: reasons.length ? riskCheckDefinitions[reasons[0]].severity : null, incomplete: policy.enabled === null || checks.some(check => check.state === 'unknown') };
  });
}
export function riskReviewSummary(reviews: RiskReview[]) {
  return { policies: reviews.length, flagged: reviews.filter(row => row.reasons.length).length, critical: reviews.filter(row => row.severity === 'critical').length, high: reviews.filter(row => row.severity === 'high').length, low: reviews.filter(row => row.severity === 'low').length, findings: reviews.reduce((sum, row) => sum + row.reasons.length, 0), incomplete: reviews.filter(row => row.incomplete).length };
}
export const riskCheckStateLabel = (state: RiskCheckState) => state === 'match' ? 'Bulgu var' : state === 'unknown' ? 'Bilgi yetersiz' : 'Koşul eşleşmedi';
export function filterRiskReviews(reviews: RiskReview[], filters: { search: string; severity: string; reason: string; status: string }): RiskReview[] {
  const search = userSearch(filters.search.trim());
  return reviews.filter(row => row.severity !== null && (!filters.severity || row.severity === filters.severity) && (!filters.reason || row.reasons.includes(filters.reason as RiskCheckId)) && (!filters.status || (row.policy.enabled === null ? 'unknown' : row.policy.enabled ? 'enabled' : 'disabled') === filters.status) && (!search || userSearch([
    row.policy.policyId, row.policy.name, row.policy.comment, policyActionLabel(row.policy.action), riskSeverityLabels[row.severity],
    ...row.reasons.flatMap(id => [riskCheckDefinitions[id].title, riskCheckDefinitions[id].reason]),
    ...(row.policy.sourceInterfaces || []), ...(row.policy.destinationInterfaces || []),
    ...(row.policy.sourceAddresses || []).map(name => policyNameLabel(name, 'addresses')),
    ...(row.policy.destinationAddresses || []).map(name => policyNameLabel(name, 'addresses')),
    ...(row.policy.services || []).map(name => policyNameLabel(name, 'services')),
  ].join(' ')).includes(search))).sort((a, b) => {
    const rank = { critical: 0, high: 1, low: 2 };
    return rank[a.severity!] - rank[b.severity!] || a.policy.position - b.policy.position;
  });
}
