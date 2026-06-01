# Risk Assessment

<cite>
**Referenced Files in This Document**
- [riskAnalyzer.ts](file://lib/security/riskAnalyzer.ts)
- [route.ts](file://app/api/security/risky-rules/route.ts)
- [page.tsx](file://app/dashboard/risks/page.tsx)
- [SECURITY_RISKS_CONFIGURATION.md](file://docs/20-modules/security/SECURITY_RISKS_CONFIGURATION.md)
- [EXPOSED_ASSETS_CONFIGURATION.md](file://docs/20-modules/security/EXPOSED_ASSETS_CONFIGURATION.md)
- [fortianalyzer.ts](file://lib/integrations/fortianalyzer.ts)
- [route.ts](file://app/api/integrations/fortianalyzer/mitre/route.ts)
- [fortigate.ts](file://lib/integrations/fortigate.ts)
- [route.ts](file://app/api/security/quarantine/route.ts)
- [dlq-worker.ts](file://lib/notifications/dlq-worker.ts)
- [email.ts](file://lib/notifications/email.ts)
- [detection-engine.ts](file://lib/alarms/detection-engine.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)
10. [Appendices](#appendices)

## Introduction
This document describes the risk assessment system implemented in the Infrascope platform. It covers risk scoring algorithms, threat intelligence integration, and vulnerability analysis. It documents risk calculation methodologies, scoring thresholds, and risk categorization; explains automated risk assessment workflows, manual override capabilities, and risk mitigation recommendations; details integration with external threat intelligence feeds, CVE databases, and security advisories; and includes examples of risk scoring calculations, risk heat maps, and trend analysis. It also addresses risk reporting, stakeholder notifications, remediation tracking, risk tolerance levels, and escalation procedures.

## Project Structure
The risk assessment capability spans backend APIs, security analyzers, integrations with Fortinet devices, and frontend dashboards:
- Risk detection and scoring: analyzer utilities and API endpoints
- Threat intelligence and MITRE mapping: FortiAnalyzer integration
- Vulnerability and exposed asset tracking: documentation and schema
- Quarantine management: FortiGate integration
- Notifications and retries: email and DLQ worker
- Dashboard: risk overview and trend visualization

```mermaid
graph TB
subgraph "Frontend"
Dash["Dashboard Risks Page<br/>page.tsx"]
end
subgraph "Backend APIs"
RR["/api/security/risky-rules<br/>route.ts"]
QA["/api/security/quarantine<br/>route.ts"]
MITRE["/api/integrations/fortianalyzer/mitre<br/>route.ts"]
end
subgraph "Libraries"
RA["Risk Analyzer<br/>riskAnalyzer.ts"]
FA["FortiAnalyzer Service<br/>fortianalyzer.ts"]
FG["FortiGate Service<br/>fortigate.ts"]
DLQ["Notification DLQ Worker<br/>dlq-worker.ts"]
EMAIL["Email Builder<br/>email.ts"]
DET["Alarm Detection Engine<br/>detection-engine.ts"]
end
subgraph "Documentation"
SR["Security Risks Config<br/>SECURITY_RISKS_CONFIGURATION.md"]
EA["Exposed Assets Config<br/>EXPOSED_ASSETS_CONFIGURATION.md"]
end
Dash --> RR
RR --> RA
RR --> FG
RR --> SR
MITRE --> FA
QA --> FG
FA --> SR
DLQ --> EMAIL
DET --> EMAIL
Dash --> EA
```

**Diagram sources**
- [page.tsx](file://app/dashboard/risks/page.tsx)
- [route.ts](file://app/api/security/risky-rules/route.ts)
- [route.ts](file://app/api/security/quarantine/route.ts)
- [route.ts](file://app/api/integrations/fortianalyzer/mitre/route.ts)
- [riskAnalyzer.ts](file://lib/security/riskAnalyzer.ts)
- [fortianalyzer.ts](file://lib/integrations/fortianalyzer.ts)
- [fortigate.ts](file://lib/integrations/fortigate.ts)
- [dlq-worker.ts](file://lib/notifications/dlq-worker.ts)
- [email.ts](file://lib/notifications/email.ts)
- [detection-engine.ts](file://lib/alarms/detection-engine.ts)
- [SECURITY_RISKS_CONFIGURATION.md](file://docs/20-modules/security/SECURITY_RISKS_CONFIGURATION.md)
- [EXPOSED_ASSETS_CONFIGURATION.md](file://docs/20-modules/security/EXPOSED_ASSETS_CONFIGURATION.md)

**Section sources**
- [route.ts](file://app/api/security/risky-rules/route.ts)
- [riskAnalyzer.ts](file://lib/security/riskAnalyzer.ts)
- [SECURITY_RISKS_CONFIGURATION.md](file://docs/20-modules/security/SECURITY_RISKS_CONFIGURATION.md)
- [EXPOSED_ASSETS_CONFIGURATION.md](file://docs/20-modules/security/EXPOSED_ASSETS_CONFIGURATION.md)
- [fortianalyzer.ts](file://lib/integrations/fortianalyzer.ts)
- [route.ts](file://app/api/integrations/fortianalyzer/mitre/route.ts)
- [fortigate.ts](file://lib/integrations/fortigate.ts)
- [route.ts](file://app/api/security/quarantine/route.ts)
- [dlq-worker.ts](file://lib/notifications/dlq-worker.ts)
- [email.ts](file://lib/notifications/email.ts)
- [detection-engine.ts](file://lib/alarms/detection-engine.ts)
- [page.tsx](file://app/dashboard/risks/page.tsx)

## Core Components
- Risk Analyzer: Detects risky firewall policy configurations and produces risk entries with severity and categorization.
- Risk API: Fetches policies from FortiGate, runs analyzer, caches results, and returns risk statistics.
- FortiAnalyzer Integration: Provides MITRE ATT&CK matrix and technique views, and supports threat log queries for risk mapping.
- FortiGate Integration: Supplies firewall policies and supports quarantine operations.
- Exposed Assets and Vulnerability Schema: Defines data model for exposed assets, risk scores, and vulnerability identifiers.
- Notifications and Remediation: Email templates, DLQ retry worker, and alarm engine for escalations.

**Section sources**
- [riskAnalyzer.ts](file://lib/security/riskAnalyzer.ts)
- [route.ts](file://app/api/security/risky-rules/route.ts)
- [SECURITY_RISKS_CONFIGURATION.md](file://docs/20-modules/security/SECURITY_RISKS_CONFIGURATION.md)
- [EXPOSED_ASSETS_CONFIGURATION.md](file://docs/20-modules/security/EXPOSED_ASSETS_CONFIGURATION.md)
- [fortianalyzer.ts](file://lib/integrations/fortianalyzer.ts)
- [route.ts](file://app/api/integrations/fortianalyzer/mitre/route.ts)
- [fortigate.ts](file://lib/integrations/fortigate.ts)
- [route.ts](file://app/api/security/quarantine/route.ts)
- [dlq-worker.ts](file://lib/notifications/dlq-worker.ts)
- [email.ts](file://lib/notifications/email.ts)
- [detection-engine.ts](file://lib/alarms/detection-engine.ts)

## Architecture Overview
The risk assessment pipeline integrates device telemetry, threat intelligence, and policy analysis to produce actionable risk insights. Automated workflows pull device data, apply detection rules, enrich with threat intel, and surface results in dashboards and notifications.

```mermaid
sequenceDiagram
participant UI as "Dashboard Risks Page"
participant API as "Risky Rules API"
participant Analyzer as "Risk Analyzer"
participant FG as "FortiGate Service"
participant FA as "FortiAnalyzer Service"
UI->>API : GET /api/security/risky-rules
API->>FG : Fetch firewall policies
FG-->>API : Policies
API->>Analyzer : analyzePolicyRisks(policies)
Analyzer-->>API : Detected risks
API-->>UI : Risks + stats
UI->>FA : GET /api/integrations/fortianalyzer/mitre?type=matrix
FA-->>UI : MITRE matrix data
```

**Diagram sources**
- [page.tsx](file://app/dashboard/risks/page.tsx)
- [route.ts](file://app/api/security/risky-rules/route.ts)
- [riskAnalyzer.ts](file://lib/security/riskAnalyzer.ts)
- [fortigate.ts](file://lib/integrations/fortigate.ts)
- [fortianalyzer.ts](file://lib/integrations/fortianalyzer.ts)
- [route.ts](file://app/api/integrations/fortianalyzer/mitre/route.ts)

## Detailed Component Analysis

### Risk Scoring and Categorization
- Multi-factor risk scoring for exposed assets:
  - Service type factor (0–40)
  - Vulnerability severity factor (0–40)
  - CVE count factor (0–20)
  - Final score capped at 0–100
  - Exposure level derived from score thresholds
- Risk categories and severities are used to drive prioritization and notifications.

```mermaid
flowchart TD
Start(["Exposed Asset"]) --> S1["Service Type Score"]
Start --> S2["Vulnerability Severity Score"]
Start --> S3["CVE Count Score"]
S1 --> Sum["Sum Scores"]
S2 --> Sum
S3 --> Sum
Sum --> Cap["Cap at 100"]
Cap --> Level{"Score Threshold"}
Level --> |>= 70| Crit["Critical"]
Level --> |>= 50| High["High"]
Level --> |>= 30| Med["Medium"]
Level --> Low["Low"]
```

**Diagram sources**
- [EXPOSED_ASSETS_CONFIGURATION.md](file://docs/20-modules/security/EXPOSED_ASSETS_CONFIGURATION.md)

**Section sources**
- [EXPOSED_ASSETS_CONFIGURATION.md](file://docs/20-modules/security/EXPOSED_ASSETS_CONFIGURATION.md)

### Firewall Policy Risk Detection
- Detection rules include:
  - Any-to-Any rules (critical)
  - Unused policies (low)
  - External to internal exposure (high)
- Results are sorted by severity and cached for short-term reuse.

```mermaid
flowchart TD
P["Firewall Policy"] --> A2A{"Any-to-Any?"}
A2A --> |Yes| CR["Critical Risk: Any-to-Any"]
A2A --> |No| U{"Unused?"}
U --> |Yes| LR["Low Risk: Unused"]
U --> |No| E2I{"External to Internal?"}
E2I --> |Yes| HR["High Risk: External Exposure"]
E2I --> |No| OK["No Risk"]
```

**Diagram sources**
- [riskAnalyzer.ts](file://lib/security/riskAnalyzer.ts)

**Section sources**
- [riskAnalyzer.ts](file://lib/security/riskAnalyzer.ts)
- [route.ts](file://app/api/security/risky-rules/route.ts)

### Automated Risk Assessment Workflow
- Fetch policies from FortiGate
- Analyze policies for risk patterns
- Aggregate statistics (critical, high, medium, low)
- Cache results for short TTL
- Serve via API for dashboard consumption

```mermaid
sequenceDiagram
participant API as "Risky Rules API"
participant FG as "FortiGate Service"
participant Analyzer as "Risk Analyzer"
participant Cache as "In-memory Cache"
API->>Cache : Check cached risks
alt Cache miss
API->>FG : GET /api/firewall-policies
FG-->>API : Policies
API->>Analyzer : analyzePolicyRisks(policies)
Analyzer-->>API : Risks
API->>Cache : Store risks + timestamp
else Cache present
API->>Cache : Load risks
end
API-->>Caller : Risks + stats
```

**Diagram sources**
- [route.ts](file://app/api/security/risky-rules/route.ts)
- [riskAnalyzer.ts](file://lib/security/riskAnalyzer.ts)
- [fortigate.ts](file://lib/integrations/fortigate.ts)

**Section sources**
- [route.ts](file://app/api/security/risky-rules/route.ts)
- [riskAnalyzer.ts](file://lib/security/riskAnalyzer.ts)
- [fortigate.ts](file://lib/integrations/fortigate.ts)

### Threat Intelligence Integration (MITRE ATT&CK)
- MITRE matrix and technique details are fetched from FortiAnalyzer.
- Supports domain scoping and time-range selection.
- Enables correlation of observed events with ATT&CK techniques for contextual risk.

```mermaid
sequenceDiagram
participant UI as "UI"
participant API as "MITRE API"
participant FA as "FortiAnalyzer Service"
UI->>API : GET /api/integrations/fortianalyzer/mitre?type=matrix
API->>FA : getMitreAttackMatrix()
FA-->>API : Matrix data
API-->>UI : Matrix
UI->>API : GET /api/integrations/fortianalyzer/mitre?type=technique&techId=...
API->>FA : getMitreTechniqueDetails(techId)
FA-->>API : Technique details
API-->>UI : Details
```

**Diagram sources**
- [route.ts](file://app/api/integrations/fortianalyzer/mitre/route.ts)
- [fortianalyzer.ts](file://lib/integrations/fortianalyzer.ts)

**Section sources**
- [route.ts](file://app/api/integrations/fortianalyzer/mitre/route.ts)
- [fortianalyzer.ts](file://lib/integrations/fortianalyzer.ts)

### Vulnerability and Exposed Asset Schema
- ExposedAsset model captures service, version, protocol, risk exposure level, risk score, vulnerability text, and CVE identifiers.
- Supports status tracking, source attribution, and metadata for cloud providers and device linkage.

```mermaid
erDiagram
EXPOSED_ASSET {
string id PK
string assetName
string publicIp
int publicPort
string internalIp
int internalPort
string service
string serviceVersion
string protocol
string exposureLevel
int riskScore
string vulnerability
string[] cveIds
datetime firstSeen
datetime lastSeen
datetime lastVerified
string source
string sourceId
string fortiGateId
string cloudProvider
string cloudRegion
string status
string notes
string assignedTo
datetime createdAt
datetime updatedAt
}
```

**Diagram sources**
- [EXPOSED_ASSETS_CONFIGURATION.md](file://docs/20-modules/security/EXPOSED_ASSETS_CONFIGURATION.md)

**Section sources**
- [EXPOSED_ASSETS_CONFIGURATION.md](file://docs/20-modules/security/EXPOSED_ASSETS_CONFIGURATION.md)

### Quarantine Management
- Lists, adds, and removes quarantined IPs via FortiGate integration.
- Requires integration configuration and supports expiry windows.

```mermaid
sequenceDiagram
participant API as "Quarantine API"
participant CFG as "Integration Config"
participant FG as "FortiGate Service"
API->>CFG : Load FortiGate config
CFG-->>API : Host, tokens
API->>FG : fetchQuarantinedIPs() / addToQuarantine() / releaseQuarantinedIP()
FG-->>API : Results
API-->>Caller : Status + message
```

**Diagram sources**
- [route.ts](file://app/api/security/quarantine/route.ts)
- [fortigate.ts](file://lib/integrations/fortigate.ts)

**Section sources**
- [route.ts](file://app/api/security/quarantine/route.ts)
- [fortigate.ts](file://lib/integrations/fortigate.ts)

### Risk Heat Maps and Trend Analysis
- Dashboard displays average risk score, counts by severity, and trend indicators.
- Color-coded badges and icons reflect risk levels and categories.

```mermaid
flowchart TD
R["Risks Collection"] --> Avg["Compute Average Risk Score"]
R --> Counts["Counts by Category/Severity"]
Avg --> Heat["Heat Map Cells"]
Counts --> Trend["Trend Indicator"]
Heat --> UI["Dashboard UI"]
Trend --> UI
```

**Diagram sources**
- [page.tsx](file://app/dashboard/risks/page.tsx)

**Section sources**
- [page.tsx](file://app/dashboard/risks/page.tsx)

### Risk Mitigation Recommendations and Manual Overrides
- Risk registry schema supports mitigation plans, owners, due dates, statuses, and comments/history.
- Manual overrides and approvals can be modeled via status transitions and comments.
- Integration with risk detection rules enables semi-automated triage.

```mermaid
classDiagram
class SecurityRisk {
+string id
+string title
+string description
+string category
+string severity
+string likelihood
+int riskScore
+string status
+int affectedAssets
+string owner
+string mitigationPlan
+string mitigationStatus
+datetime dueDate
+datetime createdAt
+datetime updatedAt
+datetime closedAt
+string closedBy
+string[] assetIds
+string[] vulnerabilityIds
+string[] incidentIds
+string source
+string reference
+string[] tags
}
```

**Diagram sources**
- [SECURITY_RISKS_CONFIGURATION.md](file://docs/20-modules/security/SECURITY_RISKS_CONFIGURATION.md)

**Section sources**
- [SECURITY_RISKS_CONFIGURATION.md](file://docs/20-modules/security/SECURITY_RISKS_CONFIGURATION.md)

### Notifications, Escalation, and Remediation Tracking
- Email notifications are built from alarm data and parsed into structured sections.
- DLQ worker retries failed notifications with exponential backoff and marks permanent failures.
- Detection engine supports retrying undelivered notifications and correlating alarms.

```mermaid
sequenceDiagram
participant DET as "Alarm Detection Engine"
participant DLQ as "DLQ Worker"
participant EMAIL as "Email Builder"
participant SMTP as "SMTP"
DET->>EMAIL : Build alarm email
EMAIL-->>DET : HTML email
DET->>SMTP : Send email
alt Failure
DET->>DLQ : Enqueue retry
DLQ->>DLQ : Exponential backoff
DLQ->>SMTP : Retry send
else Success
DLQ-->>DET : Ack
end
```

**Diagram sources**
- [detection-engine.ts](file://lib/alarms/detection-engine.ts)
- [dlq-worker.ts](file://lib/notifications/dlq-worker.ts)
- [email.ts](file://lib/notifications/email.ts)

**Section sources**
- [detection-engine.ts](file://lib/alarms/detection-engine.ts)
- [dlq-worker.ts](file://lib/notifications/dlq-worker.ts)
- [email.ts](file://lib/notifications/email.ts)

## Dependency Analysis
- Risk Analyzer depends on policy structures and returns standardized risk objects.
- Risk API depends on FortiGate integration for policy retrieval and caches results.
- MITRE API depends on FortiAnalyzer service for matrix and technique data.
- Quarantine API depends on FortiGate integration for device operations.
- Notifications depend on email builder and DLQ worker for resilient delivery.

```mermaid
graph LR
RA["Risk Analyzer"] --> RR["Risky Rules API"]
RR --> FG["FortiGate Service"]
RR --> Cache["In-memory Cache"]
MITRE["MITRE API"] --> FA["FortiAnalyzer Service"]
QA["Quarantine API"] --> FG
DET["Alarm Detection Engine"] --> EMAIL["Email Builder"]
DLQ["DLQ Worker"] --> EMAIL
DLQ --> DET
```

**Diagram sources**
- [riskAnalyzer.ts](file://lib/security/riskAnalyzer.ts)
- [route.ts](file://app/api/security/risky-rules/route.ts)
- [fortigate.ts](file://lib/integrations/fortigate.ts)
- [route.ts](file://app/api/integrations/fortianalyzer/mitre/route.ts)
- [fortianalyzer.ts](file://lib/integrations/fortianalyzer.ts)
- [route.ts](file://app/api/security/quarantine/route.ts)
- [detection-engine.ts](file://lib/alarms/detection-engine.ts)
- [dlq-worker.ts](file://lib/notifications/dlq-worker.ts)
- [email.ts](file://lib/notifications/email.ts)

**Section sources**
- [route.ts](file://app/api/security/risky-rules/route.ts)
- [riskAnalyzer.ts](file://lib/security/riskAnalyzer.ts)
- [fortigate.ts](file://lib/integrations/fortigate.ts)
- [route.ts](file://app/api/integrations/fortianalyzer/mitre/route.ts)
- [fortianalyzer.ts](file://lib/integrations/fortianalyzer.ts)
- [route.ts](file://app/api/security/quarantine/route.ts)
- [detection-engine.ts](file://lib/alarms/detection-engine.ts)
- [dlq-worker.ts](file://lib/notifications/dlq-worker.ts)
- [email.ts](file://lib/notifications/email.ts)

## Performance Considerations
- Short-lived caching of risk results reduces repeated computation and API calls.
- FortiAnalyzer and FortiGate integrations use timeouts and retry/backoff to handle transient failures.
- Dashboard computations (averages, counts) are lightweight and suitable for client rendering.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
- FortiAnalyzer session and account lockout:
  - Login failures trigger exponential backoff and may lock the account; unlock via FortiAnalyzer GUI.
- Session expiration:
  - Both FortiAnalyzer and FortiGate services invalidate stale sessions and re-authenticate as needed.
- Notification delivery:
  - DLQ worker retries failed sends with exponential backoff; persistent failures are marked and require manual intervention.
- Quarantine operations:
  - Ensure FortiGate integration is configured and accessible; verify credentials and permissions.

**Section sources**
- [fortianalyzer.ts](file://lib/integrations/fortianalyzer.ts)
- [fortigate.ts](file://lib/integrations/fortigate.ts)
- [dlq-worker.ts](file://lib/notifications/dlq-worker.ts)

## Conclusion
The risk assessment system combines policy-based detection, threat intelligence mapping, and vulnerability modeling to deliver actionable insights. Automated workflows integrate device telemetry and threat feeds, while manual overrides and a robust notification system support remediation tracking and escalation. The modular design enables incremental enhancements, from quick wins to enterprise-grade risk management.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### Risk Calculation Methodology and Thresholds
- Exposed asset scoring factors and thresholds are defined in the exposed assets configuration.
- Firewall policy risk thresholds are embedded in the analyzer and API responses.

**Section sources**
- [EXPOSED_ASSETS_CONFIGURATION.md](file://docs/20-modules/security/EXPOSED_ASSETS_CONFIGURATION.md)
- [riskAnalyzer.ts](file://lib/security/riskAnalyzer.ts)
- [route.ts](file://app/api/security/risky-rules/route.ts)

### Risk Reporting and Trend Analysis
- Dashboard components compute averages and counts and render trend indicators.
- MITRE integration provides contextual risk mapping for techniques and matrices.

**Section sources**
- [page.tsx](file://app/dashboard/risks/page.tsx)
- [route.ts](file://app/api/integrations/fortianalyzer/mitre/route.ts)
- [fortianalyzer.ts](file://lib/integrations/fortianalyzer.ts)

### Integration References
- FortiAnalyzer JSON-RPC endpoints and MITRE views are documented in the integration service and API routes.
- FortiGate REST endpoints and synchronization logic are implemented in the FortiGate service.

**Section sources**
- [fortianalyzer.ts](file://lib/integrations/fortianalyzer.ts)
- [route.ts](file://app/api/integrations/fortianalyzer/mitre/route.ts)
- [fortigate.ts](file://lib/integrations/fortigate.ts)