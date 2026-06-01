# Security Risks Page Configuration Guide

**Page:** http://localhost:8170/security/risks  
**File:** [`app/security/risks/page.tsx`](../app/security/risks/page.tsx)  
**Status:** Currently using mock data (to be replaced with real data)

---

## Current Status

### What Exists
- ✅ UI Components: Cards, table, search, pagination
- ✅ Mock Data: 10 sample risks (hardcoded)
- ✅ Risk Categories: Malware, Network, Application, etc.
- ✅ Severity Levels: Critical, High, Medium, Low
- ✅ Status Tracking: Open, Mitigated, Accepted, Closed
- ⚠️ **No Real Data Integration**

### What's Missing
- ❌ Backend API endpoint
- ❌ Database schema for risks
- ❌ Real-time risk detection
- ❌ Integration with security systems

---

## Configuration Options

### Option 1: Firewall Policy Risk Analysis ⭐ RECOMMENDED

**Effort:** Low (2-3 hours)  
**Value:** High (immediate security insights)  
**Data Source:** Existing FortiGate API

#### What It Does
Analyzes existing firewall policies to identify risky configurations:

1. **Any-to-Any Rules**
   - Source: all/any
   - Destination: all/any
   - Service: ALL
   - Risk: High/Critical

2. **Unused Policies**
   - Hit count: 0
   - Age: > 30 days
   - Risk: Medium

3. **Permissive Rules**
   - Broad service definitions
   - Multiple ANY objects
   - Risk: High

4. **External Exposure**
   - Source from WAN/Internet
   - Destination to internal servers
   - Risk: High/Critical

5. **Missing Security Features**
   - No NAT configured
   - No IPS inspection
   - No logging enabled
   - Risk: Medium

#### Implementation Steps

1. **Create Risk Analyzer Function**
   ```typescript
   // lib/security/riskAnalyzer.ts
   export function analyzePolicyRisks(policies: FirewallPolicy[]) {
     const risks = [];
     
     policies.forEach(policy => {
       // Check any-to-any
       if (isAnyToAny(policy)) {
         risks.push({
           type: 'any-to-any',
           severity: 'high',
           policyId: policy.policyId,
           description: 'Policy allows traffic from any source to any destination'
         });
       }
       
       // Check unused
       if (isUnused(policy)) {
         risks.push({
           type: 'unused',
           severity: 'medium',
           policyId: policy.policyId,
           description: 'Policy has not been hit in the last 30 days'
         });
       }
       
       // More checks...
     });
     
     return risks;
   }
   ```

2. **Create API Endpoint**
   ```typescript
   // app/api/security/risky-rules/route.ts
   import { NextResponse } from 'next/server';
   import { analyzePolicyRisks } from '@/lib/security/riskAnalyzer';
   
   export async function GET() {
     // Fetch policies from FortiGate
     const policiesResponse = await fetch('http://localhost:8170/api/firewall-policies');
     const { data: policies } = await policiesResponse.json();
     
     // Analyze for risks
     const risks = analyzePolicyRisks(policies);
     
     return NextResponse.json({
       success: true,
       data: risks,
       count: risks.length
     });
   }
   ```

3. **Update Page to Use Real Data**
   ```typescript
   // app/security/risks/page.tsx
   useEffect(() => {
     const fetchRisks = async () => {
       setLoading(true);
       try {
         const response = await fetch('/api/security/risky-rules');
         const result = await response.json();
         setRisks(result.data);
       } catch (error) {
         console.error('Error fetching risks:', error);
       } finally {
         setLoading(false);
       }
     };
     fetchRisks();
   }, []);
   ```

#### Risk Detection Rules

| Risk Type | Detection Logic | Severity | Example |
|-----------|----------------|----------|---------|
| Any-to-Any | srcaddr=all AND dstaddr=all | High | Policy allows unrestricted traffic |
| Unused Policy | hit_count=0 AND age>30d | Medium | Policy never triggered |
| Permissive Service | service=ALL or service=ANY | High | All ports allowed |
| External to Internal | srcintf=wan AND dstaddr=internal | Critical | Internet can reach internal servers |
| No Logging | log=disabled | Medium | Policy actions not logged |
| Broad Port Range | port range > 100 ports | Medium | Too many ports exposed |
| Shadow Rule | Policy never hit due to order | Low | Rule is overshadowed by earlier rules |

---

### Option 2: FortiAnalyzer Threat Log Analysis

**Effort:** Medium (3-4 hours)  
**Value:** High (real threat detection)  
**Data Source:** FortiAnalyzer integration

#### What It Does
Queries FortiAnalyzer logs to identify active threats and create risk entries:

1. **IPS Events**
   - High severity detections
   - Repeated attack patterns
   - Risk: High/Critical

2. **Malware/Virus Detections**
   - Virus hits
   - Malicious URLs
   - Risk: Critical

3. **Policy Violations**
   - Denied traffic patterns
   - Suspicious protocols
   - Risk: Medium/High

4. **Compromised Hosts**
   - IoC matches
   - C&C communications
   - Risk: Critical

#### API Queries

```typescript
// Get high-severity IPS events (last 7 days)
const ipsEvents = await fortiAnalyzer.query({
  type: 'logs',
  logtype: 'utm',
  filter: 'type==ips and severity==high',
  range: 10080, // minutes
  limit: 100
});

// Get virus detections
const virusEvents = await fortiAnalyzer.query({
  type: 'logs',
  logtype: 'utm',
  filter: 'type==virus',
  range: 10080,
  limit: 100
});

// Get denied traffic (potential attacks)
const deniedTraffic = await fortiAnalyzer.query({
  type: 'logs',
  logtype: 'traffic',
  filter: 'action==deny',
  range: 1440, // last 24h
  limit: 100
});
```

#### Risk Mapping

```typescript
function mapThreatToRisk(event) {
  return {
    id: `threat-${event.logid}`,
    title: event.attack || event.virus || 'Security Threat',
    category: event.type, // ips, virus, webfilter, etc.
    severity: mapSeverity(event.severity),
    likelihood: 'high', // active threat
    status: 'open',
    affectedAssets: 1,
    owner: 'Security Team',
    createdAt: event.time,
    details: {
      srcip: event.srcip,
      dstip: event.dstip,
      protocol: event.proto,
      action: event.action
    }
  };
}
```

---

### Option 3: Database-Stored Risk Registry

**Effort:** High (1-2 days)  
**Value:** Medium (manual management)  
**Data Source:** Manual entry + API integration

#### What It Does
Creates a full risk management system with manual entry and tracking:

#### Database Schema

```prisma
// prisma/schema.prisma
model SecurityRisk {
  id                String    @id @default(cuid())
  title             String
  description       String?   @db.Text
  category          String    // Malware, Network, Application, Cloud, etc.
  severity          String    // critical, high, medium, low
  likelihood        String    // high, medium, low
  riskScore         Int       // calculated: severity * likelihood * exposure
  status            String    // open, mitigated, accepted, closed
  affectedAssets    Int       @default(0)
  owner             String?
  ownerEmail        String?
  mitigationPlan    String?   @db.Text
  mitigationStatus  String?   // not-started, in-progress, completed
  dueDate           DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  closedAt          DateTime?
  closedBy          String?
  
  // Related records
  assetIds          String[]  // array of affected asset IDs
  vulnerabilityIds  String[]  // CVE IDs or vulnerability references
  incidentIds       String[]  // related incident IDs
  
  // Metadata
  source            String?   // automated, manual, audit, scan
  reference         String?   // external reference (CVE, ticket, etc.)
  tags              String[]  // custom tags
  
  // Audit trail
  comments          RiskComment[]
  history           RiskHistory[]
  
  @@index([severity, status])
  @@index([category])
  @@index([owner])
  @@index([createdAt])
}

model RiskComment {
  id        String   @id @default(cuid())
  riskId    String
  risk      SecurityRisk @relation(fields: [riskId], references: [id], onDelete: Cascade)
  author    String
  content   String   @db.Text
  createdAt DateTime @default(now())
  
  @@index([riskId])
}

model RiskHistory {
  id        String   @id @default(cuid())
  riskId    String
  risk      SecurityRisk @relation(fields: [riskId], references: [id], onDelete: Cascade)
  action    String   // created, updated, status_changed, closed, reopened
  field     String?  // field that changed
  oldValue  String?  @db.Text
  newValue  String?  @db.Text
  user      String
  timestamp DateTime @default(now())
  
  @@index([riskId])
}
```

#### API Endpoints

```typescript
// app/api/security/risks/route.ts
// GET    - List all risks (with filters)
// POST   - Create new risk
// PATCH  - Update risk status/details
// DELETE - Delete risk (soft delete)

// app/api/security/risks/[id]/route.ts
// GET    - Get risk details
// PATCH  - Update specific risk
// DELETE - Delete specific risk

// app/api/security/risks/[id]/comments/route.ts
// GET    - Get risk comments
// POST   - Add comment

// app/api/security/risks/stats/route.ts
// GET    - Get risk statistics
```

#### Features to Implement

1. **CRUD Operations**
   - Create/Read/Update/Delete risks
   - Bulk operations
   - Import/Export CSV

2. **Risk Calculation**
   - Auto-calculate risk score
   - Risk matrix visualization
   - Trending analysis

3. **Workflow**
   - Status transitions
   - Approval workflow
   - Due date tracking
   - Notifications

4. **Reporting**
   - Risk dashboard
   - Trend charts
   - Export reports (PDF, Excel)
   - Compliance reports

---

### Option 4: Hybrid Approach (Enterprise)

**Effort:** High (2-3 days)  
**Value:** Very High (comprehensive solution)  
**Data Source:** Multiple sources combined

#### Architecture

```
┌─────────────────────────────────────────────┐
│         Security Risk Management            │
└─────────────────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
    ┌───▼───┐   ┌───▼───┐   ┌───▼───┐
    │ Auto  │   │Manual │   │ Auto  │
    │ Scan  │   │ Entry │   │ Sync  │
    └───┬───┘   └───┬───┘   └───┬───┘
        │           │           │
┌───────┼───────────┼───────────┼───────┐
│       │           │           │       │
│   ┌───▼───┐   ┌───▼───┐   ┌───▼───┐  │
│   │FW     │   │Risk   │   │FA     │  │
│   │Policy │   │DB     │   │Logs   │  │
│   └───────┘   └───────┘   └───────┘  │
│                                       │
│   Risk Correlation & Scoring Engine  │
└───────────────────────────────────────┘
```

#### Components

1. **Automated Risk Detection**
   - Firewall policy analyzer (Option 1)
   - FortiAnalyzer threat parser (Option 2)
   - Vulnerability scanner integration
   - Compliance checker

2. **Manual Risk Registry**
   - Database storage (Option 3)
   - Web UI for CRUD
   - Workflow engine
   - Approval process

3. **Risk Correlation**
   - Deduplicate risks
   - Merge related risks
   - Calculate composite scores
   - Prioritize by impact

4. **Intelligence**
   - CVE database integration
   - Threat intelligence feeds
   - MITRE ATT&CK mapping
   - Industry benchmarks

---

## Implementation Roadmap

### Phase 1: Quick Win (Week 1)
**Goal:** Replace mock data with real firewall policy risks

- [ ] Create risk analyzer function
- [ ] Add `/api/security/risky-rules` endpoint
- [ ] Connect to existing FortiGate policies
- [ ] Update page to fetch real data
- [ ] Add cache (5 min TTL)

**Deliverable:** Working page with real risky firewall rules

### Phase 2: Threat Integration (Week 2)
**Goal:** Add FortiAnalyzer threat-based risks

- [ ] Query FortiAnalyzer for threats
- [ ] Map threats to risk format
- [ ] Combine with policy risks
- [ ] Add severity filtering
- [ ] Add time range selector

**Deliverable:** Comprehensive risk view from multiple sources

### Phase 3: Persistence (Week 3)
**Goal:** Add database storage and management

- [ ] Create Prisma schema
- [ ] Run migration
- [ ] Create CRUD API
- [ ] Add "Create Risk" modal
- [ ] Add risk detail view
- [ ] Add edit/update functionality

**Deliverable:** Full risk management system

### Phase 4: Advanced Features (Week 4)
**Goal:** Enterprise-grade capabilities

- [ ] Risk correlation engine
- [ ] Trend analysis charts
- [ ] Export functionality
- [ ] Email notifications
- [ ] Compliance reports
- [ ] Risk matrix visualization

**Deliverable:** Production-ready risk management platform

---

## Risk Detection Examples

### Example 1: Any-to-Any Rule Detection

```typescript
function detectAnyToAnyRisks(policies: FirewallPolicy[]) {
  return policies
    .filter(policy => {
      const srcAny = policy.srcAddresses?.some(addr => 
        addr.toLowerCase() === 'all' || 
        addr.toLowerCase() === 'any'
      );
      const dstAny = policy.dstAddresses?.some(addr => 
        addr.toLowerCase() === 'all' || 
        addr.toLowerCase() === 'any'
      );
      const serviceAny = policy.services?.some(svc => 
        svc.toLowerCase() === 'all' || 
        svc.toLowerCase() === 'any'
      );
      
      return srcAny && dstAny && serviceAny && policy.action === 'accept';
    })
    .map(policy => ({
      id: `any-to-any-${policy.policyId}`,
      title: `Permissive Rule: ${policy.name || policy.policyId}`,
      category: 'Firewall Configuration',
      severity: 'high',
      likelihood: 'high',
      status: 'open',
      affectedAssets: 1,
      owner: 'Network Team',
      createdAt: new Date().toISOString(),
      description: `Policy ${policy.policyId} allows traffic from any source to any destination on any service`,
      mitigationPlan: 'Review and restrict source/destination addresses and services',
      details: {
        policyId: policy.policyId,
        policyName: policy.name,
        srcInterface: policy.srcInterface,
        dstInterface: policy.dstInterface
      }
    }));
}
```

### Example 2: Unused Policy Detection

```typescript
function detectUnusedPolicies(policies: FirewallPolicy[]) {
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  
  return policies
    .filter(policy => {
      const hitCount = parseInt(policy.hitCount || '0');
      const lastHit = policy.lastHit ? new Date(policy.lastHit).getTime() : 0;
      
      return hitCount === 0 || lastHit < thirtyDaysAgo;
    })
    .map(policy => ({
      id: `unused-${policy.policyId}`,
      title: `Unused Rule: ${policy.name || policy.policyId}`,
      category: 'Policy Hygiene',
      severity: 'medium',
      likelihood: 'low',
      status: 'open',
      affectedAssets: 0,
      owner: 'Network Team',
      createdAt: new Date().toISOString(),
      description: `Policy ${policy.policyId} has not been hit in the last 30 days`,
      mitigationPlan: 'Review necessity and consider disabling or removing',
      details: {
        policyId: policy.policyId,
        hitCount: policy.hitCount,
        lastHit: policy.lastHit
      }
    }));
}
```

### Example 3: External Exposure Detection

```typescript
function detectExternalExposure(policies: FirewallPolicy[]) {
  const externalInterfaces = ['wan', 'wan1', 'wan2', 'internet', 'external'];
  
  return policies
    .filter(policy => {
      const fromExternal = policy.srcInterface?.toLowerCase().match(/wan|internet|external/);
      const toInternal = policy.dstInterface?.toLowerCase().match(/lan|internal|dmz/);
      const acceptAction = policy.action === 'accept';
      
      return fromExternal && toInternal && acceptAction;
    })
    .map(policy => ({
      id: `external-${policy.policyId}`,
      title: `External Exposure: ${policy.name || policy.policyId}`,
      category: 'Network Security',
      severity: 'critical',
      likelihood: 'high',
      status: 'open',
      affectedAssets: policy.dstAddresses?.length || 0,
      owner: 'Security Team',
      createdAt: new Date().toISOString(),
      description: `Policy allows traffic from external network to internal resources`,
      mitigationPlan: 'Review and implement proper segmentation, NAT, and IPS inspection',
      details: {
        policyId: policy.policyId,
        srcInterface: policy.srcInterface,
        dstInterface: policy.dstInterface,
        dstAddresses: policy.dstAddresses,
        services: policy.services
      }
    }));
}
```

---

## Testing & Validation

### Test Data Requirements

1. **FortiGate Policies**
   - At least 50+ policies
   - Mix of good and risky configurations
   - Various hit counts (0 to high)
   - Different interface combinations

2. **FortiAnalyzer Logs**
   - IPS events (various severities)
   - Virus/malware detections
   - Denied traffic logs
   - 7+ days of data

### Validation Checklist

- [ ] Risk detection accuracy > 95%
- [ ] False positive rate < 5%
- [ ] API response time < 2s
- [ ] Cache working properly
- [ ] Pagination functioning
- [ ] Search filtering correctly
- [ ] Severity badges displaying
- [ ] Status updates working

---

## Performance Considerations

### Caching Strategy

```typescript
// Cache risky rules analysis for 5 minutes
const CACHE_TTL = 300000; // 5 minutes

const globalCache = globalThis as any;
if (!globalCache.riskyRulesCache) {
  globalCache.riskyRulesCache = {
    data: null,
    timestamp: 0
  };
}

// Check cache
if (Date.now() - globalCache.riskyRulesCache.timestamp < CACHE_TTL) {
  return NextResponse.json({
    success: true,
    data: globalCache.riskyRulesCache.data,
    cached: true
  });
}

// Fetch and cache
const risks = await analyzeRisks();
globalCache.riskyRulesCache = {
  data: risks,
  timestamp: Date.now()
};
```

### Optimization Tips

1. **Lazy Loading**
   - Load summary stats first
   - Fetch detailed risks on demand
   - Use pagination effectively

2. **Parallel Queries**
   - Fetch policies and threats simultaneously
   - Use Promise.all() for multiple sources

3. **Incremental Updates**
   - Only analyze changed policies
   - Track last analysis timestamp
   - Delta updates vs full scans

---

## Next Steps

**Recommended:** Start with **Option 1** (Firewall Policy Analysis)

### To Implement Now:

1. Create `lib/security/riskAnalyzer.ts`
2. Create `app/api/security/risky-rules/route.ts`
3. Update `app/security/risks/page.tsx` to use real API
4. Test with existing FortiGate policies
5. Add cache for performance

**Estimated time:** 2-3 hours  
**Impact:** High (immediate security visibility)

---

## Related Files

- **Current Page:** [`app/security/risks/page.tsx`](../app/security/risks/page.tsx)
- **Firewall API:** [`app/api/firewall-policies/route.ts`](../app/api/firewall-policies/route.ts)
- **FortiAnalyzer API:** [`app/api/integrations/fortianalyzer/route.ts`](../app/api/integrations/fortianalyzer/route.ts)
- **FortiGate Service:** [`lib/integrations/fortigate.ts`](../lib/integrations/fortigate.ts)
- **FortiAnalyzer Service:** [`lib/integrations/fortianalyzer.ts`](../lib/integrations/fortianalyzer.ts)

---

## Questions?

For implementation assistance or questions about this configuration, refer to this document and the related source files listed above.

**Last Updated:** 2026-02-23
