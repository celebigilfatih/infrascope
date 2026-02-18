#!/usr/bin/env python3
"""vSphere Host Details Fetcher using PyVmomi"""
import json, sys, ssl, socket
from pyVim.connect import SmartConnect, Disconnect
from pyVmomi import vim
import atexit

socket.setdefaulttimeout(30)

def get_host_details(host, username, password):
    context = ssl._create_unverified_context()
    try:
        si = SmartConnect(host=host, user=username, pwd=password, sslContext=context, connectionPoolTimeout=30)
        atexit.register(Disconnect, si)
        content = si.RetrieveContent()
        container = content.rootFolder
        containerView = content.viewManager.CreateContainerView(container, [vim.HostSystem], True)
        hosts = []
        for h in containerView.view:
            hw = h.hardware
            mem_mb = 0
            if hasattr(hw, 'memorySize') and hw.memorySize:
                mem_mb = hw.memorySize / (1024 * 1024)
            vendor = 'Unknown'
            model = 'Unknown'
            if hasattr(hw, 'systemInfo') and hw.systemInfo:
                vendor = getattr(hw.systemInfo, 'vendor', 'Unknown') or 'Unknown'
                model = getattr(hw.systemInfo, 'model', 'Unknown') or 'Unknown'
            
            # Get CPU cores - try summary.hardware first (most reliable)
            cpu_cores = 0
            if hasattr(h, 'summary') and h.summary and hasattr(h.summary, 'hardware'):
                hw_summary = h.summary.hardware
                if hw_summary:
                    cpu_cores = getattr(hw_summary, 'numCpuCores', 0) or 0
            
            # Fallback: try hardware.cpuInfo
            if cpu_cores == 0 and hasattr(hw, 'cpuInfo') and hw.cpuInfo:
                cpu_info = hw.cpuInfo
                cpu_cores = getattr(cpu_info, 'numCpuCores', 0) or 0
                if cpu_cores == 0:
                    # Try numCpuPackages * numCpuCores calculation
                    packages = getattr(cpu_info, 'numCpuPackages', 0) or 0
                    threads = getattr(cpu_info, 'numCpuThreads', 0) or 0
                    if packages > 0 and threads > 0:
                        cpu_cores = threads // 2  # Approximate cores from threads
            
            prod = h.config.product if hasattr(h, 'config') and h.config else None
            hosts.append({
                'host_moid': h._moId,
                'name': h.name,
                'vendor': vendor,
                'model': model,
                'cpu_cores': cpu_cores,
                'memory_size_mb': int(mem_mb),
                'esxi_version': prod.version if prod and hasattr(prod, 'version') else 'Unknown',
                'esxi_build': prod.build if prod and hasattr(prod, 'build') else '',
                'esxi_full_name': prod.fullName if prod and hasattr(prod, 'fullName') else 'Unknown',
            })
        return {'success': True, 'hosts': hosts}
    except Exception as e:
        return {'success': False, 'error': str(e)}

if __name__ == '__main__':
    if len(sys.argv) < 4:
        print(json.dumps({'success': False, 'error': 'Usage'}))
        sys.exit(1)
    print(json.dumps(get_host_details(sys.argv[1], sys.argv[2], sys.argv[3])))
