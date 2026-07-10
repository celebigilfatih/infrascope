# InfraScope VMware OVA Appliance

This directory contains the files used to prepare a VMware-compatible InfraScope appliance. The appliance is a single-tenant customer installation; the central license server is not included.

## Target VM

- Ubuntu Server 24.04 LTS
- 2 vCPU minimum
- 8 GB RAM recommended
- 80 GB disk minimum
- Docker Engine and Docker Compose plugin installed
- Firewall open for `22/tcp` and `8170/tcp`

## Appliance Layout

```text
/opt/infrascope/docker-compose.yml
/opt/infrascope/env.example
/opt/infrascope/install.sh
/opt/infrascope/update.sh
/opt/infrascope/images/infrascope-1.0.0.tar
/usr/local/bin/infrascope-setup
/usr/local/bin/infrascope-status
/usr/local/bin/infrascope-update
```

## Build Release Image

Build and tag the production image outside the customer VM:

```bash
docker build -t ghcr.io/celebigilfatih/infrascope:1.0.0 .
docker save ghcr.io/celebigilfatih/infrascope:1.0.0 -o dist/infrascope-1.0.0.tar
```

Copy the saved image into the VM at:

```text
/opt/infrascope/images/infrascope-1.0.0.tar
```

## Install Appliance Files

Create the appliance asset package from the repo:

```bash
VERSION=1.0.0 bash scripts/package-appliance-assets.sh
```

Copy `dist/infrascope-appliance-1.0.0.tar.gz` to the Ubuntu VM, extract it, then run:

```bash
sudo ./INSTALL_ON_VM.sh
```

## First Setup

On the VM console:

```bash
sudo infrascope-setup
```

The script asks for:

- License key
- Public app URL, for example `http://VM_IP:8170`
- Host port, default `8170`

After setup, open:

```text
http://VM_IP:8170/setup
```

Then activate the license and create the first admin user.

## Status and Update

```bash
infrascope-status
sudo infrascope-update 1.0.1
```

For offline updates, place the new image at:

```text
/opt/infrascope/images/infrascope-1.0.1.tar
```

Then run:

```bash
sudo infrascope-update 1.0.1
```

