## Windows + Docker Desktop müşteri sürümü

- Küçük Windows başlatıcısı ve doğrulanmış kurulum ZIP'i GitHub Releases üzerinden indirilir.
- Linux amd64 uygulama ve NMS imajları ayrı herkese açık `infrascope-customer` / `infrascope-customer-nms` GHCR paketlerinde, kesin SHA-256 digest'leriyle kullanılır.
- Windows güncelleyici dağıtım dosyalarını değiştirmeden önce zorunlu şifreli kurtarma yedeği alır. Müşteri verileri, ayarlar, oturum/şifreleme anahtarları ve lisans kimliği korunur.
- Yarım kalan güncelleme aynı sürümle ilk yedek korunarak devam eder; migration sonrasında otomatik eski imaj dönüşü yapılmaz.
- Kurulum ZIP'inde `INSTALL_WINDOWS.md`, `BACKUP_OPERATIONS.md`, `install.ps1`, `update.ps1`, `backup.ps1` ve imaj/dosya manifestleri bulunur. Mevcut kurulumun `.env` dosyasını yeni paketle değiştirmeyin.

### Kullanım

`install-infrascope.ps1` ve `SHA256SUMS-online-<sürüm>.txt` dosyalarını bu Release'in Assets bölümünden alın; SHA-256 değerini kontrol edin. Başlatıcıya bu Release başlığındaki sürümü `-Version` ile verin. Güncelleme için kurulu klasördeki `update.ps1 -Version <sürüm> -PassphraseFile <özel-parola-dosyası>` komutunu kullanın. Ayrıntılı adımlar ZIP içindeki Windows kılavuzundadır. GitHub hesabı/tokenı açık imajları indirmek için gerekmez; uygulama lisans etkinleştirmesi ayrıca gerekir.

### Güvenlik kapsamı

Bu sürüm, 1.0.5'te gözlenen 1 kritik, 22 yüksek ve 6 orta düzeydeki npm bağımlılık bildirimlerini giderir. Next.js 15.5.28, React 19, güncel Axios/Nodemailer/Undici/WebSocket paketleri ve Tailwind 4 ile uyumlu derleme zinciri kullanılır; Docker ve CI çalışma zamanı Node.js 24'tür. Üretim ağacı ve geliştirme araçlarını içeren tam npm denetimi sıfır bildirimle doğrulanır. Herhangi bir önem düzeyinde yeni bildirim çıkarsa zorunlu yayın kapısı derlemeyi durdurur; denetim istisnası veya bildirim filtresi kullanılmaz.

Next.js'in kullanılmayan görsel optimizasyon API'si kapalı kalır. Dinamik API parametreleri ve lisans yönetimi çerezleri asenkron framework sözleşmesine uyarlandı. Oturum, yetki, TLS ve müşteri verisi koruma kontrolleri sürdürülür. Eski lint kural kümesi, yeni lint paketinin düzeltilmemiş glob/brace zincirini taşımamak için korunur; kendi glob bağımlılığı aynı ana sürümün güvenli yamasıyla sabitlenir. Gerçek derleyici/lint hata kontrolleri yayın testlerinde çalışır.

Sıfır npm bildirimi, uygulamanın veya container işletim sistemi/Python paketlerinin tüm olası güvenlik açıklarına karşı onaylandığı anlamına gelmez. Gerçek müşteri lisansı, vSphere/Windows/Docker koşulları ve entegrasyon erişimleri kurulum kabulünde ayrıca doğrulanmalıdır. Windows üzerinde doğrudan Node sunucusu kurulumu desteklenmez.
