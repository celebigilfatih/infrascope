# Denetim kayıtları

`/settings/audit`, değiştirilemeyen denetim kayıtlarını listeler. İşlem, kullanıcı adı/e-posta/kimlik, kaynak ve tarih alanları **Filtreleri uygula** ile sorgulanır. Hızlı tarih seçimleri önce formu doldurur. Uygulanmamış değişiklikler ayrıca belirtilir; CSV, uygulanan sorguyla indirilir.

Tarih alanları `Europe/Istanbul` takvim günleridir. Bitiş günü, sonraki günün başlangıcına kadar dahil edilir. Tarih-saat parametrelerinde açık UTC/ofset kullanımı korunur. Liste ve CSV aynı `lib/audit/query.ts` filtresini kullanır. Eski `userId` tam kimlik filtresi desteklenmeye devam eder; `user` adı, e-postayı veya kimliği arar.

Eşleşen kayıt sayısı tüm sayfalara aittir; diğer özet sayaçları açık sayfayla sınırlıdır. Yenileme hatası önceki sorgunun kayıtlarını korur ve güncellik uyarısı gösterir. Filtre değiştiğinde eski sorgunun verileri yeni sonuç gibi gösterilmez. Ayrıntı penceresi kaydedilen alanları ve önceki/yeni değerleri açar; eksik kullanıcı/IP/ayrıntı bilgileri açıkça belirtilir. Bilinmeyen işlem kodları korunur ve başarı sonucu varsayılmaz.

CSV, en yeni 10.000 kayıtla sınırlıdır. `X-Audit-Export-Truncated: true` daha fazla kayıt olduğunu bildirir. Başlıklar Türkçe, tarih değerleri UTC, kodlar ve kimlikler özgün biçimdedir. UTF-8 BOM kullanılır; mevcut formül kaçışları korunur. Liste ve CSV, middleware sonrasında ortak `authorizeApiRequest` ile veritabanındaki güncel ACTIVE kullanıcı ve yönetici yetkisini, sorgu ayrıştırma veya audit okumalarından önce denetler. Eski ADMIN JWT'si rol iptalini veya hesap kapatılmasını aşamaz. Kimlik kaynağı kullanılamadığında 503 döner. Bu çalışma kayıt ekleme, değiştirme veya silme işlemi eklemez.

Liste yanıtındaki satırlar görünüm sözleşmesine göre doğrulanır; bozuk bir satır önceki veriyi yanlışlıkla yeni sonuç gibi göstermez veya ekranı çökertmez. JSON ayrıntılarındaki `false` ve `0` dahil skaler değerler, diziler ve iç içe alanlar korunarak gösterilir.

Doğrulama: `npm run test:audit-workspace` (veritabanı/ağ bağlantısı olmadan API ve görünüm sözleşmeleri), `npm run test:ui-turkish`, TypeScript ve ilgili dosyaların ESLint kontrolü. Görsel testlerde mobil/koyu tema, filtre uygulama, tarih doğrulama, ayrıntılar, sayfalama, indirme, boş liste ve yetki/kaynak hataları kontrol edilir.

`tests/incident-e2e/audit-workspace.spec.ts`, ortak izole regresyon ortamında gerçek PostgreSQL ve imzalı oturumlarla liste/CSV kapsamını, TSİ gün sınırlarını, eş zaman damgalı kayıtların sırasını, sayfalamayı, ayrıntıları ve reddedilen erişimleri sınar. Sentetik fixture kayıtları test sonunda temizlenir; müşteri denetim kayıtları okunmaz veya değiştirilmez.
