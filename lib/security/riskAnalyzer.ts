/**
 * Firewall Policy Risk Analyzer
 * Analyzes firewall policies to identify risky configurations
 */

export interface FirewallPolicy {
  policyId: string | number;
  name?: string;
  action?: string;
  srcInterface?: string;
  dstInterface?: string;
  srcAddresses?: string[] | null;
  dstAddresses?: string[] | null;
  services?: string[] | null;
  hitCount?: string;
  lastHit?: string;
}

export interface DetectedRisk {
  id: string;
  title: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  affectedAssets: number;
  owner: string;
  createdAt: string;
  policyId?: string | number;
}

/**
 * Check if policy is any-to-any (unrestricted)
 */
function isAnyToAny(policy: FirewallPolicy): boolean {
  const srcAny = policy.srcAddresses?.some(addr => 
    addr?.toLowerCase() === 'all' || addr?.toLowerCase() === 'any'
  ) || false;
  
  const dstAny = policy.dstAddresses?.some(addr => 
    addr?.toLowerCase() === 'all' || addr?.toLowerCase() === 'any'
  ) || false;
  
  const serviceAny = policy.services?.some(svc => 
    svc?.toLowerCase() === 'all' || svc?.toLowerCase() === 'any'
  ) || false;
  
  return srcAny && dstAny && serviceAny && policy.action?.toLowerCase() === 'accept';
}

/**
 * Check if policy is unused (no hits)
 */
function isUnused(policy: FirewallPolicy): boolean {
  const hitCount = parseInt(policy.hitCount || '0', 10);
  return hitCount === 0;
}

/**
 * Check if policy allows external to internal traffic
 */
function isExternalExposure(policy: FirewallPolicy): boolean {
  if (policy.action?.toLowerCase() !== 'accept') return false;
  
  const fromExternal = policy.srcInterface?.toLowerCase().match(/wan|internet|external/);
  const toInternal = policy.dstInterface?.toLowerCase().match(/lan|internal|dmz/);
  
  return !!(fromExternal && toInternal);
}

/**
 * Analyze all policies for risks
 */
export function analyzePolicyRisks(policies: FirewallPolicy[]): DetectedRisk[] {
  const risks: DetectedRisk[] = [];
  const timestamp = new Date().toISOString();
  
  policies.forEach((policy, index) => {
    // Risk 1: Any-to-Any Rules
    if (isAnyToAny(policy)) {
      risks.push({
        id: `risk-any-to-any-${policy.policyId}-${index}`,
        title: `Permissive Policy: ${policy.name || `Policy #${policy.policyId}`}`,
        category: 'Firewall Configuration',
        severity: 'critical',
        description: 'Policy allows traffic from any source to any destination on any service.',
        affectedAssets: 0,
        owner: 'Network Team',
        createdAt: timestamp,
        policyId: policy.policyId
      });
    }
    
    // Risk 2: Unused Policies
    if (isUnused(policy)) {
      risks.push({
        id: `risk-unused-${policy.policyId}-${index}`,
        title: `Unused Policy: ${policy.name || `Policy #${policy.policyId}`}`,
        category: 'Policy Hygiene',
        severity: 'low',
        description: 'Policy has not been used. Consider reviewing and removing if no longer needed.',
        affectedAssets: 0,
        owner: 'Network Team',
        createdAt: timestamp,
        policyId: policy.policyId
      });
    }
    
    // Risk 3: External to Internal Exposure
    if (isExternalExposure(policy)) {
      risks.push({
        id: `risk-external-${policy.policyId}-${index}`,
        title: `External Exposure: ${policy.name || `Policy #${policy.policyId}`}`,
        category: 'Network Security',
        severity: 'high',
        description: 'Policy allows traffic from external/WAN interface to internal network.',
        affectedAssets: policy.dstAddresses?.length || 1,
        owner: 'Security Team',
        createdAt: timestamp,
        policyId: policy.policyId
      });
    }
  });
  
  return risks;
}
