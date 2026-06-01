# Alarm Suppression Engine

## Overview

The Alarm Suppression Engine filters noisy infrastructure events to prevent false-positive alerts, while still allowing real anomalies to be detected.

## Features

- **Modular Rule System**: Easily add, remove, or modify suppression rules
- **Keyword Matching**: Case-insensitive matching against usernames, messages, and event types
- **Field-Based Filtering**: Match specific device names, VMs, or hosts
- **Time-Based Rules**: Suppress events during maintenance windows or specific time periods
- **Audit Logging**: All suppression actions are logged for visibility

## Default Rules

### 1. VMware Automation Services (`vmware-automation`)
**Status:** ✅ Enabled  
**Applies to:** `VM_MIGRATED`, `VM_CLONED`, `VM_RECONFIGURED`, `VM_SUSPENDED`  
**Keywords:** `com.vmware.vim.eam`, `com.vmware.vpxd`, `drs.`, `vmware`, `vcenter`  
**Reason:** Automated VMware operations (EAM, DRS, vCenter tasks)

### 2. Veeam Backup & Replication (`veeam-backup`)
**Status:** ✅ Enabled  
**Applies to:** `VM_SNAPSHOT_CREATE`, `VM_SNAPSHOT_DELETE`, `VM_BACKUP_STARTED`  
**Keywords:** `veeam`, `veeam backup`, `veeam replica`, `veeam agent`, `vbr`  
**Reason:** Veeam backup operations

### 3. VM Migration Events (`migration-events`)
**Status:** ❌ Disabled by default  
**Applies to:** `VM_MIGRATED`  
**Event Types:** `VmMigratedEvent`, `VmMigrationEvent`, `VmRelocatedEvent`  
**Reason:** All VM migration events (vMotion/Storage vMotion)

### 4. Snapshot Operations (`snapshot-operations`)
**Status:** ❌ Disabled by default  
**Applies to:** `VM_SNAPSHOT_CREATE`, `VM_SNAPSHOT_DELETE`, `MULTIPLE_SNAPSHOTS`  
**Keywords:** `veeam`, `backup`, `automated`, `scheduled`  
**Reason:** Automated snapshot operations

## API Endpoints

### Get Suppression Stats
```bash
GET /api/alarms/suppression
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalRules": 4,
    "enabledRules": 2,
    "rules": [
      {
        "id": "vmware-automation",
        "name": "VMware Automation Services",
        "enabled": true,
        "alarmCodes": ["VM_MIGRATED", "VM_CLONED", "VM_RECONFIGURED", "VM_SUSPENDED"]
      },
      {
        "id": "veeam-backup",
        "name": "Veeam Backup & Replication",
        "enabled": true,
        "alarmCodes": ["VM_SNAPSHOT_CREATE", "VM_SNAPSHOT_DELETE", "VM_BACKUP_STARTED"]
      }
    ]
  }
}
```

### Enable/Disable Rule
```bash
PATCH /api/alarms/suppression
Content-Type: application/json

{
  "ruleId": "migration-events",
  "enabled": true
}
```

## Usage Examples

### Enable All Migration Suppression
If you want to suppress ALL vMotion/Storage vMotion events (not just automation):

```bash
curl -X PATCH http://localhost:8170/api/alarms/suppression \
  -H "Content-Type: application/json" \
  -d '{"ruleId": "migration-events", "enabled": true}'
```

### Enable Snapshot Suppression
```bash
curl -X PATCH http://localhost:8170/api/alarms/suppression \
  -H "Content-Type: application/json" \
  -d '{"ruleId": "snapshot-operations", "enabled": true}'
```

### Check Suppression Status
```bash
curl http://localhost:8170/api/alarms/suppression
```

## Adding Custom Rules

Edit `/lib/alarms/suppression-engine.ts`:

```typescript
export const VMWARE_SUPPRESSION_RULES: SuppressionRule[] = [
  // ... existing rules
  
  {
    id: 'my-custom-rule',
    name: 'My Custom Rule',
    description: 'Description of what this rule does',
    alarmCodes: ['VM_MIGRATED', 'VM_CLONED'],
    keywords: ['my-service-account', 'automation-tool'],
    enabled: true,
    reason: 'Custom automation tool',
  },
];
```

## Field-Based Suppression

You can also suppress events from specific devices or VMs:

```typescript
{
  id: 'specific-device',
  name: 'Suppress Device X',
  alarmCodes: [], // Empty = all alarm codes
  field: 'deviceName',
  fieldValues: ['DEVICE_001', 'DEVICE_002'],
  enabled: true,
  reason: 'Known noisy device',
}
```

## Time-Based Suppression

Suppress events during maintenance windows:

```typescript
{
  id: 'maintenance-window',
  name: 'Weekend Maintenance',
  alarmCodes: [], // All alarms
  timeWindow: {
    startHour: 2,   // 2 AM
    endHour: 6,     // 6 AM
    days: [0, 6],   // Sunday and Saturday
  },
  enabled: true,
  reason: 'Weekend maintenance window',
}
```

## Logging

All suppression actions are logged:

```
[AlarmEngine] Suppression engine: 2/4 rules active
[AlarmEngine] VM_MIGRATED: suppressed 5 event(s) via suppression engine
[AlarmEngine] VM_MIGRATED: kept 2 event(s), suppressed 5 event(s)
```

## How It Works

1. **Event Ingestion**: When alarms are evaluated, events are first passed through the suppression engine
2. **Rule Matching**: Each event is checked against all enabled suppression rules
3. **Filtering**: Suppressed events are filtered out before alarm generation
4. **Logging**: Statistics are logged for monitoring and debugging
5. **Alarm Creation**: Only non-suppressed events trigger alarms

## Integration with Existing Features

The suppression engine works alongside:
- **Whitelist**: Database-based suppression for specific field values
- **Cooldown**: Time-based duplicate prevention
- **isTrustedAutomation()**: Legacy keyword matching (being replaced)

## Troubleshooting

### Check if a rule is working
```bash
curl http://localhost:8170/api/alarms/suppression
```

### View suppression logs
```bash
docker logs infrascope-app --grep "suppressed"
```

### Enable debug logging
Set `LOG_LEVEL=debug` in your environment to see detailed suppression decisions.

## Migration from isTrustedAutomation()

The suppression engine replaces the legacy `isTrustedAutomation()` method:

**Before (legacy):**
```typescript
const filtered = events.filter(evt => this.isTrustedAutomation(evt));
```

**After (suppression engine):**
```typescript
const keptIndices: number[] = [];
let suppressedCount = 0;

for (let idx = 0; idx < events.length; idx++) {
  const result = this.suppressionEngine.shouldSuppress(suppressionEvent);
  if (result.suppressed) {
    suppressedCount++;
  } else {
    keptIndices.push(idx);
  }
}
```

## Best Practices

1. **Start conservative**: Keep rules disabled by default, enable only what you need
2. **Monitor logs**: Review suppression statistics regularly
3. **Test changes**: Enable one rule at a time and verify behavior
4. **Document rules**: Add clear descriptions explaining why each rule exists
5. **Review periodically**: Disable rules that are no longer needed
