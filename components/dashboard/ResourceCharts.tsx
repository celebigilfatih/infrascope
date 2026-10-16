'use client';
import { useMemo } from 'react';
import { Area, AreaChart, Bar, Cell, ComposedChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, CartesianGrid } from 'recharts';
import type { DashboardAnalytics, DashboardRange, ResourceMetric } from './types';
import { percentLabel } from '@/lib/dashboard/presentation';
import styles from './dashboard.module.css';

function axisTime(at: string, range: DashboardRange) {
  return new Intl.DateTimeFormat('tr-TR', range === '7d' ? { day: '2-digit', month: 'short' } : { hour: '2-digit', minute: '2-digit' }).format(new Date(at));
}
export function ResourceBars({ analytics, metric }: { analytics: DashboardAnalytics; metric: ResourceMetric }) {
  const data = analytics.points.map(point => ({ at: point.at, value: point[metric], peak: point[metric === 'cpu' ? 'cpuPeak' : 'memoryPeak'] }));
  const max = Math.max(...data.map(point => point.value ?? -1));
  return <div className={styles.chart} role="img" aria-label={`${analytics.device?.name || 'Cihaz'} ${metric === 'cpu' ? 'CPU' : 'bellek'} kullanım geçmişi. Eksik ölçümler boş gösterilir.`}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <ComposedChart data={data} barGap="-100%" margin={{ top: 8, right: 5, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--dash-line)" strokeDasharray="3 5" />
        <XAxis dataKey="at" tickFormatter={at => axisTime(at, analytics.range)} axisLine={false} tickLine={false} tick={{ fill: 'var(--dash-muted)', fontSize: 10 }} minTickGap={24} />
        <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={value => `${value}%`} axisLine={false} tickLine={false} width={42} tick={{ fill: 'var(--dash-muted)', fontSize: 10 }} />
        <Tooltip labelFormatter={at => new Date(String(at)).toLocaleString('tr-TR')} formatter={value => percentLabel(typeof value === 'number' ? value : null)} contentStyle={{ borderRadius: 12, border: '1px solid var(--dash-line)', fontSize: 12, background: 'var(--dash-card)', color: 'var(--dash-ink)' }} cursor={{ fill: 'var(--dash-mint)', fillOpacity: .4 }} />
        <Bar dataKey="peak" name="Zirve" fill="var(--dash-peak)" radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={30} />
        <Bar dataKey="value" name="Ortalama" radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={30}>
          {data.map((point, index) => <Cell key={point.at} fill={point.value !== null && point.value === max && index === data.findIndex(item => item.value === max) ? '#f2bb40' : 'var(--dash-green-mid)'} />)}
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  </div>;
}
export function ResourceSparkline({ analytics, metric }: { analytics: DashboardAnalytics; metric: ResourceMetric }) {
  return <div className={styles.sparkline} role="img" aria-label={`${metric === 'cpu' ? 'CPU' : 'Bellek'} geçmişi`}><ResponsiveContainer width="100%" height="100%" minWidth={0}>
    <AreaChart data={analytics.points} margin={{ top: 2, right: 2, left: 0, bottom: 0 }}>
      <XAxis dataKey="at" hide /><YAxis domain={[0, 100]} hide />
      <Tooltip labelFormatter={at => axisTime(String(at), analytics.range)} formatter={value => percentLabel(typeof value === 'number' ? value : null)} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--dash-line)', background: 'var(--dash-card)', color: 'var(--dash-ink)' }} />
      <Area type="monotone" dataKey={metric} name={metric === 'cpu' ? 'CPU' : 'Bellek'} stroke="var(--dash-green)" strokeWidth={1.7} fill="var(--dash-green-soft)" fillOpacity={.2} connectNulls={false} isAnimationActive={false} />
    </AreaChart>
  </ResponsiveContainer></div>;
}
export function CoveragePlot({ monitored, total }: { monitored: number; total: number }) {
  const dots = useMemo(() => {
    const count = 120;
    const active = total ? Math.round(Math.min(1, monitored / total) * count) : 0;
    return Array.from({ length: count }, (_, index) => {
      const row = Math.floor(index / 40); const angle = Math.PI - (index % 40) / 39 * Math.PI;
      const radius = 94 - row * 13;
      return { x: 100 + radius * Math.cos(angle), y: 12 + radius * Math.sin(angle), active: (index % 40) * 3 + row < active, row };
    });
  }, [monitored, total]);
  return <div className={styles.coveragePlot} role="img" aria-label={`${total} ağ cihazının ${monitored} tanesinde izleme açık. Bu oran erişilebilirlik oranı değildir.`}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0}><ScatterChart margin={{ top: 5, bottom: 0, left: 0, right: 0 }}>
      <XAxis type="number" dataKey="x" domain={[0, 200]} hide /><YAxis type="number" dataKey="y" domain={[0, 115]} hide /><ZAxis range={[110, 110]} />
      <Scatter data={dots} isAnimationActive={false}>{dots.map((dot, index) => <Cell key={index} fill={dot.active ? ['var(--dash-green)', 'var(--dash-green-mid)', 'var(--dash-green-soft)'][dot.row] : 'var(--dash-peak)'} />)}</Scatter>
    </ScatterChart></ResponsiveContainer>
    <div className={styles.coverageCenter}><p>İzleme kapsamı</p><strong>{monitored} / {total}</strong><span>{total ? percentLabel(monitored / total * 100) : '—'}</span></div>
  </div>;
}
