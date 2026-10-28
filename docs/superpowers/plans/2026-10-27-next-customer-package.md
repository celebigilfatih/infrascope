# Sonraki müşteri kurulum/güncelleme paketi

**Durum: Beklemede — yalnızca plan.**

Kullanıcı kararı (27 Ekim 2026): HTTPS ve otomatik HTTP yönlendirmesi standart kurulum/güncelleme paketine eklenecek. Diğer iyileştirme ve değişiklikler tamamlandıktan sonra paket hazırlanacak. Şimdi paket oluşturma, imaj derleme, sürüm numarası artırma, GitHub Releases/GHCR yayını veya müşteri güncellemesi yapılmayacak.

## Mevcut dayanak

HTTPS ve HTTP308 yönlendirmesi ayrı yardımcı paketler olarak hazırlandı. Müşteride eski HTTP bağlantısının HTTPS'ye yönlendiği, istemci sertifika güveninin sağlandığı ve Chrome'da yenileme sonrası oturumun korunduğu doğrulandı. Ayrı ortamda 39 entegrasyon kontrolü geçti. Bunlar aşağıdaki standart paket entegrasyonunun tamamlandığı anlamına gelmez.

## Diğer iyileştirmeler tamamlandıktan sonra yapılacaklar

- [ ] Tamamlanan tüm değişiklikleri sonraki sürüm kapsamına al; sürüm numarasını bu aşamada belirle.
- [ ] Windows + Docker temiz kurulumuna HTTPS ve eski HTTP adresinden otomatik yönlendirmeyi dahil et. Sunucu adresi ve portları müşteri parametreleri olsun; mevcut müşterinin IP adresini pakete sabitleme.
- [ ] Mevcut müşteriler için aynı özellikleri ajansız güncelleme akışına ekle. Zorunlu şifreli yedek, müşteri verileri, lisans, anahtarlar, diğer ayarlar ve mevcut HTTPS CA kimliği korunsun.
- [ ] Port çakışması, proje sahipliği, kesilen geçiş, güvenli tekrar deneme ve geri alma kontrollerini ortak kurulum/güncelleme akışında doğrula. CA özel anahtarını dağıtma; müşteriler arasında CA paylaşma.
- [ ] Mevcut HTTPS/yönlendirme yardımcılarıyla kurulmuş müşterinin sonraki sürüme geçişini ayrıca doğrula. Sertifika otoritesi yeniden üretilmesin; yönlendirme ve loopback uygulama portu korunsun.
- [ ] HTTP308 yol/sorgu koruması, sabit HTTPS hedefi, sertifika güveni, gerçek giriş ve yenileme sonrası oturum kontrollerini standart paket regresyonuna dahil et.
- [ ] Yerel `output/customer-ip-https/check-https.py` provasını sürüm kontrolündeki bir test konumuna taşı; yerel pilot çıktılarına bağımlılığını kaldır ve temiz checkout üzerinde yeniden üretilebilir hale getir. Geçmiş 39 kontrolün logları tek başına dağıtılabilir regresyon kaynağı sayılmasın.
- [ ] Boş veritabanıyla temiz kurulum ve mevcut verili kurulumdan güncelleme provası yap; yedekten kurtarma ve kesinti senaryolarını da kontrol et.
- [ ] Tam regresyon paketi, TypeScript, lint, güvenlik/yayın kontrolleri ve üretim derlemesini çalıştır; bu yayın provasının test verilerini temizle ve raporu güncelle.
- [ ] HTML/PDF kurulum ve ajansız güncelleme kılavuzlarını güncelle: HTTPS erişimi, eski adresin yönlendirilmesi, istemciye açık CA sertifikasının doğrulanıp eklenmesi, tek satırlık CMD/PowerShell komutları, yedekleme ve kurtarma adımları yer alsın. Komut ve bağlantılar yayımlanacak sürümle eşleşsin.
- [ ] Yukarıdakiler tamamlandığında müşteri paketini ve sabit sürümlü imajları hazırla; planlanan yayında GitHub Releases/GHCR varlıkları ile müşterinin kurulum/güncelleme akışını doğrula.

## İlgili çalışmalar

- [HTTPS uygulama ve doğrulama kaydı](2026-10-27-customer-ip-https.md)
- [HTTP yönlendirme uygulama ve doğrulama kaydı](2026-10-27-customer-http-redirect.md)

Bu kayıt zamanlanmış görev veya otomatik yayın talimatı değildir. Çalışma, kullanıcı diğer iyileştirmeleri tamamlayıp paket hazırlığına geçilmesini istediğinde sürdürülecek.
