InfraScope — Windows/Docker IP üzerinden HTTPS

Amaç: üretimde Secure oturum çerezini koruyarak ağdan giriş sağlamak.
Yeni erişim: https://SUNUCU_IP (443). HTTP 8170 adresi otomatik yönlendirilmez.

1. Bu klasörü müşteri sunucusunda C:\InfraScope\InfraScope-HTTPS konumuna
   kopyalayın. Mevcut uygulama klasörünü veya .env dosyasını değiştirmeyin.

2. Sunucuda PowerShell:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\InfraScope\InfraScope-HTTPS\install-https.ps1" -PublicIp SUNUCU_IP

Mevcut Docker proje adı infrascope-musteri değilse -InstallationProject
parametresini mevcut gerçek adla verin. Betik yalnız ayrı infrascope-https
projesini oluşturur. App, NMS, PostgreSQL, anahtarlar ve .env korunur.
443 portu başka serviste kullanılıyorsa betik durur. Güvenlik duvarı
değiştirilmez; istemci erişimi ayrıca kurumun ağ kurallarına uygun olmalıdır.

3. Çıktıda HTTPS ready, sertifika yolu ve CA dosyasının SHA256 değeri görünür.
   Yalnız infrascope-root-ca.crt dosyasını giriş yapılacak bilgisayara kopyalayın.
   Dosya SHA256 değerini sunucudaki çıktı ile karşılaştırın:
Get-FileHash -Algorithm SHA256 "C:\InfraScope\infrascope-root-ca.crt"

4. Değer eşleşiyorsa ve bu müşteri CA'sına güveniyorsanız, istemcide kendi
   kullanıcınız için sertifikayı ekleyin (bu adımı kullanıcı uygular):
Import-Certificate -FilePath "C:\InfraScope\infrascope-root-ca.crt" -CertStoreLocation Cert:\CurrentUser\Root

Bu CA'ya güvenmek, onun imzaladığı sertifikalara güvenmek demektir. CA özel
anahtarı yalnız sunucunun Docker volume'unda tutulur. Sertifika/anahtarları
başka müşterilerle paylaşmayın. İstemciye yalnız açık root.crt kopyalanır.

5. İstemci tarayıcısından https://SUNUCU_IP/login adresine girin. Sertifika
   uyarısı olmamalıdır. Mevcut kullanıcı bilgileriyle oturum açın.

Tekrar çalıştırma aynı sertifika otoritesini korur. caddy_data volume'unu
silmeyin; normal durdurma için yalnız bu HTTPS klasöründe:
docker compose -f compose.yml -p infrascope-https stop

CA kaybolursa yeni sertifikayı sessizce üretmek yerine betik durur.
CA volume'u sunucu yedekleme planına ayrıca dahil edilmelidir.
HTTP oturum koruması/TLS denetimi kapatılmaz. Uygulama imajı yeniden derlenmez.
