# GitHub Releases / GHCR müşteri dağıtımı

Hedef: Windows 11 + Docker Desktop Linux amd64. Müşteri verileri GitHub'a gönderilmez. `deploy/install-infrascope.ps1` ilk kurulumu; kurulan `update.ps1` zorunlu şifreli yedek ve devam kaydıyla güncellemeyi yürütür. Müşteri adımları: [INSTALL_WINDOWS.md](../../deploy/INSTALL_WINDOWS.md).

Müşteriye açık imajlar `ghcr.io/celebigilfatih/infrascope-customer` ve `ghcr.io/celebigilfatih/infrascope-customer-nms` paketleridir. Bunlar eski özel `infrascope` paketinden ayrıdır; eski paketlerin görünürlüğü değiştirilmez. İlk push'tan sonra yalnız yeni iki paketin görünürlüğünü Public yapın ve boş Docker kimlik yapılandırmasıyla digest üzerinden pull kontrolü gerçekleştirin.

## Yayıncı akışı

1. Test edilmiş kaynak değişikliklerini gözden geçirip depoya kaydedin. Çalışma dizinindeki kaydedilmemiş dosyalar GitHub Actions'a gitmez. Üretim derlemesi, regresyon ve dağıtım kontrolleri aynı commit için geçmelidir.
2. Yeni, kullanılmamış sabit sürüm seçin; örneğin `1.0.2`. Etiketi tam olarak o commit üzerinde `v1.0.2` olarak yayımlayın. `publish-image.yml` etiket push'unda çalışır. Manuel çalıştırmada da branch yerine aynı etiketi seçin. Bu belge kendiliğinden commit/tag/push yapmaz.
3. İş akışı release-quality, incident, dashboard, alarm, backup ve customer-deployment kapılarını bekler. App ve NMS imajlarını `RELEASE_VERSION` ve gerçek `SOURCE_REVISION` ile Linux amd64 için derleyip GHCR'ye yollar. Sadece sürüm etiketi yayımlanır; `latest` müşteride kullanılmaz.
4. Başarılı push çıktısındaki app/NMS digest'leri ve PostgreSQL 16-alpine digest'iyle küçük ZIP üretilir. Aynı sürüm paketinden HTML/PDF kılavuzları ve doğru indirme bağlantılarını içeren Release açıklaması otomatik üretilir. Release asset'leri: `install-infrascope.ps1`, `infrascope-windows-online-<sürüm>.zip`, `SHA256SUMS-online-<sürüm>.txt`, `InfraScope-<sürüm>-Windows11-Kurulum-Kilavuzu.html`, aynı adlı `.pdf` ve `SHA256SUMS-guides-<sürüm>.txt`.
5. GitHub Release yalnız imajlar/paket ve iki doğrulanmış kılavuz hazır olduğunda oluşturulur. HTML veya PDF üretimi, komut/bütünlük kontrolü başarısızsa Release oluşturulmaz. Var olan release üzerine yazılmaz. İmaj push'u başarılı olup sonraki adım başarısızsa yayınlanmamış imajlar kalabilir; inceleyin. Etiketi/asset'i sonradan taşımayın/değiştirmeyin. Depoda immutable releases özelliğini etkinleştirmek ayrıca önerilir.
6. Özel depoda müşteri hesabının Release erişimini ve **iki GHCR paketinin** okunabilirliğini doğrulayın. Herkese açık dağıtım seçilirse her iki paketin görünürlüğü GitHub Packages ekranından ayrıca düzenlenir; workflow depoyu veya paketleri otomatik olarak herkese açmaz.
7. Gerçek release üzerinden temiz Windows kurulumunu ve mevcut sürümden güncellemeyi site kabulü kapsamında doğrulayın. Yerel fixture testleri GitHub yetkilerini ve uzak yayımlamayı doğrulamaz.

ZIP yalnız izinli dağıtım dosyalarını içerir; `.env`, müşteri DB'si, lisans/makine kimliği, tokenlar ve merkezi lisans sunucusu içermez. `release.json` kaynak commit'ini, sürümü, depo adını, her dosyanın SHA-256 değerini ve üç imajın kesin referansını taşır. `release-images.yml` app/NMS/PostgreSQL/otomatik yedek servisini bu digest'lere sabitler. Müşterinin mevcut `.env` dosyasındaki anahtarlar yenilenmez.

## Kontroller

Kılavuz içeriğinin tek kaynağı `deploy/guides/windows-install.html` dosyasıdır. Önceden yayımlanmış `Kurulum/InfraScope-1.0.7-...` dosyasını kopyalayıp sürüm değiştirmeyin. Şablondaki sürüm, depo, üretim tarihi, bootstrap SHA256 ve yedek servis adı paket metadata'sından doldurulur. Docker'ın `{{.OSType}}` gibi Go şablonları literal komut olarak korunur. Parametre isimleri değişirse üretici başarısız olur; şablon ve testler birlikte güncellenmelidir.

`customer-deployment` kılavuz job'u iki sentetik sürüm/depo ile gerçek Chromium HTML/PDF üretimi yapar. Kopyalama, engellenen panoda Ctrl+C seçimi, yazdırmada hata çözümleri, seçilebilir PDF komutları, sayfa bölünmeleri, sürüm bağlantıları ve SHA256 değerleri kontrol edilir. Windows job'u üretilmiş komutları PowerShell 5.1 ile parse eder. Bu testler müşteri ortamı oluşturmaz ve sentetik sürümleri yayımlamaz.

Yerel tam kılavuz kontrolü için mevcut Node bağımlılıklarını kurduktan sonra:

```text
python -m pip install -r scripts/customer-guides-requirements.txt
npx --no-install playwright install chromium
python scripts/check-customer-guides.py --integration
```

Üretim paketinin bulunduğu dizinden kılavuz üretmek için (örnek sürüm; yayımlanmaz):

```text
python scripts/build-customer-guides.py --release-dir dist/online --output dist/online --version 1.0.8 --repository celebigilfatih/infrascope --release-date 2026-10-25
```

Üretici PDF ve HTML hash'lerini doğrulamadan kılavuz checksum dosyasını ve `release-notes-<sürüm>.md` dosyasını yazmaz. PDF üretimi için varsayılan Chromium yerine yerel kurulu tarayıcı kullanılacaksa `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` açıkça tanımlanabilir. Bu değişken CI'da kullanılmaz.

```powershell
python scripts/check-online-release.py
# Sentetik ZIP üretimi için customer-deployment.yml içindeki komutu kullanın.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/check-windows-update.ps1 -FixtureZip fixture\infrascope-windows-online-1.0.2.zip
pwsh -NoProfile -File scripts/check-windows-update.ps1 -FixtureZip fixture\infrascope-windows-online-1.0.2.zip
# Yalnız geliştirme makinesinde, mevcut üretim imajlarıyla izole gerçek Docker provası:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/check-windows-update-docker.ps1
```

CI Windows PowerShell 5.1/PowerShell 7 kontrol akışını sentetik GitHub ve Docker yanıtlarıyla test eder. Gerçek Docker provası ayrı, rastgele isimli projede çalışır; GitHub indirmesi/pull yerel imaj fixture'ıdır, Compose/DB/migration/şifreli yedek/geri yükleme gerçektir. Test proje ve verileri sonunda kaldırılır; mevcut müşteri veya geliştirme projeleri kullanılmaz.

## İşletim sınırları

- Güncelleme penceresinde kullanıcı ve entegrasyon yazmalarını durdurun. Yedek PostgreSQL'in tutarlı anlık görüntüsünü içerir; sonradan yapılan yazmaları içermez.
- Güncelleme kendi yedeği tamamlanmadan dağıtım dosyalarını/servisleri değiştirmez. İnternetten indirme ve imaj hazırlama önceden yapılır.
- Migration sonrası otomatik imaj geri dönüşü yoktur. `.update-state.json` ile aynı release devam eder; başka sürüm, değiştirilmiş release veya kayıp orijinal yedek reddedilir.
- `.isbackup` anahtar/kimlik/veritabanını içerir. Kuruma özel CA dosyalarını ve dağıtım kayıtlarını ayrıca kurum yedek politikasına alın. Parola ayrı saklanır. PostgreSQL ana sürüm yükseltmeleri ayrı runbook gerektirir.

Kaynaklar: [GitHub Release assets API](https://docs.github.com/en/rest/releases/assets), [GHCR ve digest ile çekme](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry), [Compose up / wait / pull](https://docs.docker.com/reference/cli/docker/compose/up/).
