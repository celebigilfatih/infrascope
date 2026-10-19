# Risky Rules configuration

The implemented page is "/security/risks". It reviews real FortiGate policy definitions through the same scoped, authorized source endpoint as Security Policies. It contains no production fixtures or manual risk registry.

1. Configure a FortiGate connection in "/integrations/firewall".
2. Enable REST (or both) mode and the policies module. The current ACTIVE account needs firewall/read access.
3. Select the saved configuration and VDOM on Risky Rules. Disabled profiles do not initiate reads.
4. Refresh definitions to review broad-permission, interface-role-candidate and explicit-zero-counter findings. Source errors remain unavailable; no result is treated as proof that all policies are safe.

See [Risky policy review workspace](risky-rules-workspace.md) for the exact checks, severity semantics, unknown/disabled distinctions, source boundaries and verification. Policies and risk reasons are read-only; the page does not disable or delete rules.

The legacy "/api/security/risky-rules" and "lib/security/riskAnalyzer.ts" remain for compatibility. The current screen uses "/api/firewall-policies/workspace" and "lib/security/risky-rules.ts" so definitions, context and reasons come from one validated configuration/VDOM snapshot.
