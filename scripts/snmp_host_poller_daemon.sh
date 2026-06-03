#!/bin/bash
# Wrapper script for host-side SNMP poller daemon
# Called by launchd agent com.infrascope.snmp-host-poller
cd /Users/celebigil/Dev/infrascope
exec .venv/bin/python3 scripts/snmp_host_poller.py --daemon --interval 60
