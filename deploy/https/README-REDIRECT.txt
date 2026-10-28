InfraScope — eski HTTP adresini HTTPS'ye yönlendirme

Ön koşul: aynı sunucuda daha önce HTTPS kurulmuş, HTTPS ready sonucu alınmış
olmalı. https://10.60.0.1 adresi istemciden erişilebilir olmalıdır. Yönlendirme
sertifika güveni gereksinimini kaldırmaz; mevcut açık CA sertifikasını her
istemci/kullanıcı için doğrulayıp güvenilir köklere ekleme adımı devam eder.

1. Paketteki YALNIZ şu dört dosyayı mevcut HTTPS klasörüne kopyalayın:
   C:\InfraScope\InfraScope-HTTPS
   install-redirect.ps1, redirect-compose.yml, Redirectfile, README-REDIRECT.txt
   Mevcut .env, .https-state.json, Caddyfile, compose.yml ve CRT'yi değiştirmeyin.

2. Sunucuda CMD veya PowerShell'de TEK SATIR olarak çalıştırın:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\InfraScope\InfraScope-HTTPS\install-redirect.ps1" -PublicIp 10.60.0.1

Beklenen sonuç:
Redirect ready: http://10.60.0.1:8170 -> https://10.60.0.1 (path/query preserved)

Ne değişir?
- Mevcut uygulama aynı imajla kısa süre yeniden başlar. Yalnız APP_PORT,
  mevcut uygulama .env dosyasında 127.0.0.1:18170 olur. 18170 doluysa hiçbir
  uygulama değişikliği yapılmadan durur; boş bir -BackendPort seçebilirsiniz.
- Yeni infrascope-https-redirect projesi 8170 portundan HTTP308 döndürür.
  Yol ve sorgu korunur; Host başlığı HTTPS hedefini değiştiremez.
- HTTPS projesi, sertifika/özel anahtarlar, PostgreSQL, NMS, imaj sürümleri,
  müşteri verileri, lisans ve diğer .env ayarları korunur.
- 80 portu açılmaz. Eski :8170 adresi için otomatik yönlendirme eklenir.

3. İstemcide eski bağlantıyı deneyin:
http://10.60.0.1:8170/login?next=%2Fdashboard
Adres https://10.60.0.1/login?next=%2Fdashboard olmalıdır.
Giriş yapın ve sayfayı yenileyince oturumun korunduğunu kontrol edin.

Tekrar çalıştırma güvenlidir; kesinti sonrası aynı komutla devam edilir.
Normal hatada eski .env ve uygulama portu otomatik geri alınır. HTTPS korunur.
Elle geri almak için aynı sunucuda TEK SATIR:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\InfraScope\InfraScope-HTTPS\install-redirect.ps1" -PublicIp 10.60.0.1 -Action Rollback

Geri dönüş dosyası C:\InfraScope\infrascope\.http-redirect.env.before özgün
.env içeriğini barındırır; parola/anahtar içerdiği için sunucuda koruyun ve
istemcilere göndermeyin. .redirect-state.json dosyasını ve CA volume'unu
silmeyin. Geri alma başarısızsa dosyaları koruyup hata çıktısını paylaşın.

Standart update.ps1 .env dosyasını korur; sonraki sürüm güncellemelerinde
loopback portu ve ayrı yönlendirme servisi devam eder. Eski tamamlanmış
pilot kurulumunu yeniden uygulamayın: ortam hash'i değiştiği için durabilir.
Kurulumdan sonra .env'deki APP_PORT değerini tekrar 8170 yapmayın; bu portu
yönlendirme servisi kullanır. Backend'e yerel erişim localhost:18170'tedir;
normal kullanıcı erişimi her zaman HTTPS üzerinden olmalıdır.

Başka proje/kurulum yolu kullanılıyorsa -InstallationRoot, -InstallationProject
ve -ProxyProject parametrelerini gerçek mevcut değerlerle verin. Betik doğru
proje/dosya sahipliği doğrulanmadan değişiklik yapmaz.
