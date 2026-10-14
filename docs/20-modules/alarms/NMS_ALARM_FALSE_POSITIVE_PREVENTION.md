# NMS Alarm Reliability and False Positive Prevention

## Overview

Switch alarms use PostgreSQL interface and health data written by the Python NMS service. FortiAnalyzer is not required for this source.

Built-in rules:

- `NMS_PORT_DOWN`
- `NMS_DEVICE_UNREACHABLE`
- `NMS_CPU_HIGH`
- `NMS_MEMORY_HIGH`
- `NMS_TEMPERATURE_HIGH`

## Source Isolation and Scheduling

- Customer deployments start the scheduler and watchdog from `instrumentation-node.ts`.
- The first check runs immediately and subsequent checks run every 10 minutes.
- Health endpoints are read-only and never start background services.
- NMS evaluation runs before FortiAnalyzer evaluation.
- A FortiAnalyzer failure records a `PARTIAL` check without discarding NMS incidents.
- Stale `RUNNING` checks become `ORPHANED`; executed checks always receive a terminal state.

## Device Unreachable

`Device.lastPolledAt` is the latest successful interface or health collection time. A failed SNMP/SSH attempt does not advance it.

The alarm requires:

- Polling is enabled and the device has an NMS identifier.
- The device has previously completed a successful poll.
- No health metric exists inside the effective threshold.
- `lastPolledAt` is also older than the effective threshold.
- The threshold is at least 30 minutes or three device poll intervals, whichever is longer.

The incident resolves when a health metric is received inside the 15-minute recovery window.

## Port Down

The alarm requires all of the following:

- The port is explicitly selected for monitoring.
- `adminStatus` is `up` and `operStatus` is `down`.
- The port was previously observed as `up`.
- Poll data is newer than 10 minutes.
- The port has remained down for at least 5 minutes.

`downSince` starts only on an UP to DOWN transition and remains stable while the port is down. `operUpSince` starts only on a DOWN to UP transition and remains stable while the port stays up.

The incident resolves when the port remains up for 5 minutes or when monitoring is disabled for that port.

## Operational Health

`GET /api/health/alarms` exposes `components.nmsPipeline`:

- `state`: `healthy`, `degraded`, or `not_configured`
- polling and registered device counts
- monitored port count
- fresh interface and health metric counts
- last successful poll and alarm check timestamps
- actionable blocking reasons

`/dashboard/alerts` displays these reasons only when switch monitoring needs attention.

## Verification

Run deterministic state checks:

```bash
npm run test:switch-alarms
```

Customer acceptance testing must use a spare or explicitly approved test port:

1. Add an inventory device and enable NMS monitoring.
2. Confirm the device is registered and fresh interface data exists.
3. Select the test port for monitoring and observe it up at least once.
4. Disconnect the test port for less than 5 minutes; no incident should appear.
5. Keep it down for more than 5 minutes; one `NMS_PORT_DOWN` incident should appear.
6. Restore the port and keep it up for 5 minutes; the incident should resolve.

Never disable a production port solely to test alarm delivery.
