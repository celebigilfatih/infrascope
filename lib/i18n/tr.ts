import { apiErrorMessages } from '@/lib/i18n/api-errors.tr';

/** Display labels only. API values, identifiers and saved records retain their original values. */
const labels: Record<string, string> = {
  MAINTENANCE: 'Bakımda', DECOMMISSIONED: 'Devre dışı',
  ADMIN: 'Yönetici', EDITOR: 'Editör', VIEWER: 'İzleyici', USER: 'Kullanıcı', USERS: 'Kullanıcılar', SYSTEM: 'Sistem',
  ACTIVE: 'Aktif', INACTIVE: 'Pasif', SUSPENDED: 'Askıda', PENDING: 'Bekliyor', ACCEPTED: 'Kabul edildi', REVOKED: 'İptal edildi', EXPIRED: 'Süresi doldu', VALID: 'Geçerli', INVALID: 'Geçersiz', WARNING: 'Uyarı', ERROR: 'Hata', SUCCESS: 'Başarılı', FAILED: 'Başarısız', UNKNOWN: 'Bilinmiyor',
  CONNECTED: 'Bağlı', DISCONNECTED: 'Bağlantı kesildi', SYNCING: 'Eşitleniyor', ONLINE: 'Çevrimiçi', OFFLINE: 'Çevrimdışı', ENABLED: 'Etkin', DISABLED: 'Devre dışı', UP: 'Açık', DOWN: 'Kapalı', OPEN: 'Açık', ACKNOWLEDGED: 'Onaylandı', RESOLVED: 'Çözüldü', CLOSED: 'Kapatıldı', ARCHIVED: 'Arşivlendi', HOT: 'Aktif kayıtlar',
  ALARM_CRITICAL: 'Kritik', ALARM_HIGH: 'Yüksek', ALARM_MEDIUM: 'Orta', ALARM_LOW: 'Düşük', ALARM_INFO: 'Bilgi', CRITICAL: 'Kritik', HIGH: 'Yüksek', MEDIUM: 'Orta', LOW: 'Düşük', INFO: 'Bilgi',
  PHYSICAL_SERVER: 'Fiziksel sunucu', VIRTUAL_HOST: 'Sanal sunucu', COMPUTER: 'Bilgisayar', LAPTOP: 'Dizüstü bilgisayar', CAMERA: 'Kamera', PATCH_PANEL: 'Bağlantı paneli', VMWARE_CLUSTER: 'VMware kümesi', VMWARE_DATASTORE: 'VMware veri deposu', RACK_42U: '42U Kabinet', RACK_45U: '45U Kabinet', CUSTOM: 'Özel', SERVER: 'Sunucu', SWITCH: 'Switch', ROUTER: 'Router', FIREWALL: 'Güvenlik duvarı', VM: 'Sanal makine', VIRTUAL_MACHINE: 'Sanal makine', STORAGE: 'Depolama', NETWORK: 'Ağ', OTHER: 'Diğer', LOAD_BALANCER: 'Yük dengeleyici', ACCESS_POINT: 'Erişim noktası', PRINTER: 'Yazıcı', UPS: 'Kesintisiz güç kaynağı',
  GATEWAY: 'Ağ geçidi', MICROSERVICE: 'Mikroservis', QUEUE: 'Kuyruk', SEARCH: 'Arama', PROCESSING: 'İşleme', MONITORING: 'İzleme', BACKUP: 'Yedekleme', PROXY: 'Vekil sunucu', CONTAINER_ORCHESTRATION: 'Konteyner yönetimi', SUPPORTS: 'Destekler', INFORMATIONAL: 'Bilgi', APPLICATION: 'Uygulama', APPLICATIONS: 'Uygulamalar', DATABASE: 'Veritabanı', WEB_SERVER: 'Web sunucusu', APP_SERVER: 'Uygulama sunucusu', FILE_SERVER: 'Dosya sunucusu', MAIL_SERVER: 'E-posta sunucusu', SEARCH_ENGINE: 'Arama motoru', CACHE: 'Önbellek', MESSAGING: 'Mesajlaşma', AUTH: 'Kimlik doğrulama', AUTHENTICATION: 'Kimlik doğrulama',
  DEPENDS_ON: 'Bağımlı', REQUIRES: 'Gerektirir', PROVIDES: 'Sağlar', CONNECTED_TO: 'Bağlı', DEPLOYED_ON: 'Dağıtıldığı kaynak', CONNECTS_TO: 'Bağlanır', HOSTED_ON: 'Üzerinde barındırılır', RUNS_ON: 'Üzerinde çalışır', COMMUNICATES_WITH: 'İletişim kurar', BACKUP_OF: 'Yedeği', LOAD_BALANCES: 'Yük dengeler', REPLICATES_TO: 'Çoğaltılır',
  TRIAL: 'Deneme', STANDARD: 'Standart', ENTERPRISE: 'Kurumsal', GRACE: 'Ek süre', RESTRICTED: 'Kısıtlı',
  DEVICE: 'Cihaz', DEVICES: 'Cihazlar', RACK: 'Kabinet', RACKS: 'Kabinetler', ROOM: 'Oda', ROOMS: 'Odalar', FLOOR: 'Kat', FLOORS: 'Katlar', BUILDING: 'Bina', BUILDINGS: 'Binalar', ORGANIZATION: 'Organizasyon', ORGANIZATIONS: 'Organizasyonlar',
  SERVICE: 'Servis', SERVICES: 'Servisler', DEPENDENCY: 'Bağımlılık', DEPENDENCIES: 'Bağımlılıklar', ALARM: 'Alarm', ALARMS: 'Alarmlar', INCIDENT: 'Olay', INCIDENTS: 'Olaylar', PERMISSION: 'Yetki', PERMISSIONS: 'Yetkiler', SETTINGS: 'Ayarlar', INTEGRATION: 'Entegrasyon', INTEGRATIONS: 'Entegrasyonlar', LICENSE: 'Lisans', NOTIFICATION: 'Bildirim',
  RISK_ANOMALY: 'Risk ve Anomali', SOC_CORRELATION: 'SOC İlişkilendirmesi', OPERATIONAL: 'Operasyonel', SECURITY: 'Güvenlik', PERFORMANCE: 'Performans', AVAILABILITY: 'Erişilebilirlik', CAPACITY: 'Kapasite', CONFIG_ACCESS: 'Yapılandırma erişimi', CONFIG_CHANGE: 'Yapılandırma değişikliği', AUTH_EVENTS: 'Kimlik doğrulama olayları', NETWORK_SECURITY: 'Ağ güvenliği',
  CREATE: 'Oluşturma', ADD: 'Ekleme', MOVE: 'Taşıma', READ: 'Görüntüleme', VIEW: 'Görüntüleme', UPDATE: 'Güncelleme', EDIT: 'Düzenleme', DELETE: 'Silme', EXPORT: 'Dışa aktarma', IMPORT: 'İçe aktarma', LOGIN: 'Oturum açma', LOGOUT: 'Oturum kapatma', SYNC: 'Eşitleme', MANAGE: 'Yönetim', EXECUTE: 'Çalıştırma', TEST: 'Test',
  LOGIN_SUCCESS: 'Başarılı giriş', LOGIN_FAILED: 'Başarısız giriş', PASSWORD_CHANGE: 'Parola değişikliği', PASSWORD_RESET: 'Parola sıfırlama', PASSWORD_SET: 'Parola oluşturma', ACCOUNT_CREATED: 'Hesap oluşturma',
  ASSIGN: 'Atama', ASSIGNMENT: 'Atama', UNASSIGN: 'Atamayı kaldırma', ACKNOWLEDGE: 'Onaylama', RESOLVE: 'Çözme', CLOSE: 'Kapatma', ARCHIVE: 'Arşivleme', RESTORE: 'Geri yükleme', NOTE: 'Not', EXCLUSION: 'Hariç tutma', RETRY: 'Yeniden deneme', ALARMINCIDENT: 'Olay', ALARMDEFINITION: 'Alarm tanımı',
  SSH_HOST_KEY_TRUSTED: 'SSH sunucu anahtarı onaylandı', SSH_HOST_KEY_CHANGED: 'SSH sunucu anahtarı değişti', MASTER: 'Birincil', SLAVE: 'İkincil', STANDALONE: 'Bağımsız',
};
const featureLabels: Record<string, string> = {
  Dashboard: 'Genel Bakış', 'Device Management': 'Cihaz Yönetimi', 'Basic Monitoring': 'Temel İzleme', 'VMware Integration': 'VMware Entegrasyonu', 'Fortinet Integration': 'Fortinet Entegrasyonu', 'Advanced Reports': 'Gelişmiş Raporlar', 'External API': 'Harici API', 'SLA Monitoring': 'SLA İzleme',
};
export function uiLabel(value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value !== 'string') return String(value);
  return labels[value.toUpperCase()] || featureLabels[value] || value;
}

export function auditActionLabel(value: string): string {
  const direct = labels[value.toUpperCase()];
  if (direct) return direct;
  const parts = value.split(/[._:\s-]+/).filter(Boolean);
  // Unknown actions remain identifiable rather than being assigned an invented meaning.
  if (parts.length > 1 && parts.every(part => labels[part.toUpperCase()])) return parts.map(uiLabel).join(' · ');
  return value;
}

export function auditActionQuery(value: string): string {
  const aliases: Record<string, string> = { 'oluşturma': 'create', 'oluştur': 'create', 'güncelleme': 'update', 'düzenleme': 'edit', 'silme': 'delete', 'sil': 'delete', 'giriş': 'login', 'oturum açma': 'login', 'çıkış': 'logout', 'oturum kapatma': 'logout', 'dışa aktarma': 'export', 'içe aktarma': 'import', 'atama': 'assign', 'onaylama': 'acknowledge', 'arşivleme': 'archive' };
  const phrase = value.split('·').pop()?.trim().toLocaleLowerCase('tr-TR') || '';
  return aliases[phrase] || value;
}

export function inputValidationMessage(validity: ValidityState, type?: string): string {
  if (validity.valueMissing) return 'Lütfen bu alanı doldurun.';
  if (validity.typeMismatch) return type === 'email' ? 'Lütfen geçerli bir e-posta adresi girin.' : 'Lütfen geçerli bir adres girin.';
  if (validity.tooShort) return 'Girilen metin çok kısa. Alanın uzunluk koşulunu kontrol edin.';
  if (validity.tooLong) return 'Girilen metin çok uzun. Alanın uzunluk koşulunu kontrol edin.';
  if (validity.rangeUnderflow || validity.rangeOverflow) return 'Lütfen izin verilen aralıkta bir değer girin.';
  if (validity.stepMismatch || validity.badInput) return 'Lütfen geçerli bir sayı girin.';
  if (validity.patternMismatch) return 'Lütfen istenen biçimde bir değer girin.';
  return 'Lütfen geçerli bir değer girin.';
}

const messages: Record<string, string> = {
  'Unauthorized': 'Oturumunuz geçerli değil. Lütfen yeniden giriş yapın.', 'Unauthorized access': 'Bu işlem için oturum açmanız gerekiyor.', 'Forbidden': 'Bu işlem için yetkiniz yok.', 'Forbidden: license admin requires ADMIN role': 'Lisans yönetimi için yönetici yetkisi gerekiyor.',
  'Internal server error': 'Sunucu hatası oluştu. Lütfen yeniden deneyin.', 'API request failed': 'Sunucu isteği tamamlanamadı.', 'Network Error': 'Ağ bağlantısı kurulamadı. Bağlantınızı kontrol edin.', 'Failed to fetch': 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.', 'fetch failed': 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.', 'Load failed': 'Veriler yüklenemedi. Bağlantınızı kontrol edin.', 'Not found': 'Kayıt bulunamadı.', 'Unknown error': 'Bilinmeyen bir hata oluştu.', 'An unexpected error occurred': 'Beklenmeyen bir hata oluştu.', 'Validation failed': 'Girilen bilgileri kontrol edin.', 'Invalid JSON body': 'İstek verisi geçersiz.', 'Request aborted': 'İstek iptal edildi.',
  'Name is required': 'Ad zorunludur.', 'Email is required': 'E-posta adresi zorunludur.', 'Name, email, and password are required': 'Ad, e-posta adresi ve parola zorunludur.', 'Invalid email address': 'Geçerli bir e-posta adresi girin.', 'Email already exists': 'Bu e-posta adresi zaten kullanılıyor.', 'Invalid email or password': 'E-posta adresi veya parola hatalı.', 'Password is required': 'Parola zorunludur.', 'Current password is required': 'Mevcut parola zorunludur.', 'Current password is incorrect': 'Mevcut parola hatalı.', 'Password does not meet requirements': 'Parola güvenlik koşullarını karşılamıyor.', 'New password does not meet requirements': 'Yeni parola güvenlik koşullarını karşılamıyor.', 'Password does not meet requirements or confirmation does not match': 'Parola güvenlik koşullarını karşılamıyor veya parola doğrulaması eşleşmiyor.', 'Password must be at least 8 characters': 'Parola en az 8 karakter olmalıdır.', 'Password must be no more than 72 characters': 'Parola en fazla 72 karakter olmalıdır.', 'New password must be at least 8 characters': 'Yeni parola en az 8 karakter olmalıdır.', 'User ID is required': 'Kullanıcı kimliği zorunludur.', 'User ID required': 'Kullanıcı kimliği zorunludur.', 'User not found': 'Kullanıcı bulunamadı.', 'Cannot delete the last admin user': 'Son yönetici hesabı silinemez.', 'User limit reached': 'Lisansın kullanıcı limitine ulaşıldı.', 'No password set. Please use invitation link.': 'Parola henüz oluşturulmadı. Lütfen davet bağlantısını kullanın.',
  'Token is required': 'Doğrulama kodu zorunludur.', 'Token expired': 'Doğrulama bağlantısının süresi doldu.', 'Invalid token': 'Doğrulama kodu geçersiz.', 'Invalid or expired token': 'Doğrulama bağlantısı geçersiz veya süresi dolmuş.', 'Invalid or expired reset token': 'Parola sıfırlama bağlantısı geçersiz veya süresi dolmuş.', 'Invalid invitation': 'Davet geçersiz.', 'Invalid invitation token': 'Davet bağlantısı geçersiz.', 'No invitation token provided': 'Davet bağlantısında doğrulama kodu yok.', 'No reset token provided': 'Parola sıfırlama bağlantısında doğrulama kodu yok.', 'Token, name, and password are required': 'Doğrulama kodu, ad ve parola zorunludur.', 'Password reset email sent': 'Parola sıfırlama e-postası gönderildi.',
  'Please enter a license key': 'Lütfen lisans anahtarını girin.', 'Invalid license key': 'Lisans anahtarı geçersiz.', 'Invalid license status': 'Lisans durumu geçersiz.', 'Invalid activation status': 'Etkinleştirme durumu geçersiz.', 'Invalid tier': 'Lisans planı geçersiz.', 'Invalid tier or status': 'Lisans planı veya durumu geçersiz.', 'Invalid validUntil date': 'Lisans bitiş tarihi geçersiz.', 'No active activation found': 'Aktif lisans etkinleştirmesi bulunamadı.', 'No active activation found for this machine': 'Bu makine için aktif lisans etkinleştirmesi bulunamadı.', 'Failed to activate license. Please try again.': 'Lisans etkinleştirilemedi. Lütfen yeniden deneyin.',
  'Name and code are required': 'Ad ve kod zorunludur.', 'Name and floorId are required': 'Ad ve kat seçimi zorunludur.', 'Name and organizationId are required': 'Ad ve organizasyon seçimi zorunludur.', 'Name and roomId are required': 'Ad ve oda seçimi zorunludur.', 'Name and type are required': 'Ad ve tür zorunludur.', 'Name must be a non-empty string (max 255 characters)': 'Ad zorunludur ve en fazla 255 karakter olabilir.', 'Cannot delete building with active building connection(s). Delete building connections first.': 'Aktif bağlantıları olan bina silinemez. Önce bina bağlantılarını kaldırın.', 'Cannot compute diff': 'Yapılandırma farkı hesaplanamadı.', 'Invalid port number': 'Port numarası geçersiz.', 'Invalid action': 'İşlem geçersiz.', 'Invalid operation': 'İşlem geçersiz.', 'Invalid data type': 'Veri türü geçersiz.', 'Invalid report type': 'Rapor türü geçersiz.', 'No organization found': 'Organizasyon bulunamadı.',
  'Password missing from saved config — please re-enter and save': 'Kayıtlı yapılandırmada parola yok. Parolayı yeniden girip kaydedin.', 'Please fill in vCenter Host and Username before syncing.': 'Eşitlemeden önce vCenter sunucusunu ve kullanıcı adını girin.', 'Host and username are required for connection test.': 'Bağlantı testi için sunucu ve kullanıcı adı zorunludur.', 'Host and username are required.': 'Sunucu ve kullanıcı adı zorunludur.', 'Invalid API URL': 'API adresi geçersiz.', 'Invalid login': 'Kimlik bilgileri geçersiz.', 'No enabled VMware integration found in database': 'Etkin VMware entegrasyonu bulunamadı.', 'VMware vCenter integration not configured': 'VMware vCenter entegrasyonu yapılandırılmadı.', 'No VMware data found': 'VMware verisi bulunamadı.', 'Port list not found': 'Port listesi bulunamadı.', 'Port details not found': 'Port detayları bulunamadı.', 'An inventory sync is already running for this source type': 'Bu kaynak türü için envanter eşitlemesi zaten çalışıyor.',
  'No recent polling activity': 'Yakın zamanda veri toplama işlemi yapılmadı.', 'No SNMP health metric has been collected yet': 'Henüz SNMP kaynak ölçümü alınmadı.', 'No SNMP interface metric has been collected yet': 'Henüz SNMP arayüz ölçümü alınmadı.', 'No completed NMS interface observation is available': 'Tamamlanmış NMS arayüz ölçümü yok.', 'No active SSL-VPN users found': 'Aktif SSL-VPN kullanıcısı bulunamadı.', 'No firewall policies found': 'Güvenlik duvarı politikası bulunamadı.', 'No events in time range': 'Seçili zaman aralığında olay yok.', 'No events returned from API': 'API olay kaydı döndürmedi.', 'No working Events API endpoint found': 'Çalışan olay API adresi bulunamadı.', 'Internal NMS authentication failed': 'NMS servis kimlik doğrulaması başarısız.', 'Internal NMS authentication is not configured': 'NMS servis kimlik doğrulaması yapılandırılmadı.',
};
Object.assign(messages, {
  Error: 'Hata', Success: 'Başarılı', 'Host is required': 'Sunucu adresi zorunludur.', 'Username is required': 'Kullanıcı adı zorunludur.', 'SMTP host is required': 'SMTP sunucusu zorunludur.', 'SMTP user is required': 'SMTP kullanıcı adı zorunludur.', 'At least one alarm ID is required': 'En az bir alarm seçin.', 'At least one recipient is required': 'En az bir alıcı ekleyin.', 'Invalid action. Supported: correlate': 'İşlem geçersiz. Desteklenen işlem: ilişkilendirme.',
});
const subjects: Record<string, string> = {
  user: 'Kullanıcı', users: 'Kullanıcılar', account: 'Hesap', password: 'Parola', invitation: 'Davet', token: 'Doğrulama kodu', 'license': 'Lisans', licenses: 'Lisanslar', 'license detail': 'Lisans detayı', 'license information': 'Lisans bilgileri', 'license status': 'Lisans durumu', activation: 'Etkinleştirme', summary: 'Özet',
  device: 'Cihaz', devices: 'Cihazlar', 'NMS devices': 'İzlenen cihazlar', 'NMS status': 'NMS durumu', 'device NMS data': 'Cihazın izleme verileri', 'device NMS config': 'Cihaz izleme yapılandırması', 'monitored status': 'İzleme durumu', 'NMS monitoring': 'Cihaz izlemesi',
  organization: 'Organizasyon', organizations: 'Organizasyonlar', building: 'Bina', buildings: 'Binalar', floor: 'Kat', floors: 'Katlar', room: 'Oda', rooms: 'Odalar', rack: 'Kabinet', racks: 'Kabinetler', 'rack devices': 'Kabinet cihazları', 'locations summary': 'Konum özeti',
  service: 'Servis', services: 'Servisler', dependency: 'Bağımlılık', dependencies: 'Bağımlılıklar', 'building connection': 'Bina bağlantısı', 'building connections': 'Bina bağlantıları', 'network connection': 'Ağ bağlantısı', 'network connections': 'Ağ bağlantıları',
  alarm: 'Alarm', alarms: 'Alarmlar', permissions: 'Yetkiler', 'audit logs': 'Denetim kayıtları', 'configuration backup': 'Yapılandırma yedeği', 'firewall policies': 'Güvenlik politikaları', 'port details': 'Port detayları', 'topology status': 'Topoloji durumu', 'suppression stats': 'Bastırma istatistikleri', 'suppression rule': 'Bastırma kuralı', 'whitelist': 'Hariç tutulan kayıtlar', 'whitelist entry': 'Hariç tutma kaydı',
  firewalls: 'Güvenlik duvarları', 'firewall connector': 'Güvenlik duvarı bağlantısı', 'firewall recovery status': 'Güvenlik duvarı kurtarma durumu', 'FortiGate integration': 'FortiGate entegrasyonu', 'setup status': 'Kurulum durumu', 'discovery scan': 'Keşif taraması', 'discovery scans': 'Keşif taramaları', 'scan details': 'Tarama detayları',
  'vCenter': 'vCenter bağlantısı', 'FortiAnalyzer': 'FortiAnalyzer bağlantısı', 'status': 'Durum', 'ADOMs': 'ADOM bilgileri', 'FortiView': 'FortiView verileri', 'MITRE technique': 'MITRE tekniği', 'config logs': 'Yapılandırma günlükleri', 'config revisions': 'Yapılandırma geçmişi', 'interface stats': 'Arayüz istatistikleri', interfaces: 'Arayüzler', VLANs: 'VLAN kayıtları', VIPs: 'Sanal IP adresleri', addresses: 'Adres nesneleri', 'SD-WAN': 'SD-WAN verileri', 'HA status': 'HA durumu', 'SSL-VPN users': 'SSL-VPN kullanıcıları', 'IPsec tunnels': 'IPsec tünelleri', 'quarantined IPs': 'Karantinadaki IP adresleri',
  'email': 'E-posta', 'invitation email': 'Davet e-postası', 'password reset email': 'Parola sıfırlama e-postası', 'configuration': 'Yapılandırma', 'configuration.': 'Yapılandırma', 'config': 'Yapılandırma', 'report': 'Rapor',
};
const verbs: Record<string, string> = { fetch: 'alınamadı', get: 'alınamadı', load: 'yüklenemedi', create: 'oluşturulamadı', update: 'güncellenemedi', delete: 'silinemedi', send: 'gönderilemedi', validate: 'doğrulanamadı', activate: 'etkinleştirilemedi', reset: 'sıfırlanamadı', change: 'değiştirilemedi', remove: 'kaldırılamadı', save: 'kaydedilemedi', generate: 'oluşturulamadı', import: 'içe aktarılamadı', start: 'başlatılamadı', list: 'listelenemedi', enable: 'etkinleştirilemedi', register: 'kaydedilemedi' };

/** Localize messages at display boundaries; keep original API payloads and diagnostic codes intact. */
export function uiError(value: unknown, fallback = 'İşlem tamamlanamadı. Lütfen yeniden deneyin.'): string {
  if (value == null || value === '') return '';
  if (value instanceof Error) return uiError(value.message, fallback);
  if (Array.isArray(value)) return value.map(item => uiError(item, fallback)).filter(Boolean).join(' ');
  if (typeof value === 'object') {
    const issue = value as { message?: unknown; error?: unknown; issues?: unknown };
    return uiError(issue.message || issue.error || issue.issues || fallback, fallback);
  }
  const text = String(value).trim();
  if (messages[text]) return messages[text];
  if (apiErrorMessages[text]) return apiErrorMessages[text];
  if (text.startsWith('[')) { try { const issues: unknown = JSON.parse(text); if (Array.isArray(issues)) return uiError(issues, fallback); } catch { /* Not a validation issue list. */ } }
  const operation = /^Failed to (\w+) (.+?)[.!]?$/.exec(text);
  if (operation && verbs[operation[1]] && subjects[operation[2]]) return `${subjects[operation[2]]} ${verbs[operation[1]]}.`;
  const status = /^Request failed with status code (\d{3})$/.exec(text);
  if (status) return `Sunucu isteği tamamlanamadı (HTTP ${status[1]}).`;
  const timeout = /^timeout of (\d+)ms exceeded$/i.exec(text);
  if (timeout || /^(The operation was aborted|The user aborted a request|This operation was aborted)/.test(text)) return 'İstek zaman aşımına uğradı veya iptal edildi. Lütfen yeniden deneyin.';
  if (/^(NetworkError|TypeError: Failed to fetch|getaddrinfo|connect ECONN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND)/.test(text)) return 'Sunucuya ulaşılamadı. Ağ bağlantısını ve sunucu adresini kontrol edin.';
  if (/^Invalid input: expected /.test(text)) return 'Girilen değer geçersiz. Alanın biçimini kontrol edin.';
  if (/^Invalid option: expected /.test(text)) return 'Lütfen geçerli bir seçenek seçin.';
  if (/^(Error|Hata):\s*/.test(text)) return `Hata: ${uiError(text.replace(/^(Error|Hata):\s*/, ''), fallback)}`;
  // Raw source diagnostics and unknown codes stay recognizable; do not guess their meaning.
  return text;
}
