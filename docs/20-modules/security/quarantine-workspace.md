# Karantina çalışma alanı

`/security/quarantine`, FortiGate karantina listesini seçilen bağlantı ve VDOM kapsamında gösterir. Cihaz seçimi, IP/neden/hizmet araması, kaynak ve bitiş zamanı filtreleri ile 10 kayıtlık sayfalama bulunur. Masaüstünde tablo, dar ekranlarda kartlar ve kaydırılabilir ayrıntı pencereleri kullanılır; açık/koyu tema ortak bileşenlerden gelir.

## Kaynak ve süre bilgisi

- `/api/firewalls` yalnızca kayıtlı bağlantıları okur; tarama veya eşitleme başlatmaz.
- `/api/security/quarantine?configId=…&vdom=…&expectedHost=…`, ortak FortiGate bağlayıcısı üzerinden `/monitor/user/banned` listesini okur. Yanıtın bağlantı, sunucu ve VDOM kapsamı istemcide doğrulanır. Kayıt başka VDOM bildiriyorsa liste reddedilir.
- Eksik/bozuk liste başarılı boş sonuç sayılmaz. Eksik kaynak, durum, tarih veya arabirim için varsayımsal değer üretilmez. Özellikle eksik, sıfır veya geçersiz bitiş zamanı **süresiz** sayılmaz.
- Bitiş tarihi geçmiş olup kaynak listesinde bulunan kayıt, kaldırılmış olarak sunulmaz. Tüm tarihler TSİ ile gösterilir; kalan süre 30 saniyede bir güncellenir.
- Başarısız yenilemede önceki liste açıkça etiketlenir. Cihaz değişiminde önceki cihazın verisi taşınmaz. Bekleyen okumalar iptal edilir; geç gelen yanıtlar sıra ve kapsam denetiminden geçer.

## Ekleme ve kaldırma

Mevcut geçici yazma sözleşmesi korunur: güncel ADMIN hesabı, `FORTIGATE_LEGACY_WRITES_ENABLED=true` ve kaynak isteğinden önce başarılı denetim kaydı rezervasyonu gerekir. Varsayılan kapalı durum değiştirilmez. Yazma yetkisi kontrolü başarısız olsa bile izinli liste okuması kullanılabilir.

İstemci güncel ve doğrulanmış liste olmadan değişiklik başlatmaz; iki dakikayı aşan liste yenilenmelidir. Sunucu yazma yetkisini her istekte yeniden kontrol eder. İstekler seçili `configId`, VDOM ve görülen sunucu adresini taşır; adres değişmişse kaynak çağrısından önce reddedilir. Aynı bağlantının farklı VDOM seçenekleri ayrı tutulur.

Eklemede IPv4/IPv6, açık süre seçimi ve neden alanı vardır. Süresiz seçenek, mevcut servis sözleşmesindeki gibi süre parametresini göndermez; cihazın uyguladığı bitiş zamanı sonraki okumada kontrol edilir. Kaldırma onayı IP, cihaz, VDOM, neden ve süreyi gösterir; aynı IP'nin birden fazla kaydının etkilenebileceğini ve yeniden engellenebileceğini açıklar. İstek sürerken ikinci yazma ve cihaz değiştirme engellenir.

Başarılı kaynak yanıtı sonrasında liste tekrar okunur. IP'nin listede varlığı/yokluğu bildirilir; kabul yanıtı tek başına doğrulanmış sonuç sayılmaz. Hata veya belirsiz sonuçta otomatik yazma tekrarı yapılmaz ve yeniden denemeden önce liste yenileme gerekir. Bu ekran önerilen V2 onay/işçi sözleşmesini etkinleştirmez.

## Doğrulama

`node scripts/check-quarantine.cjs`: gerçek model, servis, API, rol/özellik kapıları ve denetim rezervasyonu/sonucu; yalnızca kaynak taşıması ve veritabanı yalıtılmıştır. IP doğrulama, eksik/boş/bozuk veri, VDOM/sunucu değişikliği, okuma yetkisi ve yazma hatalarını kapsar.

Tarayıcı önizlemesi `output/quarantine-refresh` altında gerçek sayfa bileşenini ayrı sentetik taşıma ile çalıştırır. TEST VERİSİ bandı görünürdür. Canlı kurulumda kayıtlı FortiGate bulunmadığından bağlantı ekleme durumu ayrıca doğrulanmıştır; cihaz eklenmez ve gerçek karantina yazması yapılmaz. Masaüstü/mobil, koyu tema, IPv6, arama, süre filtresi, ayrıntı/onay, salt okunur durum, hatada eski veri, belirsiz yazma, kaynak değişimi ve sayfalama kontrol edilir.

## Commit review — 19 October 2026

The preview description above records earlier design work; the commit review uses the real Next application with a separate private PostgreSQL database and Playwright transport fixtures. It does not inspect or alter the live installation or a customer appliance.

Review fixes: add an optional timeout to the shared apiDelete helper and use 60 seconds for quarantine removal; compare canonical IPv6 addresses during reconciliation; recheck the two-minute observation limit at submission, independently of the display timer; reject IPv6 URL/path suffixes; remount the device workspace when its observed management host changes. A timeout remains an uncertain outcome, never proof that a remote write was cancelled or failed. Existing ADMIN, feature-flag and audit-before-source requirements remain unchanged; this does not activate the proposed V2 write workflow.

Final verification passed 22/22 Chromium cases (zero retries), full non-incremental TypeScript, strict scoped ESLint and quarantine/web-analytics model/API/transport regressions. The shared runner's static/model/database gates passed on identical application source, including firewall write/audit contracts, current-account permissions and rollback-only incident collaboration. Its first browser run passed 21/22: the pending-write assertion could not find a background button hidden from the accessibility tree by the modal. The selector was corrected to inspect the actual hidden DOM control. The synthetic add fixture was also given unique record IDs and its second reconciliation assertion strengthened. All 22 cases and type/lint/model checks then passed on the final immutable test tree. An initial unused test import and an isolated launcher interpolation error were corrected; their failed logs are retained.

The offline release build passed 102/102 static pages and emitted local Inter checks, with read-only root, private Prisma output and network disabled. Only browser-test changes separate the build, shared-gate and final test trees. All 22 final fixture manifests were cleaned. Final desktop, mobile light/dark and mobile-detail screenshots were inspected. Signed-cookie tests do not cover header/local-storage sign-in presentation. Successful appliance writes and audit storage in the source-route unit test are synthetic; real database/API tests check current-role/account/feature denials and unchanged audit records. Live firmware, successful real-appliance writes, the entire browser suite, remote CI and deployment were not tested. Four existing unrelated lint warnings and existing dependency/dev-server diagnostics remain.

Evidence: `output/quarantine-review-20261019/verification.json`, `runner.log`, `runner-shared.log`, `runner-attempt-1.log`, `runner-launch-error.log`, `build.log` and `final/incident-regression/report/index.html`.
