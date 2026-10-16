"""Shared, read-only SDK projections for virtualization workspaces."""
import math


def number(value):
    return value if type(value) in (int, float) and math.isfinite(value) and value >= 0 else None


def scaled(value, factor):
    value = number(value)
    return value * factor if value is not None else None


def text(value):
    return str(value) if value is not None else 'unknown'


def host_row(host):
    summary = host.summary
    hardware = getattr(summary, 'hardware', None)
    runtime = getattr(summary, 'runtime', None)
    stats = getattr(summary, 'quickStats', None)
    product = getattr(getattr(summary, 'config', None), 'product', None)
    cores = number(getattr(hardware, 'numCpuCores', None))
    mhz = number(getattr(hardware, 'cpuMhz', None))
    connected = text(getattr(runtime, 'connectionState', None))
    powered = text(getattr(runtime, 'powerState', None))
    measurable = connected == 'connected' and powered == 'poweredOn'
    maintenance = getattr(runtime, 'inMaintenanceMode', None)
    return {
        'id': host._moId, 'name': host.name, 'connectionState': connected, 'powerState': powered,
        'overallStatus': text(getattr(summary, 'overallStatus', None)),
        'maintenance': maintenance if type(maintenance) is bool else None,
        'cpuCores': cores, 'totalCpuMHz': cores * mhz if cores is not None and mhz is not None else None,
        'totalMemoryBytes': number(getattr(hardware, 'memorySize', None)),
        'usedCpuMHz': number(getattr(stats, 'overallCpuUsage', None)) if measurable else None,
        'usedMemoryBytes': scaled(getattr(stats, 'overallMemoryUsage', None), 1024 ** 2) if measurable else None,
        'version': getattr(product, 'version', None),
    }
