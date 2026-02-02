'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { 
  Server, HardDrive, Activity, AlertTriangle, 
  RefreshCw
} from 'lucide-react';

interface InventoryReport {
  totalDevices: number;
  byType: Record<string, number>;
  byVendor: Record<string, number>;
  byStatus: Record<string, number>;
  byCriticality: Record<string, number>;
  recentlyAdded: Array<{ id: string; name: string; type: string; createdAt: string }>;
  topVendors: Array<{ vendor: string; count: number }>;
}

interface CapacityReport {
  totalRacks: number;
  usedRackSpace: number;
  totalRackUnits: number;
  usedRackUnits: number;
  rackUtilization: number;
  byRoom: Array<{ room: string; totalRacks: number; usedRacks: number; utilization: number }>;
  powerUtilization: { total: number; used: number; percentage: number };
  coolingUtilization: { total: number; used: number; percentage: number };
}

interface VmwareReport {
  totalClusters: number;
  totalHosts: number;
  totalVMs: number;
  totalDatastores: number;
  hostCpuUsage: number;
  hostMemoryUsage: number;
  hostStorageUsage: number;
  vmDistribution: Array<{ cluster: string; vmCount: number }>;
  datastoreUtilization: Array<{ name: string; capacity: number; used: number; percentage: number }>;
}

interface AlertReport {
  totalAlerts: number;
  criticalAlerts: number;
  warningAlerts: number;
  infoAlerts: number;
  recentAlerts: Array<{ id: string; message: string; severity: string; device: string; timestamp: string }>;
  topAlertingDevices: Array<{ device: string; alertCount: number }>;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('summary');
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState<InventoryReport | null>(null);
  const [capacity, setCapacity] = useState<CapacityReport | null>(null);
  const [vmware, setVmware] = useState<VmwareReport | null>(null);
  const [alerts, setAlerts] = useState<AlertReport | null>(null);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const [invRes, capRes, vmRes, alertRes] = await Promise.all([
        fetch('/api/reports?type=inventory'),
        fetch('/api/reports?type=capacity'),
        fetch('/api/reports?type=vmware'),
        fetch('/api/reports?type=alerts')
      ]);

      if (invRes.ok) setInventory(await invRes.json());
      if (capRes.ok) setCapacity(await capRes.json());
      if (vmRes.ok) setVmware(await vmRes.json());
      if (alertRes.ok) setAlerts(await alertRes.json());
    } catch (error) {
      console.error('Failed to fetch reports:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  if (loading && !inventory) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const typeData = inventory ? Object.entries(inventory.byType).map(([name, value]) => ({ name, value })) : [];
  const statusData = inventory ? Object.entries(inventory.byStatus).map(([name, value]) => ({ name, value })) : [];
  const criticalityData = inventory ? Object.entries(inventory.byCriticality).map(([name, value]) => ({ name, value })) : [];
  const roomData = capacity ? capacity.byRoom : [];

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Reports & Analytics</h1>
          <p className="text-muted-foreground">Comprehensive infrastructure monitoring reports</p>
        </div>
        <Button onClick={fetchReports} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-5 gap-2">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="capacity">Capacity</TabsTrigger>
          <TabsTrigger value="vmware">VMware</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
        </TabsList>

        {/* Summary Tab */}
        <TabsContent value="summary" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Devices</CardTitle>
                <Server className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{inventory?.totalDevices || 0}</div>
                <p className="text-xs text-muted-foreground">Across all types</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Rack Utilization</CardTitle>
                <HardDrive className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{capacity?.rackUtilization.toFixed(1) || 0}%</div>
                <Progress value={capacity?.rackUtilization || 0} className="mt-2" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">VMware VMs</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{vmware?.totalVMs || 0}</div>
                <p className="text-xs text-muted-foreground">Across {vmware?.totalClusters || 0} clusters</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{alerts?.totalAlerts || 0}</div>
                <p className="text-xs text-muted-foreground">
                  {alerts?.criticalAlerts || 0} critical, {alerts?.warningAlerts || 0} warning
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Device Distribution by Type</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={typeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                      {typeData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Room Capacity Utilization</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={roomData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="room" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="utilization" name="Utilization %" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Inventory Tab */}
        <TabsContent value="inventory" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>By Device Type</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={typeData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#0088FE" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>By Status</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                      {statusData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>By Criticality</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={criticalityData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                      {criticalityData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {inventory && inventory.recentlyAdded.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recently Added Devices</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {inventory.recentlyAdded.slice(0, 5).map((device) => (
                    <div key={device.id} className="flex items-center justify-between p-2 border rounded">
                      <span>{device.name}</span>
                      <span className="text-muted-foreground">{device.type}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Capacity Tab */}
        <TabsContent value="capacity" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Racks</CardTitle>
                <HardDrive className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{capacity?.totalRacks || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Used Rack Units</CardTitle>
                <Server className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{capacity?.usedRackUnits || 0} / {capacity?.totalRackUnits || 0}</div>
                <Progress value={capacity?.rackUtilization || 0} className="mt-2" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Power Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{capacity?.powerUtilization.percentage.toFixed(1) || 0}%</div>
                <Progress value={capacity?.powerUtilization.percentage || 0} className="mt-2" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Cooling Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{capacity?.coolingUtilization.percentage.toFixed(1) || 0}%</div>
                <Progress value={capacity?.coolingUtilization.percentage || 0} className="mt-2" />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Room-wise Rack Utilization</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={roomData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="room" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="totalRacks" name="Total Racks" fill="#0088FE" />
                  <Bar dataKey="usedRacks" name="Used Racks" fill="#00C49F" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* VMware Tab */}
        <TabsContent value="vmware" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Clusters</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{vmware?.totalClusters || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">ESXi Hosts</CardTitle>
                <Server className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{vmware?.totalHosts || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Virtual Machines</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{vmware?.totalVMs || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Datastores</CardTitle>
                <HardDrive className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{vmware?.totalDatastores || 0}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Host Resource Utilization</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span>CPU Usage</span>
                      <span>{vmware?.hostCpuUsage.toFixed(1) || 0}%</span>
                    </div>
                    <Progress value={vmware?.hostCpuUsage || 0} />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span>Memory Usage</span>
                      <span>{vmware?.hostMemoryUsage.toFixed(1) || 0}%</span>
                    </div>
                    <Progress value={vmware?.hostMemoryUsage || 0} />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span>Storage Usage</span>
                      <span>{vmware?.hostStorageUsage.toFixed(1) || 0}%</span>
                    </div>
                    <Progress value={vmware?.hostStorageUsage || 0} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>VM Distribution by Cluster</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={vmware?.vmDistribution || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="cluster" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="vmCount" name="VM Count" fill="#0088FE" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Alerts</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{alerts?.totalAlerts || 0}</div>
              </CardContent>
            </Card>
            <Card className="border-red-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-red-500">Critical</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-500">{alerts?.criticalAlerts || 0}</div>
              </CardContent>
            </Card>
            <Card className="border-yellow-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-yellow-500">Warning</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-500">{alerts?.warningAlerts || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Info</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{alerts?.infoAlerts || 0}</div>
              </CardContent>
            </Card>
          </div>

          {alerts && alerts.recentAlerts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Alerts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {alerts.recentAlerts.slice(0, 10).map((alert) => (
                    <div 
                      key={alert.id} 
                      className={`flex items-center justify-between p-3 border rounded ${
                        alert.severity === 'critical' ? 'border-red-500 bg-red-50' :
                        alert.severity === 'warning' ? 'border-yellow-500 bg-yellow-50' :
                        'border-blue-500 bg-blue-50'
                      }`}
                    >
                      <div>
                        <p className="font-medium">{alert.message}</p>
                        <p className="text-sm text-muted-foreground">{alert.device}</p>
                      </div>
                      <span className={`text-sm ${
                        alert.severity === 'critical' ? 'text-red-600' :
                        alert.severity === 'warning' ? 'text-yellow-600' :
                        'text-blue-600'
                      }`}>
                        {alert.severity.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
