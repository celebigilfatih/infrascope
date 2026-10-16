import { sectionIcons, type PageSection } from '@/components/ui/page-heading';

export interface NavigationItem { name: string; href: string; section: PageSection }
export interface NavigationSection { id: string; title: string; items: NavigationItem[] }

// Stable IDs preserve saved section preferences when display labels change.
export const customerNavigation: NavigationSection[] = [
  { id: 'Dashboard', title: 'Genel Bakış', items: [
    { name: 'Genel Sağlık', href: '/dashboard', section: 'dashboard' },
    { name: 'Olay Merkezi', href: '/dashboard/alerts', section: 'incidents' },
  ] },
  { id: 'Infrastructure', title: 'Fiziksel Altyapı', items: [
    { name: 'Konumlar ve Odalar', href: '/locations', section: 'locations' },
    { name: 'Kabinetler', href: '/racks', section: 'racks' },
    { name: 'Cihaz Envanteri', href: '/devices', section: 'devices' },
  ] },
  { id: 'Virtualization', title: 'Sanallaştırma', items: [
    { name: 'Kümeler', href: '/virtualization/clusters', section: 'clusters' },
    { name: 'ESXi Sunucuları', href: '/virtualization/hosts', section: 'hosts' },
    { name: 'Sanal Makineler', href: '/virtualization/vms', section: 'vms' },
    { name: 'Veri Depoları', href: '/virtualization/datastores', section: 'datastores' },
    { name: 'Anlık Görüntüler', href: '/virtualization/snapshots', section: 'snapshots' },
  ] },
  { id: 'Network', title: 'Ağ Yönetimi', items: [
    { name: 'Ağ Topolojisi', href: '/network', section: 'network' },
    { name: 'İzlenen Cihazlar', href: '/integrations/nms/devices', section: 'nms' },
    { name: 'Cihazı İzlemeye Al', href: '/integrations/nms/add-device', section: 'addDevice' },
    { name: 'Yapılandırma Yedekleri', href: '/integrations/nms/backups', section: 'backups' },
  ] },
  { id: 'Security', title: 'Güvenlik', items: [
    { name: 'Güvenlik Duvarı', href: '/network/firewall', section: 'firewall' },
    { name: 'Yapılandırma Geçmişi', href: '/network/config-revisions', section: 'revisions' },
    { name: 'Sanal IP Adresleri', href: '/security/virtual-ips', section: 'virtualIps' },
    { name: 'Web Analizi', href: '/security/web-analytics', section: 'webAnalytics' },
    { name: 'Karantina', href: '/security/quarantine', section: 'quarantine' },
    { name: 'Güvenlik Politikaları', href: '/security/policies', section: 'policies' },
    { name: 'IPsec Tünelleri', href: '/network/ipsec', section: 'ipsec' },
    { name: 'SSL-VPN Oturumları', href: '/network/ssl-vpn', section: 'vpn' },
    { name: 'Riskli Kurallar', href: '/security/risks', section: 'risks' },
  ] },
  { id: 'Services', title: 'Servisler', items: [
    { name: 'Uygulamalar', href: '/services/apps', section: 'applications' },
    { name: 'Servisler', href: '/services', section: 'services' },
    { name: 'Bağımlılıklar', href: '/services/dependencies', section: 'dependencies' },
  ] },
  { id: 'Integrations', title: 'Entegrasyonlar', items: [
    { name: 'VMware', href: '/integrations/vmware', section: 'vmware' },
    { name: 'Güvenlik Duvarları', href: '/integrations/firewall', section: 'firewall' },
    { name: 'FortiAnalyzer', href: '/integrations/fortianalyzer', section: 'fortianalyzer' },
    { name: 'Entegrasyon Durumu', href: '/integrations/status', section: 'integrations' },
  ] },
  { id: 'Settings', title: 'Ayarlar', items: [
    { name: 'Organizasyonlar', href: '/settings/organizations', section: 'organizations' },
    { name: 'Kullanıcılar ve Roller', href: '/settings/users', section: 'users' },
    { name: 'Davetler', href: '/settings/users/invitations', section: 'invitations' },
    { name: 'Denetim Kayıtları', href: '/settings/audit', section: 'audit' },
    { name: 'Alarm Kuralları', href: '/settings/alerts', section: 'alerts' },
    { name: 'API Anahtarları', href: '/settings/keys', section: 'keys' },
    { name: 'Lisans', href: '/settings/license', section: 'license' },
  ] },
];

export const licenseNavigation: NavigationSection[] = [
  { id: 'License Control', title: 'Lisans Yönetimi', items: [
    { name: 'Lisans Yönetimi', href: '/license-admin', section: 'license' },
    { name: 'Kullanıcılar ve Roller', href: '/settings/users', section: 'users' },
  ] },
];

const extraRoutes: NavigationItem[] = [
  { name: 'Riskli Varlıklar', href: '/dashboard/risks', section: 'risks' },
  { name: 'Güç ve Kapasite', href: '/infrastructure/capacity', section: 'power' },
  { name: 'Kapasite Eğilimleri', href: '/analytics/capacity', section: 'capacity' },
  { name: 'Kapasite Tahminleri', href: '/analytics/forecast', section: 'forecast' },
  { name: 'Atıl Sanal Makine Analizi', href: '/analytics/sprawl', section: 'sprawl' },
  { name: 'Raporlar ve Analiz', href: '/reports', section: 'reports' },
  { name: 'IPS / DoS Olayları', href: '/security/ips', section: 'risks' },
];

export function findNavigationItem(pathname: string, sections = [...customerNavigation, ...licenseNavigation]) {
  return [...sections.flatMap(section => section.items), ...extraRoutes]
    .filter(item => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export function navigationIcon(section?: PageSection) { return sectionIcons[section || 'dashboard']; }
