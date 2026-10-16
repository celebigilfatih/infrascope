import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import {
  Activity, Archive, BarChart3, BellRing, Boxes, Building2, Cable, ChartNoAxesCombined,
  ClipboardList, Database, FileClock, GitBranch, Globe, HardDrive, KeyRound, Layers,
  LayoutDashboard, Mail, MapPin, Monitor, Network, Plus, Radio, Server, Settings2,
  Shield, ShieldAlert, ShieldCheck, SquareStack, TrendingUp, UsersRound, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import styles from './page-heading.module.css';

export const sectionIcons = {
  dashboard: LayoutDashboard, incidents: BellRing, devices: Monitor, locations: MapPin,
  rooms: Building2, racks: Server, clusters: Layers, hosts: Server, vms: SquareStack,
  datastores: HardDrive, snapshots: Archive, network: Network, firewall: Shield,
  revisions: FileClock, ipsec: Cable, vpn: ShieldCheck, virtualIps: Globe,
  webAnalytics: ChartNoAxesCombined, quarantine: ShieldAlert, policies: ClipboardList,
  risks: ShieldAlert, services: Boxes, applications: Boxes, dependencies: GitBranch,
  integrations: Radio, vmware: Layers, fortianalyzer: Activity, nms: Network,
  addDevice: Plus, backups: Archive, organizations: Building2, users: UsersRound,
  invitations: Mail, audit: FileClock, alerts: BellRing, keys: KeyRound,
  license: KeyRound, capacity: Database, forecast: TrendingUp, sprawl: Boxes,
  reports: BarChart3, power: Zap, settings: Settings2,
};
export type PageSection = keyof typeof sectionIcons;

interface PageHeadingProps extends ComponentPropsWithoutRef<'h1'> {
  section: PageSection;
  description?: ReactNode;
  compact?: boolean;
  showIcon?: boolean;
}

/** Shared application page identity; descriptions and actions remain ordinary content. */
export function PageHeading({ section, children, description, className, compact, showIcon = true, ...props }: PageHeadingProps) {
  const Icon = sectionIcons[section];
  return <div className={cn(styles.heading, compact && styles.compact, !showIcon && styles.withoutIcon)} data-page-heading={section}>
    {showIcon && <span className={styles.icon}><Icon aria-hidden="true" size={24} /></span>}
    <div className={styles.content}>
      <h1 className={cn(styles.title, className)} {...props}>{children}</h1>
      {description && <p className={styles.description}>{description}</p>}
    </div>
  </div>;
}

/** Retains page identity while a screen shows its own loading, empty or error state. */
export function PageStateFrame({ section, title, children }: { section: PageSection; title: string; children: ReactNode }) {
  return <div className="min-w-0">
    <div className="px-4 pt-6 sm:px-6 lg:px-8"><PageHeading section={section}>{title}</PageHeading></div>
    {children}
  </div>;
}
