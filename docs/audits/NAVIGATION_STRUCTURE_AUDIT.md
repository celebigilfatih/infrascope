# InfraScope Navigation Structure Audit

## Menü Yapısı Merkezi Mi?

Kısmen merkezi.

Ana sidebar menüleri `components/layout/Sidebar.tsx` içinde tanımlanıyor. Bu dosyada iki ayrı menü seti var:

- `customerSections`: müşteri/on-prem uygulama menüleri
- `licenseServerSections`: merkezi lisans sunucusu menüleri

Ancak proje genelinde gerçek anlamda merkezi bir navigation config dosyası bulunmuyor. `navigation.ts`, `menu.config.ts`, `routes.ts` veya benzeri tek kaynaklı bir menü/route metadata dosyası yok.

Header, profile popover, bazı dashboard kart linkleri ve NMS breadcrumb linkleri sidebar içindeki menü tanımlarından beslenmiyor; kendi component/page dosyalarında hardcoded durumda.

## Merkezi Dosya Varsa Yolu

Dedicated merkezi navigation config dosyası yok.

De facto sidebar kaynağı:

```text
components/layout/Sidebar.tsx
```

## Hardcoded Menü Kullanılan Dosyalar

| Dosya | Kullanım |
| --- | --- |
| `components/layout/Sidebar.tsx` | Ana müşteri menüsü ve lisans sunucusu menüsü hardcoded. |
| `components/layout/UserProfile.tsx` | Profile popover linkleri hardcoded: `/settings/users`, `/settings/keys`, `/settings/users/invitations`, `/login`. |
| `app/dashboard/page.tsx` | Dashboard içi kart/link navigasyonları hardcoded. Özellikle `/integrations/nms` linkleri gerçek page route ile uyuşmuyor. |
| `app/integrations/nms/add-device/page.tsx` | Cancel aksiyonu `router.push('/integrations/nms')` kullanıyor. |
| `app/integrations/nms/devices/[id]/page.tsx` | Inline breadcrumb var: `NMS -> Devices -> Device`; `NMS` linki `/integrations/nms` path'ine gidiyor. |

## Sidebar Dosyası

Sidebar component:

```text
components/layout/Sidebar.tsx
```

Render edildiği shell:

```text
components/layout/LayoutShell.tsx
```

`LayoutShell`, auth/setup sayfaları dışında `Sidebar` ve `Header` componentlerini tüm uygulama layout'una yerleştiriyor.

Sidebar davranışı:

- Customer/on-prem ve license-server menü ayrımı aynı component içinde yapılıyor.
- License-server mode bilgisi client-side `GET /api/setup/status` çağrısından okunuyor.
- Sidebar collapse state ve section collapse state `localStorage` içinde tutuluyor.
- Aktif route `usePathname()` ile belirleniyor.

## Header/Topbar Dosyası

Header/topbar component:

```text
components/layout/Header.tsx
```

Render edildiği shell:

```text
components/layout/LayoutShell.tsx
```

Header bir menü kaynağı değil. Şu içerikleri barındırıyor:

- Notification button/popover
- Compact `UserProfile`

Header tarafında ana navigation item listesi bulunmuyor.

## Mobile Menu Dosyası

Ayrı bir mobile menu dosyası bulunmadı.

Mevcut yapı:

- `components/layout/Sidebar.tsx` collapse/expand destekliyor.
- Ayrı hamburger, sheet, drawer veya mobile-specific navigation component bulunmuyor.
- `LayoutShell` içinde responsive mobile navigation ayrımı yapılmıyor.

## Breadcrumb Kaynağı

Merkezi breadcrumb sistemi bulunmadı.

Tespit edilen inline breadcrumb:

```text
app/integrations/nms/devices/[id]/page.tsx
```

Bu sayfada breadcrumb manuel yazılmış:

```text
NMS / Devices / {device.name}
```

Diğer sayfalarda ortak `Breadcrumb` componenti veya route metadata tabanlı breadcrumb kaynağı görünmüyor.

## Route Uyuşmazlıkları

Aktif sidebar linkleri mevcut `app/**/page.tsx` route'larıyla eşleşiyor.

Sidebar dışında gerçek page route'u olmayan hardcoded path:

```text
/integrations/nms
```

Bu path şu dosyalarda kullanılıyor:

| Dosya | Kullanım |
| --- | --- |
| `app/dashboard/page.tsx` | NMS dashboard kartları `/integrations/nms` linkine gidiyor. |
| `app/integrations/nms/add-device/page.tsx` | Cancel aksiyonu `/integrations/nms` path'ine yönleniyor. |
| `app/integrations/nms/devices/[id]/page.tsx` | Breadcrumb içindeki `NMS` linki `/integrations/nms` path'ine gidiyor. |

Mevcut gerçek NMS page route'ları:

```text
/integrations/nms/add-device
/integrations/nms/backups
/integrations/nms/devices
/integrations/nms/devices/[id]
/integrations/nms/devices/[id]/edit
```

Ancak şu route yok:

```text
/integrations/nms
```

Sidebar'da doğal olarak listelenmeyen ama gerçek route olan detay sayfaları:

```text
/integrations/nms/devices/[id]
/integrations/nms/devices/[id]/edit
```

Sidebar dışında kalan ama bunun tek başına hata olmadığı route'lar:

```text
/
/login
/logout
/reports
/reset-password
/setup
/verify
```

Not: Sidebar içinde comment-out edilmiş route'lar mevcut ama aktif menü değildir:

```text
/analytics/capacity
/analytics/forecast
/analytics/sprawl
/dashboard/risks
/infrastructure/capacity
/security/ips
```

## Permission/Role Bazlı Menü Görünürlüğü

Sidebar item seviyesinde role/permission bazlı görünürlük bulunmuyor.

Menü ayrımı role'a göre değil deployment mode'a göre yapılıyor:

- Customer/on-prem mode: customer sidebar menüleri
- License-server mode: license admin + merkezi admin menüleri

Route/API authorization tarafı:

```text
middleware.ts
lib/auth/permissions.ts
```

`middleware.ts` içinde API permission mapping şu yapı ile yapılıyor:

```text
ROUTE_RESOURCE_MAP
```

`lib/auth/permissions.ts` içinde static default permission matrix ve DB-backed permission helper'ları var.

Önemli ayrım:

- UI menü görünürlüğü permission matrix'ten beslenmiyor.
- Middleware/API authorization permission matrix'ten ayrı çalışıyor.
- Dolayısıyla bir kullanıcının menüde gördüğü item ile API erişim yetkisi aynı merkezi kaynaktan türetilmiyor.

## Önerilen Düzenleme

1. Merkezi navigation config oluştur:

```text
lib/navigation.ts
```

veya

```text
config/navigation.ts
```

2. Sidebar, profile menu, breadcrumb ve dashboard quick links aynı route metadata kaynağından beslensin.

3. Her navigation item için standart metadata alanları tanımlansın:

```ts
{
  label: string;
  href: string;
  icon?: string;
  section?: string;
  modes: Array<'customer' | 'license-server'>;
  requiredPermission?: {
    resource: string;
    action: 'read' | 'write' | 'delete';
  };
  showInSidebar?: boolean;
  showInBreadcrumb?: boolean;
}
```

4. `/integrations/nms` uyuşmazlığı için tek karar uygulanmalı:

- Ya gerçek `/integrations/nms` landing page oluşturulmalı.
- Ya da mevcut hardcoded linklerin tamamı `/integrations/nms/devices` path'ine taşınmalı.

5. Mobile navigation gerekiyorsa aynı merkezi config'i kullanan ayrı bir `MobileNavigation` componenti eklenmeli.

6. UI permission visibility merkezi navigation metadata üzerinden uygulanmalı; güvenlik enforcement yine middleware/API guard tarafında kalmalı.

