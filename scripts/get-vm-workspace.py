#!/usr/bin/env python3
"""VM power state, runtime host and quick stats via the shared verified SDK lifecycle."""
import sys
from vmware_helper import main
from vmware_workspace import number, scaled, text


def collect_vm_workspace(content, vim, _vm_id):
    view = content.viewManager.CreateContainerView(content.rootFolder, [vim.VirtualMachine], True)
    try:
        rows = []
        for vm in view.view:
            summary = vm.summary
            config = getattr(summary, 'config', None)
            template = getattr(config, 'template', None)
            if template is True:
                continue
            runtime = getattr(summary, 'runtime', None)
            stats = getattr(summary, 'quickStats', None)
            guest = getattr(summary, 'guest', None)
            guest_info = getattr(vm, 'guest', None)
            host = getattr(runtime, 'host', None)
            assignment = 'unknown' if runtime is None else 'assigned' if host is not None else 'unassigned'
            power = text(getattr(runtime, 'powerState', None))
            connection = text(getattr(runtime, 'connectionState', None))
            measurable = power == 'poweredOn' and connection == 'connected'
            rows.append({
                'id': vm._moId, 'name': vm.name, 'template': template if type(template) is bool else None,
                'powerState': power, 'connectionState': connection,
                'overallStatus': text(getattr(summary, 'overallStatus', None)),
                'guestState': text(getattr(guest_info, 'guestState', None)),
                'hostAssignment': assignment, 'hostId': host._moId if host is not None else None,
                'hostName': host.name if host is not None else None,
                'ip': getattr(guest, 'ipAddress', None),
                'os': getattr(guest, 'guestFullName', None) or getattr(config, 'guestFullName', None),
                'cpuCount': number(getattr(config, 'numCpu', None)),
                'cpuCapacityMHz': number(getattr(runtime, 'maxCpuUsage', None)) if measurable else None,
                'usedCpuMHz': number(getattr(stats, 'overallCpuUsage', None)) if measurable else None,
                'memoryBytes': scaled(getattr(config, 'memorySizeMB', None), 1024 ** 2),
                'activeMemoryBytes': scaled(getattr(stats, 'guestMemoryUsage', None), 1024 ** 2) if measurable else None,
                'hostMemoryBytes': scaled(getattr(stats, 'hostMemoryUsage', None), 1024 ** 2) if measurable else None,
            })
        return sorted(rows, key=lambda row: (row['name'], row['id']))
    finally:
        view.Destroy()


if __name__ == '__main__':
    sys.exit(main('vmWorkspace', collect_vm_workspace))
