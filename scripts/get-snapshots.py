#!/usr/bin/env python3
"""
vSphere Snapshot Fetcher using PyVmomi
Works with vSphere 6.5+ including vSphere 8
"""

import json
import sys
import ssl
from pyVim.connect import SmartConnect, Disconnect
from pyVmomi import vim
import atexit
from datetime import datetime

def get_snapshots(host, username, password, vm_id=None):
    """Get all snapshots from vCenter"""
    
    # Disable SSL verification for self-signed certs
    context = ssl._create_unverified_context()
    
    try:
        # Connect to vCenter
        si = SmartConnect(
            host=host,
            user=username,
            pwd=password,
            sslContext=context
        )
        atexit.register(Disconnect, si)
        
        content = si.RetrieveContent()
        container = content.rootFolder
        viewType = [vim.VirtualMachine]
        recursive = True
        
        containerView = content.viewManager.CreateContainerView(
            container, viewType, recursive
        )
        
        snapshots = []
        
        for vm in containerView.view:
            # Filter by VM ID if provided
            if vm_id and vm._moId != vm_id:
                continue
                
            if vm.snapshot:
                snapshot_tree = vm.snapshot.rootSnapshotList
                
                def extract_snapshots(snap_tree, vm_name, vm_id):
                    result = []
                    for snapshot in snap_tree:
                        # Calculate size (sum of all snapshot files)
                        size = 0
                        if hasattr(vm, 'layoutEx') and vm.layoutEx and vm.layoutEx.file:
                            for file in vm.layoutEx.file:
                                if file.type == 'snapshotData':
                                    size += file.size if hasattr(file, 'size') else 0
                        
                        result.append({
                            'id': snapshot.snapshot._moId,
                            'vmId': vm_id,
                            'vmName': vm_name,
                            'name': snapshot.name,
                            'description': snapshot.description or '',
                            'createTime': snapshot.createTime.isoformat() if snapshot.createTime else '',
                            'state': snapshot.state,
                            'size': size
                        })
                        
                        # Recursively get child snapshots
                        if snapshot.childSnapshotList:
                            result.extend(extract_snapshots(snapshot.childSnapshotList, vm_name, vm_id))
                    
                    return result
                
                snapshots.extend(extract_snapshots(snapshot_tree, vm.name, vm._moId))
        
        return {'success': True, 'snapshots': snapshots}
        
    except Exception as e:
        return {'success': False, 'error': str(e), 'snapshots': []}

if __name__ == '__main__':
    if len(sys.argv) < 4:
        print(json.dumps({'success': False, 'error': 'Usage: get-snapshots.py HOST USERNAME PASSWORD [VM_ID]'}))
        sys.exit(1)
    
    host = sys.argv[1]
    username = sys.argv[2]
    password = sys.argv[3]
    vm_id = sys.argv[4] if len(sys.argv) > 4 else None
    
    result = get_snapshots(host, username, password, vm_id)
    print(json.dumps(result))
