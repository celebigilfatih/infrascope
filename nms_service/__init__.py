"""NMS Service - Network Management System for InfraScope

Polls SNMP metrics from network devices and writes directly to
the shared PostgreSQL database (nms_* tables). Alarm evaluation
is handled by the TypeScript detection engine, not here.
"""
