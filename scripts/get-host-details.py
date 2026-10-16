#!/usr/bin/env python3
"""Collect host hardware using the shared VMware stdin/TLS protocol."""
import sys
from vmware_helper import main


def collect_hosts(content, vim, _vm_id):
    view = content.viewManager.CreateContainerView(content.rootFolder, [vim.HostSystem], True)
    try:
        hosts = []
        for host in view.view:
            hardware = host.hardware
            system = hardware.systemInfo
            summary = host.summary.hardware
            cores = summary.numCpuCores or hardware.cpuInfo.numCpuCores
            product = host.config.product
            hosts.append({
                'host_moid': host._moId, 'name': host.name,
                'vendor': system.vendor, 'model': system.model, 'cpu_cores': cores,
                'memory_size_mb': int(hardware.memorySize / (1024 * 1024)),
                'esxi_version': product.version, 'esxi_build': product.build, 'esxi_full_name': product.fullName,
            })
        return hosts
    finally:
        view.Destroy()


if __name__ == '__main__':
    sys.exit(main('hosts', collect_hosts))
