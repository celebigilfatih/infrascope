import { unprotectIntegrationConfig } from '@/lib/security/integration-credentials';
import { normalizeFortiAnalyzerProfile, type FortiAnalyzerProfileInput } from './fortianalyzer-profile';

export function readFortiAnalyzerProfile(config: unknown) {
  return normalizeFortiAnalyzerProfile(unprotectIntegrationConfig<FortiAnalyzerProfileInput>(config, 'FORTIANALYZER'));
}
