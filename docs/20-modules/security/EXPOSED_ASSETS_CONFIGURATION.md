# Public Exposed Assets Page Configuration Guide

**Page:** http://localhost:8170/security/exposed  
**File:** [`app/security/exposed/page.tsx`](../app/security/exposed/page.tsx)  
**Status:** Currently using mock data (to be implemented with real scanning)

---

## Overview

The **Public Exposed Assets** page monitors infrastructure assets that are exposed to the public internet or external networks, helping identify potential security vulnerabilities and reduce the organization's external attack surface.

### Purpose

1. **🌐 External Exposure Detection** - Identify services accessible from the internet
2. **⚠️ Vulnerability Assessment** - Highlight security weaknesses in exposed services
3. **🔍 Attack Surface Management** - Provide visibility into external attack vectors
4. **📊 Risk Prioritization** - Help security teams prioritize remediation efforts

---

## Current Status

### What Exists
- ✅ UI Components: Cards, table, search, pagination
- ✅ Mock Data: 8 sample exposed assets (hardcoded)
- ✅ Risk Levels: Critical, High, Medium, Low
- ✅ Asset Details: IP, port, service, vulnerability
- ⚠️ **No Real Data Integration**

### Sample Mock Data
```typescript
WEB-SERVER-01    → 10.0.10.5:443     → HTTPS    → OpenSSL Heartbleed (Critical)
DB-SERVER-01     → 10.0.20.10:5432   → PostgreSQL → Default Credentials (High)
REDIS-CACHE-01   → 10.0.60.5:6379    → Redis     → No Auth Required (Critical)
JENKINS-01       → 10.0.80.5:8080    → HTTP      → Unauthenticated Admin (Critical)
FTP-SERVER-01    → 10.0.40.5:21      → FTP       → Anonymous Access (High)
MONGO-DB-01      → 10.0.70.5:27017   → MongoDB   → No Auth Required (High)
API-GATEWAY-01   → 10.0.30.5:8080    → HTTP      → Missing Auth Header (Medium)
SSH-GATEWAY      → 10.0.50.1:22      → SSH       → Weak KEX (Low)
```

### What's Missing
- ❌ Backend API endpoint for exposed assets
- ❌ Integration with network scanning tools
- ❌ FortiGate VIP (Virtual IP) monitoring
- ❌ Real-time vulnerability detection
- ❌ Automated scanning/discovery

---

## Use Cases

### 1. External Port Scanning
**Purpose:** Discover what services are reachable from the internet

**Method:**
- Network scanning tools (nmap, masscan, zmap)
- Scan public IP ranges owned by organization
- Identify open ports and running services

**Example Output:**
```
203.0.113.10:80    → nginx 1.18.0 (HTTP)
203.0.113.10:443   → nginx 1.18.0 (HTTPS)
203.0.113.25:22    → OpenSSH 7.9 (SSH)
203.0.113.30:3389  → Microsoft RDP (RDP)
```

### 2. Virtual IP Monitoring
**Purpose:** Track FortiGate NAT rules exposing internal services

**Method:**
- Query FortiGate VIP configuration via REST API
- Map external IPs/ports to internal targets
- Identify port forwarding rules

**Example VIP:**
```
External: 203.0.113.50:443
Internal: 10.0.10.5:443
Service:  Web Server (HTTPS)
NAT Type: Port Forward
```

### 3. Vulnerability Scanning
**Purpose:** Identify security issues in exposed services

**Method:**
- Integrate with vulnerability scanners (Nessus, OpenVAS, Qualys)
- Scan exposed services for CVEs and misconfigurations
- Assess authentication mechanisms

**Example Vulnerabilities:**
```
Redis 5.0.5  → CVE-2019-10192 (No authentication)
Jenkins 2.60 → CVE-2018-1000861 (RCE via Stapler)
OpenSSL 1.0.1 → CVE-2014-0160 (Heartbleed)
```

### 4. Traffic Analysis
**Purpose:** Identify exposed services via FortiAnalyzer logs

**Method:**
- Query FortiAnalyzer for WAN → LAN traffic
- Find accepted connections from external sources
- Group by destination to identify exposed services

**Example Query:**
```
srcintf==wan AND action==accept AND dstip matches "10.0.*"
```

### 5. Cloud Asset Discovery
**Purpose:** Find misconfigured cloud resources

**Method:**
- Scan cloud APIs (AWS, Azure, GCP)
- Find public S3 buckets, RDS instances, VMs
- Identify security group misconfigurations

---

## Implementation Options

### Option 1: FortiGate Virtual IP Integration ⭐ RECOMMENDED

**Effort:** Low (1-2 hours)  
**Value:** High (immediate visibility)  
**Data Source:** Existing FortiGate API

#### What It Provides
- List of all Virtual IPs configured on FortiGate
- External → Internal IP/port mappings
- Services exposed through NAT/port forwarding
- VIP names and descriptions

#### Implementation Steps

1. **Query FortiGate VIP Configuration**
   ```typescript
   // lib/integrations/fortigate.ts
   async getVirtualIPs() {
     const response = await this.api.get('/api/v2/cmdb/firewall/vip');
     return response.data.results;
   }
   ```

2. **Create API Endpoint**
   ```typescript
   // app/api/security/exposed-assets/route.ts
   import { NextResponse } from 'next/server';
   import { FortiGateService } from '@/lib/integrations/fortigate';
   
   export async function GET() {
     try {
       // Get FortiGate config
       const config = await getFortiGateConfig();
       const fortigate = new FortiGateService(config);
       
       // Fetch Virtual IPs
       const vips = await fortigate.getVirtualIPs();
       
       // Map to exposed assets
       const exposedAssets = vips.map(vip => ({
         id: `vip-${vip.name}`,
         asset: vip.name,
         ip: vip.extip,              // External/public IP
         port: parseInt(vip.extport), // External port
         service: detectService(vip.extport),
         exposureLevel: calculateRisk(vip),
         vulnerability: assessVIPSecurity(vip),
         internalTarget: `${vip.mappedip}:${vip.mappedport}`,
         firstSeen: vip.created_at || new Date().toISOString(),
         lastSeen: new Date().toISOString()
       }));
       
       // Cache results (5 minutes)
       const globalCache = globalThis as any;
       if (!globalCache.exposedAssetsCache) globalCache.exposedAssetsCache = {};
       globalCache.exposedAssetsCache.data = exposedAssets;
       globalCache.exposedAssetsCache.timestamp = Date.now();
       
       return NextResponse.json({
         success: true,
         data: exposedAssets,
         count: exposedAssets.length
       });
     } catch (error) {
       return NextResponse.json(
         { success: false, error: (error as Error).message },
         { status: 500 }
       );
     }
   }
   ```

3. **Service Detection Logic**
   ```typescript
   function detectService(port: string | number): string {
     const portNum = typeof port === 'string' ? parseInt(port) : port;
     const serviceMap: Record<number, string> = {
       20: 'FTP-Data',
       21: 'FTP',
       22: 'SSH',
       23: 'Telnet',
       25: 'SMTP',
       53: 'DNS',
       80: 'HTTP',
       443: 'HTTPS',
       3306: 'MySQL',
       3389: 'RDP',
       5432: 'PostgreSQL',
       6379: 'Redis',
       8080: 'HTTP-Alt',
       27017: 'MongoDB'
     };
     return serviceMap[portNum] || 'Unknown';
   }
   ```

4. **Risk Calculation**
   ```typescript
   function calculateRisk(vip: any): 'critical' | 'high' | 'medium' | 'low' {
     let score = 0;
     const port = parseInt(vip.extport);
     
     // Database ports exposed = critical
     if ([3306, 5432, 27017, 6379, 1433].includes(port)) score += 40;
     
     // Admin interfaces = high risk
     if ([22, 23, 3389].includes(port)) score += 30;
     
     // HTTP services = medium risk
     if ([80, 8080, 8443].includes(port)) score += 10;
     
     // HTTPS = lower risk (but still exposed)
     if (port === 443) score += 5;
     
     // Check for security features
     if (!vip.ssl_mode) score += 20; // No SSL inspection
     if (vip.arp_reply === 'disable') score += 10;
     
     if (score >= 50) return 'critical';
     if (score >= 30) return 'high';
     if (score >= 15) return 'medium';
     return 'low';
   }
   ```

5. **Vulnerability Assessment**
   ```typescript
   function assessVIPSecurity(vip: any): string {
     const issues = [];
     const port = parseInt(vip.extport);
     
     // Check for database ports
     if ([3306, 5432, 27017, 6379].includes(port)) {
       issues.push('Database exposed to internet');
     }
     
     // Check for admin interfaces
     if ([22, 23, 3389].includes(port)) {
       issues.push('Administrative interface exposed');
     }
     
     // Check for non-standard ports
     if (port > 10000) {
       issues.push('Non-standard port (possible obfuscation)');
     }
     
     // Check SSL mode
     if (!vip.ssl_mode || vip.ssl_mode === 'off') {
       issues.push('No SSL/TLS inspection enabled');
     }
     
     // Check port forwarding type
     if (vip.type === 'static-nat') {
       issues.push('Full NAT (all ports exposed)');
     }
     
     return issues.length > 0 ? issues.join(', ') : 'No known issues';
   }
   ```

6. **Update Page Component**
   ```typescript
   // app/security/exposed/page.tsx
   useEffect(() => {
     const fetchAssets = async () => {
       setLoading(true);
       try {
         const response = await fetch('/api/security/exposed-assets');
         const result = await response.json();
         if (result.success) {
           setAssets(result.data);
         }
       } catch (error) {
         console.error('Error fetching exposed assets:', error);
       } finally {
         setLoading(false);
       }
     };
     fetchAssets();
   }, []);
   ```

#### FortiGate VIP Structure
```json
{
  "name": "web-server-vip",
  "extip": "203.0.113.50",
  "extintf": "wan1",
  "extport": "443",
  "mappedip": "10.0.10.5",
  "mappedport": "443",
  "protocol": "tcp",
  "type": "static-nat",
  "ssl-mode": "off",
  "arp-reply": "enable"
}
```

---

### Option 2: Network Scanning Integration

**Effort:** Medium (4-6 hours)  
**Value:** High (comprehensive discovery)  
**Data Source:** nmap, masscan, or cloud scanning tools

#### Tools to Consider

**1. Nmap (Network Mapper)**
- Most popular network scanner
- Service/version detection
- OS fingerprinting
- NSE scripts for vulnerability detection

**2. Masscan**
- Ultra-fast port scanner
- Ideal for large IP ranges
- Lacks service detection (needs nmap follow-up)

**3. Shodan API**
- Internet-wide scanning database
- Pre-scanned data for public IPs
- CVE detection
- Historical data

#### Implementation with Nmap

```typescript
// lib/security/scanner.ts
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class NetworkScanner {
  async scanPublicIPs(ipRanges: string[]): Promise<ExposedAsset[]> {
    const results: ExposedAsset[] = [];
    
    for (const range of ipRanges) {
      const { stdout } = await execAsync(
        `nmap -sV -p- -oX - ${range}`,
        { timeout: 600000, maxBuffer: 10 * 1024 * 1024 }
      );
      
      // Parse nmap XML output
      const assets = this.parseNmapXML(stdout);
      results.push(...assets);
    }
    
    return results;
  }
  
  private parseNmapXML(xml: string): ExposedAsset[] {
    // Parse XML and extract:
    // - Host IP
    // - Open ports
    // - Service names/versions
    // - OS detection
    // Return as ExposedAsset[]
  }
}
```

#### Scheduled Scanning

```typescript
// lib/security/scanScheduler.ts
import { CronJob } from 'cron';
import { NetworkScanner } from './scanner';

export function setupScanScheduler() {
  // Run daily at 2 AM
  const job = new CronJob('0 2 * * *', async () => {
    console.log('Starting scheduled network scan...');
    
    const scanner = new NetworkScanner();
    const publicIPs = await getPublicIPRanges();
    const results = await scanner.scanPublicIPs(publicIPs);
    
    // Store results in database
    await storeExposedAssets(results);
    
    // Send alert if new exposures found
    const newExposures = results.filter(r => r.exposureLevel === 'critical');
    if (newExposures.length > 0) {
      await sendSecurityAlert(newExposures);
    }
  });
  
  job.start();
}
```

---

### Option 3: FortiAnalyzer Traffic Analysis

**Effort:** Medium (3-4 hours)  
**Value:** Medium (traffic-based discovery)  
**Data Source:** FortiAnalyzer logs

#### Query External Connections

```typescript
// Query FortiAnalyzer for WAN → LAN traffic
const externalAccess = await fortiAnalyzer.query({
  type: 'logs',
  logtype: 'traffic',
  filter: 'srcintf==wan and action==accept and dstip matches "10\\.0\\..*"',
  range: 10080, // 7 days
  limit: 5000
});

// Group by destination to find exposed services
const exposedServices = new Map();

externalAccess.forEach(log => {
  const key = `${log.dstip}:${log.dstport}`;
  if (!exposedServices.has(key)) {
    exposedServices.set(key, {
      ip: log.dstip,
      port: log.dstport,
      service: log.service || log.proto,
      connections: 0,
      uniqueSources: new Set(),
      firstSeen: log.time,
      lastSeen: log.time
    });
  }
  
  const service = exposedServices.get(key);
  service.connections++;
  service.uniqueSources.add(log.srcip);
  service.lastSeen = log.time;
});

// Convert to exposed assets
const exposedAssets = Array.from(exposedServices.values()).map(service => ({
  id: `traffic-${service.ip}-${service.port}`,
  asset: lookupAssetName(service.ip),
  ip: service.ip,
  port: service.port,
  service: service.service,
  exposureLevel: calculateTrafficRisk(service),
  vulnerability: `Accessed by ${service.uniqueSources.size} external sources`,
  firstSeen: service.firstSeen,
  lastSeen: service.lastSeen
}));
```

---

### Option 4: Vulnerability Scanner Integration

**Effort:** High (1-2 days)  
**Value:** Very High (detailed vulnerability data)  
**Data Source:** Nessus, OpenVAS, Qualys

#### Nessus Integration

```typescript
// lib/security/nessus.ts
export class NessusClient {
  async getScanResults(scanId: string) {
    const response = await this.api.get(`/scans/${scanId}`);
    const hosts = response.data.hosts;
    
    const exposedAssets: ExposedAsset[] = [];
    
    for (const host of hosts) {
      const vulnerabilities = await this.getHostVulnerabilities(scanId, host.host_id);
      
      vulnerabilities
        .filter(v => v.severity >= 7.0) // High/Critical only
        .forEach(vuln => {
          exposedAssets.push({
            id: `nessus-${host.host_id}-${vuln.plugin_id}`,
            asset: host.hostname || host.host_ip,
            ip: host.host_ip,
            port: vuln.port,
            service: vuln.service,
            exposureLevel: this.mapSeverity(vuln.severity),
            vulnerability: vuln.plugin_name,
            firstSeen: vuln.first_found,
            lastSeen: vuln.last_found
          });
        });
    }
    
    return exposedAssets;
  }
  
  private mapSeverity(score: number): string {
    if (score >= 9.0) return 'critical';
    if (score >= 7.0) return 'high';
    if (score >= 4.0) return 'medium';
    return 'low';
  }
}
```

---

### Option 5: Cloud Asset Discovery

**Effort:** High (2-3 days per cloud provider)  
**Value:** High (cloud security visibility)  
**Data Source:** AWS, Azure, GCP APIs

#### AWS Example

```typescript
// lib/security/awsScanner.ts
import { EC2, RDS, S3 } from 'aws-sdk';

export class AWSScanner {
  async scanExposedResources(): Promise<ExposedAsset[]> {
    const assets: ExposedAsset[] = [];
    
    // Scan EC2 instances with public IPs
    const ec2Assets = await this.scanEC2Instances();
    assets.push(...ec2Assets);
    
    // Scan RDS instances
    const rdsAssets = await this.scanRDSInstances();
    assets.push(...rdsAssets);
    
    // Scan S3 buckets
    const s3Assets = await this.scanS3Buckets();
    assets.push(...s3Assets);
    
    return assets;
  }
  
  private async scanEC2Instances(): Promise<ExposedAsset[]> {
    const ec2 = new EC2();
    const instances = await ec2.describeInstances().promise();
    
    const exposed: ExposedAsset[] = [];
    
    instances.Reservations?.forEach(reservation => {
      reservation.Instances?.forEach(instance => {
        if (instance.PublicIpAddress) {
          // Check security groups for open ports
          instance.SecurityGroups?.forEach(sg => {
            const rules = sg.IpPermissions || [];
            rules.forEach(rule => {
              if (rule.FromPort) {
                exposed.push({
                  id: `aws-ec2-${instance.InstanceId}-${rule.FromPort}`,
                  asset: instance.Tags?.find(t => t.Key === 'Name')?.Value || instance.InstanceId,
                  ip: instance.PublicIpAddress!,
                  port: rule.FromPort,
                  service: this.detectAWSService(rule.FromPort),
                  exposureLevel: this.assessAWSRisk(rule),
                  vulnerability: this.checkSecurityGroup(rule),
                  firstSeen: instance.LaunchTime?.toISOString() || '',
                  lastSeen: new Date().toISOString()
                });
              }
            });
          });
        }
      });
    });
    
    return exposed;
  }
  
  private async scanS3Buckets(): Promise<ExposedAsset[]> {
    const s3 = new S3();
    const buckets = await s3.listBuckets().promise();
    
    const exposed: ExposedAsset[] = [];
    
    for (const bucket of buckets.Buckets || []) {
      try {
        const acl = await s3.getBucketAcl({ Bucket: bucket.Name! }).promise();
        const publicAccess = acl.Grants?.some(g => 
          g.Grantee?.URI?.includes('AllUsers') || 
          g.Grantee?.URI?.includes('AuthenticatedUsers')
        );
        
        if (publicAccess) {
          exposed.push({
            id: `aws-s3-${bucket.Name}`,
            asset: bucket.Name!,
            ip: 's3.amazonaws.com',
            port: 443,
            service: 'S3',
            exposureLevel: 'critical',
            vulnerability: 'Publicly accessible bucket',
            firstSeen: bucket.CreationDate?.toISOString() || '',
            lastSeen: new Date().toISOString()
          });
        }
      } catch (error) {
        // Bucket might not be accessible
      }
    }
    
    return exposed;
  }
}
```

---

## Data Structure

### Database Schema (Prisma)

```prisma
model ExposedAsset {
  id              String   @id @default(cuid())
  
  // Basic info
  assetName       String
  publicIp        String
  publicPort      Int
  
  // Internal mapping
  internalIp      String?
  internalPort    Int?
  vipName         String?
  
  // Service details
  service         String
  serviceVersion  String?
  protocol        String   @default("tcp")
  
  // Risk assessment
  exposureLevel   String   // critical, high, medium, low
  riskScore       Int      @default(0)
  vulnerability   String?  @db.Text
  cveIds          String[] // Array of CVE IDs
  
  // Tracking
  firstSeen       DateTime
  lastSeen        DateTime
  lastVerified    DateTime @updatedAt
  
  // Metadata
  source          String   // vip, scan, traffic, cloud, manual
  sourceId        String?  // External reference (VIP ID, scan ID, etc.)
  fortiGateId     String?
  cloudProvider   String?  // aws, azure, gcp
  cloudRegion     String?
  
  // Status
  status          String   @default("active") // active, mitigated, accepted, false-positive
  notes           String?  @db.Text
  assignedTo      String?
  
  // Audit
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  @@index([publicIp, publicPort])
  @@index([exposureLevel])
  @@index([source])
  @@index([status])
  @@index([firstSeen])
}
```

### TypeScript Interface

```typescript
interface ExposedAsset {
  id: string;
  
  // Basic info
  assetName: string;
  publicIp: string;
  publicPort: number;
  
  // Internal mapping
  internalIp?: string;
  internalPort?: number;
  vipName?: string;
  
  // Service details
  service: string;
  serviceVersion?: string;
  protocol: string;
  
  // Risk assessment
  exposureLevel: 'critical' | 'high' | 'medium' | 'low';
  riskScore: number;
  vulnerability?: string;
  cveIds?: string[];
  
  // Tracking
  firstSeen: string;
  lastSeen: string;
  lastVerified: string;
  
  // Metadata
  source: 'vip' | 'scan' | 'traffic' | 'cloud' | 'manual';
  sourceId?: string;
  fortiGateId?: string;
  cloudProvider?: 'aws' | 'azure' | 'gcp';
  cloudRegion?: string;
  
  // Status
  status: 'active' | 'mitigated' | 'accepted' | 'false-positive';
  notes?: string;
  assignedTo?: string;
  
  // Audit
  createdAt: string;
  updatedAt: string;
}
```

---

## Risk Calculation Algorithm

### Multi-Factor Risk Scoring

```typescript
function calculateRiskScore(asset: ExposedAsset): number {
  let score = 0;
  
  // Factor 1: Service Type (0-40 points)
  const serviceRisk = {
    'redis': 40,
    'mongodb': 40,
    'mysql': 35,
    'postgresql': 35,
    'mssql': 35,
    'elasticsearch': 35,
    'rdp': 30,
    'ssh': 25,
    'telnet': 40,
    'ftp': 30,
    'smtp': 20,
    'http': 10,
    'https': 5
  };
  score += serviceRisk[asset.service.toLowerCase()] || 0;
  
  // Factor 2: Vulnerability Severity (0-40 points)
  if (asset.vulnerability) {
    if (asset.vulnerability.match(/no auth|unauthenticated|anonymous/i)) {
      score += 40;
    } else if (asset.vulnerability.match(/default credentials|weak password/i)) {
      score += 35;
    } else if (asset.vulnerability.match(/rce|remote code execution/i)) {
      score += 40;
    } else if (asset.vulnerability.match(/sql injection|xss/i)) {
      score += 30;
    } else if (asset.vulnerability.match(/outdated|vulnerable version/i)) {
      score += 20;
    }
  }
  
  // Factor 3: CVE Count (0-20 points)
  if (asset.cveIds && asset.cveIds.length > 0) {
    score += Math.min(20, asset.cveIds.length * 5);
  }
  
  // Return score (0-100)
  return Math.min(100, score);
}

function getExposureLevelFromScore(score: number): string {
  if (score >= 70) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}
```

---

## Recommended Implementation Roadmap

### Phase 1: Quick Win (Week 1) ⭐

**Goal:** Show real exposed assets from FortiGate VIPs

**Tasks:**
- [ ] Create `/api/security/exposed-assets` endpoint
- [ ] Implement FortiGate VIP query
- [ ] Add service detection logic
- [ ] Add risk calculation
- [ ] Update page to fetch real data
- [ ] Add 5-minute cache

**Deliverable:** Working page showing real VIP-based exposures

**Time Estimate:** 1-2 hours

---

### Phase 2: Traffic Analysis (Week 2)

**Goal:** Add FortiAnalyzer traffic-based discovery

**Tasks:**
- [ ] Query FortiAnalyzer for external connections
- [ ] Parse WAN → LAN traffic logs
- [ ] Group by destination service
- [ ] Combine with VIP data
- [ ] Add traffic statistics

**Deliverable:** Enhanced view with traffic-based exposures

**Time Estimate:** 3-4 hours

---

### Phase 3: Scanning Integration (Week 3)

**Goal:** Add automated network scanning

**Tasks:**
- [ ] Integrate nmap or masscan
- [ ] Create scan scheduler (daily scans)
- [ ] Store scan results in database
- [ ] Add change detection (new exposures)
- [ ] Send alerts for critical findings

**Deliverable:** Automated scanning with alerts

**Time Estimate:** 1-2 days

---

### Phase 4: Advanced Features (Week 4)

**Goal:** Enterprise-grade capabilities

**Tasks:**
- [ ] Add vulnerability scanner integration (Nessus/OpenVAS)
- [ ] Implement CVE database lookup
- [ ] Add remediation workflow
- [ ] Create trend charts
- [ ] Add export functionality (CSV/PDF)
- [ ] Implement risk acceptance workflow

**Deliverable:** Production-ready exposure management

**Time Estimate:** 2-3 days

---

## API Endpoints

### GET /api/security/exposed-assets

**Purpose:** Fetch all exposed assets

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "vip-web-server",
      "assetName": "web-server-01",
      "publicIp": "203.0.113.50",
      "publicPort": 443,
      "internalIp": "10.0.10.5",
      "internalPort": 443,
      "service": "HTTPS",
      "protocol": "tcp",
      "exposureLevel": "medium",
      "riskScore": 35,
      "vulnerability": "No SSL inspection enabled",
      "source": "vip",
      "firstSeen": "2024-01-01T00:00:00Z",
      "lastSeen": "2024-01-15T12:00:00Z",
      "status": "active"
    }
  ],
  "count": 12,
  "cached": false
}
```

### GET /api/security/exposed-assets/stats

**Purpose:** Get summary statistics

**Response:**
```json
{
  "totalAssets": 12,
  "bySeverity": {
    "critical": 3,
    "high": 5,
    "medium": 2,
    "low": 2
  },
  "bySource": {
    "vip": 8,
    "scan": 3,
    "traffic": 1
  },
  "uniqueServices": 7,
  "newLast24h": 2
}
```

### POST /api/security/exposed-assets/scan

**Purpose:** Trigger manual scan

**Request:**
```json
{
  "ipRanges": ["203.0.113.0/24"],
  "scanType": "quick" | "full"
}
```

**Response:**
```json
{
  "success": true,
  "scanId": "scan-123456",
  "status": "running",
  "estimatedTime": 300
}
```

---

## UI Enhancements

### Current Features
- ✅ Search/filter
- ✅ Pagination
- ✅ Severity badges
- ✅ Summary cards

### Recommended Additions

1. **Auto-refresh**
   ```typescript
   useEffect(() => {
     const interval = setInterval(fetchAssets, 300000); // 5 minutes
     return () => clearInterval(interval);
   }, []);
   ```

2. **Filters**
   - By severity level
   - By service type
   - By source (VIP, scan, traffic)
   - By status (active, mitigated)

3. **Detail View**
   - Click row to expand details
   - Show CVE information
   - Display remediation steps
   - Add notes/comments

4. **Actions**
   - Mark as false positive
   - Accept risk
   - Assign to team member
   - Create remediation ticket

5. **Charts**
   - Exposure trend over time
   - Distribution by service
   - Risk score histogram

6. **Export**
   - CSV export
   - PDF report
   - Email summary

---

## Security Considerations

### Best Practices

1. **Rate Limiting**
   - Limit scan frequency to avoid DoS
   - Throttle API requests

2. **Authentication**
   - Secure API endpoints
   - Role-based access control

3. **Sensitive Data**
   - Don't expose internal IPs in logs
   - Encrypt stored credentials

4. **Compliance**
   - Log all scan activities
   - Maintain audit trail
   - Document risk acceptance

---

## Testing Strategy

### Test Cases

1. **VIP Integration**
   - [ ] Successfully fetch VIPs from FortiGate
   - [ ] Correctly map external to internal IPs
   - [ ] Properly detect service types
   - [ ] Accurate risk calculation

2. **Risk Scoring**
   - [ ] Database services = critical/high
   - [ ] Admin interfaces = high
   - [ ] Web services = medium/low
   - [ ] Score calculation correct

3. **Performance**
   - [ ] Cache working (5 min TTL)
   - [ ] API response < 2s
   - [ ] Page load < 1s (cached)

4. **UI**
   - [ ] Search filtering correctly
   - [ ] Pagination working
   - [ ] Severity badges displaying
   - [ ] Export functioning

---

## Monitoring & Alerts

### Metrics to Track

- Total exposed assets
- Critical/high severity count
- New exposures (daily)
- Scan success rate
- API response time

### Alert Conditions

1. **Critical Exposure Detected**
   - New critical severity asset found
   - Database exposed to internet
   - Admin interface accessible

2. **Exposure Count Increase**
   - 20%+ increase in exposed assets
   - New services exposed

3. **Scan Failures**
   - Scan failed 3 times consecutively
   - FortiGate API unavailable

---

## Related Documentation

- [Security Risks Configuration](./SECURITY_RISKS_CONFIGURATION.md)
- [FortiGate Integration Guide](./FORTIGATE_INTEGRATION.md)
- [FortiAnalyzer Integration Guide](./FORTIANALYZER_INTEGRATION.md)

---

## Next Steps

**Recommended:** Start with **Phase 1** (FortiGate VIP Integration)

### To Implement:
1. Create `app/api/security/exposed-assets/route.ts`
2. Add VIP query to FortiGate service
3. Implement service detection and risk calculation
4. Update page component to use real API
5. Test with existing FortiGate configuration

**Estimated Time:** 1-2 hours  
**Impact:** High (immediate security visibility)

---

**Last Updated:** 2026-02-23  
**Status:** Ready for implementation
