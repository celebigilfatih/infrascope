## Windows + Docker Desktop müşteri sürümü

- Küçük Windows başlatıcısı ve doğrulanmış kurulum ZIP'i GitHub Releases üzerinden indirilir.
- Linux amd64 uygulama ve NMS imajları ayrı herkese açık `infrascope-customer` / `infrascope-customer-nms` GHCR paketlerinde, kesin SHA-256 digest'leriyle kullanılır.
- Windows güncelleyici dağıtım dosyalarını değiştirmeden önce zorunlu şifreli kurtarma yedeği alır. Müşteri verileri, ayarlar, oturum/şifreleme anahtarları ve lisans kimliği korunur.
- Yarım kalan güncelleme aynı sürümle ilk yedek korunarak devam eder; migration sonrasında otomatik eski imaj dönüşü yapılmaz.
- Kurulum ZIP'inde `INSTALL_WINDOWS.md`, `BACKUP_OPERATIONS.md`, `install.ps1`, `update.ps1`, `backup.ps1` ve imaj/dosya manifestleri bulunur. Mevcut kurulumun `.env` dosyasını yeni paketle değiştirmeyin.

### Kullanım

`install-infrascope.ps1` ve `SHA256SUMS-online-<sürüm>.txt` dosyalarını bu Release'in Assets bölümünden alın; SHA-256 değerini kontrol edin. Başlatıcıya bu Release başlığındaki sürümü `-Version` ile verin. Güncelleme için kurulu klasördeki `update.ps1 -Version <sürüm> -PassphraseFile <özel-parola-dosyası>` komutunu kullanın. Ayrıntılı adımlar ZIP içindeki Windows kılavuzundadır. GitHub hesabı/tokenı açık imajları indirmek için gerekmez; uygulama lisans etkinleştirmesi ayrıca gerekir.

### Güvenlik kapsamı

Bu yayın bir bağımlılık güvenlik yükseltmesi değildir. Kilitli Next.js sürümü için bilinen güvenlik bildirimleri vardır; bağımlılık denetimi temiz olarak raporlanmaz. GHSA-2xp9-vwfh-vxw4 kapsamındaki AVIF işleme yolunu kapatmak için kullanılmayan Next.js görsel optimizasyon API'si tamamen devre dışı bırakılmıştır. Sunucu Linux container içinde çalıştırılır; Windows üzerinde doğrudan Node sunucusu kurulumu desteklenmez. Next.js ve diğer üretim bağımlılıklarının desteklenen, düzeltilmiş sürümlere yükseltilmesi ayrıca gereklidir. Servisi yerel kullanım kılavuzuna uygun işletin.
