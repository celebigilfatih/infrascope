# Inventory Module

> **Owner:** Organizations, Buildings, Floors, Rooms, Racks, Devices
> **Data source:** Prisma (`lib/prisma.ts`) + FortiGate CMDB

## What's here

Historical API docs and testing guides for the location/inventory APIs.

| File | Topic |
|---|---|
| `API_BUILDINGS.md` | Buildings API documentation |
| `API_FLOORS.md` | Floors API documentation |
| `API_ORGANIZATIONS.md` | Organizations API documentation |
| `API_TESTING_GUIDE.md` | API testing guide |
| `BUILDINGS_API_SUMMARY.md` | Buildings API summary (redundant w/ API_BUILDINGS) |
| `FLOORS_API_SUMMARY.md` | Floors API summary (redundant w/ API_FLOORS) |
| `ORGANIZATIONS_API_SUMMARY.md` | Organizations API summary (redundant w/ API_ORGANIZATIONS) |
| `QUICK_START_TESTING.md` | Quick start for API testing |

## Note

The `*_SUMMARY.md` files are likely redundant with the full `API_*.md` files.
Consider deleting the summaries once you verify they don't contain unique info.

## Planned

- `README.md` — Inventory domain overview (locations → devices → interfaces)
- Auto-generated API catalog from route files
