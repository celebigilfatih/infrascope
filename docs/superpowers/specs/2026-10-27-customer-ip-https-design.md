# Customer IP HTTPS

The user chose HTTPS at the existing customer IP because no DNS name is available. Their explicit choice authorizes this small deployment correction; no further design approval is needed.

Problem: production login sets an HttpOnly, Secure, SameSite=Strict cookie. Plain HTTP on a LAN IP cannot establish that session. Localhost works because of a browser exception.

Approaches considered: a DNS name with a trusted certificate; an IP with an internal CA; weakening session cookies for HTTP. The user selected the IP/internal-CA approach. Secure session protection stays enabled.

Use a separately managed official Caddy container on port443, connected to the installation's existing Compose network, forwarding to app:3000. Pin its image digest. Preserve application containers, image pins, .env, database, keys, identity and all existing ports. A persistent Docker volume stores the unique server CA private key; export only root.crt. No internet-facing DNS/ACME validation is required.

The installer validates IPv4, existing app/network ownership, package identity and an unoccupied bind port; repeated runs retain the same CA. Verify readiness with curl using an explicit CA file, never a TLS-verification bypass. The user executes the customer command and installs the public root certificate on authorized clients after checking its SHA256 fingerprint. Windows security UI and terminal UI automation are not used.

Success: CA-verified HTTPS and real session login succeed in an isolated production-image fixture; app/environment stay unchanged and rerun retains the CA. Then transfer package through RDM, user runs install, export/check only public CA, user trusts it on their workstation, verify real browser login at https://10.60.0.1. Do not claim customer success until verified.
