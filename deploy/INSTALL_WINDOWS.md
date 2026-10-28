# Windows + Docker Desktop yerel kurulum

Bu paket Linux x86_64 imajlarıyla Windows üzerinde Docker Desktop kullanır. Docker Desktop'ın Linux containers motoru çalışır durumda olmalıdır. Standart çevrimiçi kurulum sabit sunucu IPv4 adresinde HTTPS443 ve eski HTTP8170 adresinden otomatik yönlendirme kurar; backend18170 yalnız loopback üzerinde kalır. Lisans etkinleştirmesi için lisans sunucusuna erişim ve müşteriye ait lisans anahtarı gerekir. İnternete bağlı müşteride aşağıdaki **GitHub Releases + GHCR üzerinden ilk kurulum** bölümünü kullanın; çevrimdışı imaj paketi alternatifidir.

## Çevrimdışı imaj paketiyle ilk kurulum (alternatif)

1. ZIP dosyasının SHA-256 değerini teslim edilen manifest ile karşılaştırın: `Get-FileHash .\infrascope-customer-deploy-1.0.1.zip -Algorithm SHA256`.
2. ZIP'i kalıcı bir klasöre açın; örneğin `C:\InfraScope`. OneDrive veya geçici klasör kullanmayın. PowerShell'i ZIP içindeki `infrascope` klasöründe açın.
3. Docker Desktop'ı başlatın. `docker info` ve `docker compose version` başarılı olmalıdır.
4. Yalnızca bu çalıştırma için komutu uygulayın:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

Kurucu imaj arşivlerinin bütünlüğünü kontrol eder, Docker'a yükler, benzersiz anahtarlar üretir, boş veritabanına şemayı kurar ve servislerin sağlıklı olmasını bekler. İmajlar pakette bulunur; imaj indirmek için registry girişi gerekmez. Gerekli lisans ve entegrasyon bağlantıları ayrıca ağ erişimi ister.

Tarayıcıdaki `/setup` ekranında müşterinin lisansını etkinleştirin, kurum bilgisini ve ilk yönetici hesabını oluşturun. Hazır yönetici hesabı veya varsayılan parola yoktur.

8170 meşgulse `-AppPort 8171` ekleyin. Ayrı kurulum için ayrı klasör ve `-ProjectName musteri2 -AppPort 8172` kullanın. Tekrar çalıştırıldığında mevcut `.env`, anahtarlar ve veriler korunur. Klasör taşınırken `.env`, `data`, `certs` ve yedekleri de koruyun; mevcut kurulumun anahtarlarını yenilemeyin. Yalnızca ayarları hazırlamak için `-ConfigureOnly`, tarayıcı açılmasını önlemek için `-NoBrowser` kullanılabilir.

## Kullanım ve servisler

```powershell
docker compose ps
docker compose logs --tail 100 app nms
docker compose stop
docker compose start
```

Docker Desktop oturum açıldığında başlatılacak şekilde ayarlanmalıdır. Windows uyku durumunda veya Docker kapalıyken izleme çalışmaz. PostgreSQL ve NMS portları doğrudan dışarı açılmaz. Kurulumun web portunu Windows güvenlik duvarında başka bilgisayarlara açmayın. Ağ üzerinden erişim istenirse alan adı, HTTPS ve uygulama URL'si ayrıca yapılandırılmalıdır; yerel kullanım adresini başka bilgisayarda kullanmayın.

## Yedek ve kurtarma

Veritabanı yedeği otomatik olarak `backups\database` altında tutulur. Makine arızasına karşı anahtarları da içeren şifreli taşınabilir yedeği ayrıca oluşturun:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backup.ps1 -PassphraseFile C:\Private\infrascope-recovery-passphrase.txt
```

Parola dosyası en az 16 baytlık tek satır içermeli ve yalnızca yetkili yönetici tarafından okunabilmelidir. `.isbackup` dosyasını başka diske veya bağımsız depolamaya, parolasını ayrı yere kopyalayın. `BACKUP_OPERATIONS.md` doğrulanmış kurtarma akışını açıklar. `.env`, `data` ve yedekler özeldir; destek kaydına veya başka müşteriye göndermeyin. `docker compose down --volumes` müşteri veritabanını siler; normal durdurmada kullanmayın.

## GitHub Releases + GHCR üzerinden ilk kurulum

Kaynak kod sayfasındaki **Code → Download ZIP** müşteri kurulum paketi değildir. [InfraScope Releases](https://github.com/celebigilfatih/infrascope/releases) sayfasından `install-infrascope.ps1` ve `SHA256SUMS-online-<sürüm>.txt` dosyalarını alın. Betiğin `Get-FileHash -Algorithm SHA256` çıktısını güvenilir release sayfasındaki değerle karşılaştırın. İsterseniz aynı sayfadaki küçük `infrascope-windows-online-<sürüm>.zip` dosyasını boş bir klasöre açıp içindeki `install.ps1` betiğini çalıştırabilirsiniz; büyük Docker imajlarını taşımanız gerekmez.

Sürüm örneği aşağıda **1.0.2**'dir; komutta yalnız yayımlanmış gerçek sürümü kullanın. Bu belgenin hazırlanması sürümün GitHub'a yayımlandığı anlamına gelmez.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\install-infrascope.ps1 -Version 1.0.2 `
  -Destination C:\InfraScope\infrascope -ProjectName infrascope-musteri `
  -PublicIp SUNUCU_IP -PassphraseFile C:\Private\infrascope-recovery-passphrase.txt
```

Başlatıcı yalnız boş hedefe kurulum yapar; mevcut klasörün üstüne yazmaz. GitHub API'sinin verdiği ZIP SHA-256 değerini, paket içindeki dosya manifestini ve istenen sürüm/depo eşleşmesini doğrular. Docker imajları GHCR'den `sha256` özetiyle sabitlenmiş olarak alınır. `latest` kullanılmaz. `.env`, veritabanı volume'u ve lisans kimliği müşteriye özel oluşur. Kurulum başladıktan sonra hata olursa aynı klasördeki `install.ps1` betiğiyle devam edin.

Müşteri imajları `ghcr.io/celebigilfatih/infrascope-customer` ve `ghcr.io/celebigilfatih/infrascope-customer-nms` adreslerindedir; yayımlanan Public paketleri indirmek için GitHub hesabı veya Docker oturumu gerekmez. İmaj indirme uygulamanın lisans etkinleştirmesinin yerini almaz.

İndirme erişimleri: `api.github.com`, GitHub release dosyalarının yönlendirildiği alan adları, `ghcr.io` ve imaj katmanı sunucuları; PostgreSQL için Docker Hub. HTTPS proxy/sertifika kurallarını kurum yöneticisiyle düzenleyin. Lisans ve entegrasyon erişimleri bunlardan ayrıdır.

### Özel depo ve özel GHCR paketleri

Herkese açık release/imajlarda oturum açmak gerekmez. Özel depoda GitHub Releases için yalnız ilgili depoya **Contents: read** yetkili erişim gerekir; tokenı yalnız o PowerShell oturumunda `GH_TOKEN` ortam değişkenine yükleyin. İmajlar özel ise GHCR için ilgili pakete erişimi olan **read:packages** yetkili token ile `docker login ghcr.io` yapın. GitHub API ve GHCR yetkileri ayrı değerlendirilir; birine erişebilmek diğerini garanti etmez. Tokenı `.env`, kurulum betiği veya müşteri paketine yazmayın. İşlem bitince `Remove-Item Env:GH_TOKEN` kullanın. Docker kimlik bilgileri aynı Windows işletim kullanıcısının kimlik deposunda saklanır.

## Windows üzerinden sürüm güncelleme

Hedef sürümün yeni `install-infrascope.ps1` başlatıcısını Release sayfasından indirin, SHA256 değerini doğrulayın ve indirilen klasörde Docker Desktop çalışırken uygulayın. Özellikle1.0.9 kurulu güncelleyicisi yeni iç içe HTTPS dosya listesini tanımaz; yeni başlatıcı doğrulanmış aday güncelleyiciyi kullanır. `VERSION` değerini elle önceden değiştirmeyin; başka bir klasör veya Docker projesi oluşturmayın. Kurtarma parolası dosyası ilk bölümdeki en az 16 baytlık özel dosya olmalıdır.

```powershell
Set-Location C:\InfraScope\Downloads
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\install-infrascope.ps1 -Version 1.0.2 -Update `
  -Destination C:\InfraScope\infrascope `
  -PassphraseFile C:\Private\infrascope-recovery-passphrase.txt
```

Betik sırasıyla:

1. Yayımlanmış sabit sürümü ve ZIP/dosya hash'lerini doğrular, imajları kesin özetleriyle indirir. İndirme hatasında çalışan servisler etkilenmez.
2. **Doğrulanmış aday NMS imajı ve yedekleme aracıyla şifreli `.isbackup` yedeğini alır. Yedek başarısızsa güncellemeyi durdurur.** Yedek normal PostgreSQL anlık görüntüsüdür; güncelleme penceresinde kullanıcı işlemlerini ve harici yazmaları durdurun. Yedek alımı ile servislerin durması arasındaki yeni yazmalar yedeğe dahil olmaz.
3. Önceki dağıtım dosyalarını ve devam kaydını saklar; app/NMS servislerini durdurur. `.env` içindeki yalnız `VERSION` değişir. Proje adı, port/URL, lisans, oturum/şifreleme anahtarları, `data`, `certs`, yedekler ve PostgreSQL volume'u korunur.
4. Yeni dağıtım dosyalarını uygular; uygulama açılışında bekleyen migration işlemleri çalışır. Servislerin sağlıklı olmasını en fazla 300 saniye bekler.

Başarılı işlemde kurtarma yedeğinin yolu ekrana yazılır; `.isbackup` dosyasını bağımsız depolamaya kopyalayın. Önceki dağıtım dosyaları ve sonuç kaydı `backups\updates` altında tutulur. Aynı tamamlanmış sürüm tekrar çalıştırıldığında yeni işlem/yedek oluşmaz. Eşzamanlı iki kurulum/güncelleme engellenir. PostgreSQL ana sürüm yükseltmesi bu akışın kapsamında değildir.

### Yarım kalan güncelleme

`.update-state.json` varsa dosyayı silmeyin. Sorunu giderip **aynı sürüm, depo ve aynı kurulum klasörüyle** aynı komutu tekrar çalıştırın. İlk yedek korunur; yeni ve kısmen migrate edilmiş bir veritabanıyla üzerine yazılmaz. İlk yedek eksik/değişmişse veya release içeriği değişmişse devam edilmez. Yeni sürüm sağlıksızsa otomatik olarak eski imaja dönülmez; migration veritabanını değiştirmiş olabilir. Hata günlüklerini ve `BACKUP_OPERATIONS.md` içindeki uyumlu yedekten kurtarma prosedürünü kullanın. `.env`, `data` veya volume'u silerek çözmeye çalışmayın.

```powershell
docker compose -f docker-compose.yml -f release-images.yml ps
docker compose -f docker-compose.yml -f release-images.yml logs --tail 100 app nms
```

Yeni kurulumda veya güncellemeden sonra elle Compose komutu çalıştırırken **iki Compose dosyasını birlikte** kullanın. İkinci dosya, doğrulanmış imaj özetlerini sabitler.

### Eski çevrimdışı kurulumdan geçiş

1.0.9 dahil eski çevrimiçi kurulumda hedef Release’in yeni başlatıcısını kullanın: `install-infrascope.ps1 -Version <hedef-sürüm> -Update -Destination <mevcut-kurulum> -PassphraseFile <mevcut-parola-dosyası>`. Güncelleme dosyalarını elle mevcut kurulumun üzerine açmayın. Henüz HTTPS olmayan eski kurulumda `-PublicIp SUNUCU_IP` ekleyin. Eski çevrimdışı kurulumun kimliği/betikleri farklıysa geçişi ayrı ortamda prova edin.

## HTTPS güveni ve kurtarma

Yeni çevrimiçi kurulumda `-PublicIp` ve `-PassphraseFile` zorunludur. Yukarıdaki `SUNUCU_IP` yer tutucusunu sabit sunucu IPv4 adresiyle değiştirin. Parola dosyasını en az16 baytlık tek satır olarak yalnız yetkili yöneticinin okuyabildiği izinlerle hazırlayın; mevcut dosyanın üzerine yazmayın. Sürüme özel HTML/PDF kılavuzu güvenli dosya oluşturma ve komutları içerir.

Kurucu public `infrascope-root-ca.crt` yolunu ve SHA256 değerini gösterir. Yalnız bu CRT’yi yetkili istemciye kopyalayın, hash’i güvenilir kanaldan doğrulayın ve ilgili Windows kullanıcısının `Cert:\CurrentUser\Root` deposuna ekleyin. Docker CA volume’unu veya özel anahtarları istemcilere taşımayın; TLS doğrulamasını kapatmayın. Sonra `https://SUNUCU_IP/setup` adresini açın. Her müşteri ayrı CA alır; güncelleme mevcut CA’yı ve varsa dış `InfraScope-HTTPS` klasörünü korur.

Şifreli kurtarma yedeği yönetilen yerel CA/proxy kimliğini de içerir. Yeni kurulumda veya ilk HTTPS geçişinde ayrıca bir başlangıç güvenli durum yedeği oluşturulur. Yedek dosyasını bağımsız depolamaya, parolayı ayrı kasaya alın. TLS içeren format2 yedeğini bu sürümün veya uyumlu daha yeni NMS imajıyla açın;1.0.9 kurtarma aracı format2’yi okuyamaz. Haricen eklenmiş `certs` dosyalarını ayrıca koruyun.

Yarım kalan ilk HTTPS kurulumunda mevcut `install.ps1 -PublicIp SUNUCU_IP -PassphraseFile <mevcut-parola-dosyası>` ile aynı portları kullanarak devam edin. Güncelleme journal’ını silmeyin; aynı sürümle tekrar deneme özgün yedeği doğrulayıp kullanır. Kaybolan CA volume’unu yeniden üretmeyin; bağımsız yedekten kurtarın. CA/proje/IP değişikliği ve belirsiz sahiplikte güncelleme durur.
