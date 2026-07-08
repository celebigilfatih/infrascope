# Alarms Module

> **Owner:** Alarm engine (`lib/alarms/`)
> **Not owned by:** Integration clients (they only provide data sources)

## What's here

This directory contains historical/technical docs about the alarm subsystem.

| File | Topic |
|---|---|
| `ALARM_EMAIL_LIST.md` | Email notification recipient config |
| `ALARM_SOURCES_ANALYSIS.md` | Analysis of all alarm data sources |
| `ALARM_SUPPRESSION_ENGINE.md` | Suppression/cooldown engine design |
| `DEFINITIONS.md` | Auto-generated alarm catalog from `lib/alarms/alarm-definitions.ts` |
| `FW_POLICY_CHANGED_FIX.md` | Firewall policy change alarm user attribution fix |
| `NMS_ALARM_FALSE_POSITIVE_PREVENTION.md` | NMS_PORT_DOWN false positive prevention |

## Related (authoritative)

- `docs/00-product/CONSTITUTION.md` §3.2 — Alarm discipline principles
- `docs/30-runbooks/DUPLICATE_PORT_DOWN_EVENTS.md` — NMS_PORT_DOWN race condition
- `docs/30-runbooks/FA_ACCOUNT_LOCKED.md` — FA lockout (affects all FA-based alarms)

## Planned

- `COOLDOWN.md` — Cooldown rules per alarm type
