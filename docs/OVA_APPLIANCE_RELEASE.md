# InfraScope OVA Appliance Release Runbook

## Branch Model

- `main`: stable product branch.
- `release/v1.0.0`: customer/demo release source.
- `appliance/ova-v1.0.0`: OVA appliance preparation branch.

Do not deploy customer environments from ad-hoc feature or deployment branches. Customer servers and appliance builds should use a release branch or a pinned image tag.

## Prepare Branches

From the tested product branch:

```bash
git checkout deploy/license-server-coolify
git push origin deploy/license-server-coolify
git checkout main
git merge --ff-only deploy/license-server-coolify
git push origin main
git checkout -b release/v1.0.0
git push origin release/v1.0.0
git checkout -b appliance/ova-v1.0.0
git push origin appliance/ova-v1.0.0
```

If `main` cannot fast-forward, stop and review the diff before merging. Do not force-push release branches after they are used for customer installs.

## Build Production Image

```bash
git checkout release/v1.0.0
npm run type-check
npm run security:tls-check
npm run build
docker build -t ghcr.io/celebigilfatih/infrascope:1.0.0 .
docker save ghcr.io/celebigilfatih/infrascope:1.0.0 -o dist/infrascope-1.0.0.tar
```

Push is optional for online installs:

```bash
docker push ghcr.io/celebigilfatih/infrascope:1.0.0
```

## Prepare Appliance Assets

```bash
VERSION=1.0.0 npm run deploy:package:appliance
```

Copy these files to the Ubuntu VM:

```text
dist/infrascope-appliance-1.0.0.tar.gz
dist/infrascope-1.0.0.tar
```

Extract and install on the VM:

```bash
tar -xzf infrascope-appliance-1.0.0.tar.gz
cd infrascope-appliance-1.0.0
sudo ./INSTALL_ON_VM.sh
sudo mkdir -p /opt/infrascope/images
sudo cp ../infrascope-1.0.0.tar /opt/infrascope/images/infrascope-1.0.0.tar
```

## Final VM Setup

```bash
sudo ufw allow 22/tcp
sudo ufw allow 8170/tcp
sudo ufw --force enable
sudo infrascope-setup
infrascope-status
```

Open:

```text
http://VM_IP:8170/setup
```

Activate the license and create the first admin user.

## OVA Export Checklist

- `infrascope-status` reports healthy containers.
- `http://VM_IP:8170/setup` or `/login` opens from another machine.
- No source repository exists under `/opt/infrascope`.
- `/opt/infrascope/images/infrascope-1.0.0.tar` exists.
- Shell history and temporary files are cleaned.
- VM is shut down cleanly before VMware OVF/OVA export.

