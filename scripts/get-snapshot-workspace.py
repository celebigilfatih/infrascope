#!/usr/bin/env python3
"""Snapshot identities, UTC times and associated file references; no mutation calls."""
import sys
from datetime import datetime, timezone
from vmware_helper import main
from vmware_workspace import number, text

def file_keys(layout):
    if layout is None:
        return None
    data_key = getattr(layout, 'dataKey', None)
    if type(data_key) is not int or data_key < 0:
        return None
    keys = {data_key}
    memory_key = getattr(layout, 'memoryKey', None)
    if type(memory_key) is int and memory_key >= 0:
        keys.add(memory_key)
    for disk in getattr(layout, 'disk', None) or []:
        chain = getattr(disk, 'chain', None)
        if not chain:
            return None
        for unit in chain:
            unit_keys = getattr(unit, 'fileKey', None)
            if not unit_keys or any(type(key) is not int or key < 0 for key in unit_keys):
                return None
            keys.update(unit_keys)
    return sorted(keys)

def collect_snapshot_workspace(content, vim, _vm_id):
    view = content.viewManager.CreateContainerView(content.rootFolder, [vim.VirtualMachine], True)
    try:
        rows = []
        for vm in view.view:
            summary = vm.summary
            runtime = getattr(summary, 'runtime', None)
            config = getattr(summary, 'config', None)
            snapshot_info = vm.snapshot
            layout = vm.layoutEx if snapshot_info else None
            layouts = {}
            for item in getattr(layout, 'snapshot', None) or []:
                key = item.key._moId
                if not key or key in layouts:
                    raise ValueError('Duplicate or missing snapshot layout identity')
                layouts[key] = item
            files = {}
            for item in getattr(layout, 'file', None) or []:
                key = item.key
                if type(key) is not int or key < 0 or key in files:
                    raise ValueError('Invalid or duplicate file identity')
                files[key] = item
            snapshots = []
            def extract(tree):
                for snapshot in tree:
                    created = getattr(snapshot, 'createTime', None)
                    if isinstance(created, datetime):
                        if created.tzinfo is None:
                            created = created.replace(tzinfo=timezone.utc)
                        created = created.astimezone(timezone.utc).isoformat()
                    else:
                        created = None
                    snapshots.append({
                        'id': snapshot.snapshot._moId, 'name': snapshot.name, 'description': getattr(snapshot, 'description', None) or '',
                        'createTime': created, 'state': text(getattr(snapshot, 'state', None)),
                        'fileKeys': file_keys(layouts.get(snapshot.snapshot._moId)),
                    })
                    extract(snapshot.childSnapshotList or [])
            if snapshot_info:
                extract(snapshot_info.rootSnapshotList or [])
            referenced = {key for snapshot in snapshots for key in (snapshot['fileKeys'] or [])}
            measured_files = []
            for key in sorted(referenced):
                info = files.get(key)
                size = number(getattr(info, 'size', None)) if getattr(info, 'accessible', None) is not False else None
                measured_files.append({'key': key, 'sizeBytes': size})
            template = getattr(config, 'template', None)
            rows.append({
                'id': vm._moId, 'name': vm.name, 'template': template if type(template) is bool else None,
                'connectionState': text(getattr(runtime, 'connectionState', None)),
                'powerState': text(getattr(runtime, 'powerState', None)),
                'snapshots': snapshots, 'files': measured_files if layout is not None or not snapshots else None,
            })
        return sorted(rows, key=lambda row: (row['name'], row['id']))
    finally:
        view.Destroy()

if __name__ == '__main__':
    sys.exit(main('snapshotWorkspace', collect_snapshot_workspace))
