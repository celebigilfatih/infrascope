# NMS Alarm False Positive Prevention

## Overview

Added duration-based filtering to NMS alarms to prevent false positives from brief/transient events. Two alarm types were updated:

1. **NMS_DEVICE_UNREACHABLE** — Network device not responding to SNMP queries
2. **NMS_PORT_DOWN** — Network interface administratively up but operationally down

---

## Changes

### 1. NMS_DEVICE_UNREACHABLE

**Problem:** Single missed SNMP poll (5 minutes) triggered immediate CRITICAL alarm, causing false positives when device temporarily times out but recovers quickly.

**Solution:** Require sustained unreachability before alarming.

| Before | After |
|--------|-------|
| 5 min without health metric → alarm | 15 min without health metric → alarm |
| No verification of polling agent status | Verify both health metric AND lastPolledAt are stale |
| Basic message | Rich message: IP, silent duration, last poll time, recommended actions |

**Detection Logic:**
```typescript
// Require 15 minutes of silence (3× default 5-min poll interval)
const silenceThresholdMs = 15 * 60 * 1000;

// Use device-specific interval if available (default 300s = 5 min)
const intervalMs = (device.pollingInterval || 300) * 1000;
// Require at least 3 missed intervals before alarming
const effectiveThreshold = Math.max(silenceThresholdMs, intervalMs * 3);

// Additional check: lastPolledAt must also be older than threshold
// (NMS agent updates lastPolledAt even on failed polls sometimes)
if (device.lastPolledAt && device.lastPolledAt.getTime() > effectiveCutoff.getTime()) {
  continue; // NMS agent still polling recently — not truly unreachable
}
```

**Alarm Message Example:**
```
Network device not responding to SNMP queries

Cihaz: Sebekeler_Sw1
IP: 10.5.0.86
Son basarili metrik: 18 dakika once
Son poll zamani: 14.04.2026 15:30:19

Onerilen Aksiyon: Cihaza SSH/konsol erisimi kontrol edin. SNMP servisinin calistigini dogrulayin. Agdaki erisimi (ping, traceroute) test edin.
```

---

### 2. NMS_PORT_DOWN

**Problem:** Brief link flaps (port goes down for seconds then recovers) triggered immediate alarms, creating noise for temporary network instability.

**Solution:** Track port down duration and only alarm after sustained downtime.

#### Database Schema Change

Added `down_since` column to `nms_interfaces` table:

```sql
ALTER TABLE nms_interfaces ADD COLUMN down_since TIMESTAMP;
```

**Prisma Schema:**
```prisma
model NmsInterface {
  // ... existing fields ...
  downSince      DateTime? @map("down_since")    // When port went down (for duration-based alarm filtering)
  // ... remaining fields ...
}
```

#### NMS Service (Python)

Updated `nms_service/database/repository.py` to track port down transitions:

```python
down_since = CASE
    WHEN nms_interfaces.oper_status = 'up' AND EXCLUDED.oper_status = 'down'
        THEN EXCLUDED.last_polled_at      # Port just went down — record timestamp
    WHEN EXCLUDED.oper_status = 'up'
        THEN NULL                          # Port came back up — clear timestamp
    ELSE nms_interfaces.down_since         # Port still down — keep existing timestamp
END,
```

**Behavior:**
- Port transitions from UP → DOWN: `down_since` set to current timestamp
- Port transitions from DOWN → UP: `down_since` cleared (NULL)
- Port remains DOWN: `down_since` preserved (duration accumulates)

#### Alarm Detection Engine

Updated `lib/alarms/detection-engine.ts`:

```typescript
// Check how long the port has been down
const downSince = iface.downSince ? new Date(iface.downSince).getTime() : Date.now();
const downDurationMs = Date.now() - downSince;

// Skip if port has been down for less than 5 minutes (brief flap)
if (downDurationMs < downThresholdMs) {
  continue;
}

const downMinutes = Math.round(downDurationMs / 60000);
const message = `Interface ${ifaceLabel} has been DOWN for ${downMinutes} minutes.`;
```

**Detection Logic:**
- Port must be administratively UP but operationally DOWN
- Port must have been down for **at least 5 minutes**
- Brief flaps (< 5 min) are ignored
- Alarm message includes duration in minutes

---

## Files Modified

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Added `downSince` field to `NmsInterface` model |
| `nms_service/database/repository.py` | Track `down_since` on port status transitions |
| `lib/alarms/detection-engine.ts` | Duration-based filtering for both alarms |
| Database | `ALTER TABLE nms_interfaces ADD COLUMN down_since TIMESTAMP` |

---

## Impact

### Before
- **NMS_DEVICE_UNREACHABLE**: Single SNMP timeout (5 min) → false positive alarm
- **NMS_PORT_DOWN**: Brief link flap (seconds) → immediate alarm

### After
- **NMS_DEVICE_UNREACHABLE**: Requires 15+ minutes of sustained unreachability
- **NMS_PORT_DOWN**: Requires 5+ minutes of sustained downtime
- Both alarms include rich contextual information (duration, IP, recommended actions)

---

## Migration Notes

### Existing Data
- Existing `NmsInterface` records will have `down_since = NULL`
- On next poll cycle, ports that are currently down will get `down_since` set to current time
- No false negatives — ports already down will start tracking from next poll

### NMS Service Restart Required
Python NMS service must be restarted for `down_since` tracking to become active:
```bash
docker compose restart nms-service
# or
docker restart <nms-service-container>
```

---

## Testing

### NMS_DEVICE_UNREACHABLE
1. Temporarily block SNMP access to a device (firewall rule)
2. Wait 5 minutes — **no alarm should fire**
3. Wait 15 minutes — alarm should fire with duration info
4. Restore SNMP access — device should recover on next poll

### NMS_PORT_DOWN
1. Unplug cable from a switch port
2. Wait 2 minutes — **no alarm should fire** (brief flap)
3. Wait 6 minutes — alarm should fire showing "DOWN for 6 minutes"
4. Plug cable back in — `down_since` should be cleared
5. Unplug again — `down_since` resets to current time

---

## Future Improvements

1. **Configurable thresholds**: Allow per-device or per-port threshold customization via UI
2. **Port importance**: Critical ports (uplinks, server connections) could have shorter thresholds
3. **Recovery alarms**: Optional "port recovered" notification when down port comes back up
4. **Trend analysis**: Track frequent flap patterns for proactive maintenance alerts
