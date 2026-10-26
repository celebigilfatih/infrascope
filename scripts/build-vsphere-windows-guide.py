"""Build the customer Windows/vSphere runbook as an embedded-font PDF and offline HTML."""
from pathlib import Path
import hashlib, html, json, re
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, Preformatted, Flowable
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'output/pdf'
HTML = ROOT / 'Kurulum/infrascope_vsphere_windows11_kurulum_rehberi.html'
PDF = OUT / 'infrascope_vsphere_windows11_kurulum_rehberi.pdf'
PACKAGE = ROOT / 'dist/infrascope-customer-deploy-1.0.1.zip'
EXPECTED = (ROOT / 'dist/SHA256SUMS-1.0.1.txt').read_text().splitlines()[0].split()[0]
assert len(EXPECTED) == 64
FONTDIR = Path('C:/Windows/Fonts')
for name, file in [('Guide', 'arial.ttf'), ('GuideBold', 'arialbd.ttf'), ('GuideItalic', 'ariali.ttf'), ('Code', 'consola.ttf')]:
    pdfmetrics.registerFont(TTFont(name, str(FONTDIR / file)))
pdfmetrics.registerFontFamily('Guide', normal='Guide', bold='GuideBold', italic='GuideItalic', boldItalic='GuideBold')

def normalize(text): return text.replace(chr(92)*2, chr(92))
def p(text): return ('p', normalize(text))
def h(text): return ('h', text)
def code(text): return ('code', normalize(text.strip()))
def steps(*items): return ('steps', tuple(normalize(item) for item in items))
def table(headers, rows, widths=None): return ('table', (headers, [[normalize(str(v)) for v in row] for row in rows], widths))
def note(title, text): return ('note', (title, normalize(text)))
def check(text): return ('check', text)
def refs(*numbers): return ('refs', numbers)

SOURCES = [
 ('Windows 11 VM, vTPM ve Key Provider', 'Broadcom KB 396090', 'https://knowledge.broadcom.com/external/article/396090/creating-a-windows-11-vm-in-vcenter-fail.html'),
 ('WSL2 istisnası ve AMD ESXi sürüm koşulları', 'Broadcom KB 313547', 'https://knowledge.broadcom.com/external/article/313547'),
 ('CPU sanallaştırmasını Windows konuğa açma', 'Broadcom KB 423240', 'https://knowledge.broadcom.com/external/article?articleNumber=423240'),
 ('Docker Desktop Windows gereksinimleri ve indirme', 'Docker Docs', 'https://docs.docker.com/desktop/setup/install/windows-install/'),
 ('Docker Desktop sanal makine desteği', 'Docker Docs', 'https://docs.docker.com/desktop/setup/vm-vdi/'),
 ('WSL kurulum ve doğrulama komutları', 'Microsoft Learn', 'https://learn.microsoft.com/en-us/windows/wsl/basic-commands'),
 ('Docker Desktop WSL2 motoru', 'Docker Docs', 'https://docs.docker.com/desktop/features/wsl/'),
 ('Docker başlangıç ayarları', 'Docker Docs', 'https://docs.docker.com/desktop/settings-and-maintenance/settings/'),
 ('WSL hata giderme', 'Microsoft Learn', 'https://learn.microsoft.com/en-us/windows/wsl/troubleshooting'),
 ('vGPU / PCI passthrough ile nested virtualization', 'Broadcom KB 437651', 'https://knowledge.broadcom.com/external/article/437651/unable-to-enable-expose-hardware-assiste.html'),
 ('vTPM donanımı ve vSphere 7.0 U2 anahtar sağlayıcısı', 'Broadcom KB 313843', 'https://knowledge.broadcom.com/external/article/313843/creating-new-virtual-machine-with-virtua.html'),
]

PAGES = [
('BAŞLANGIÇ', 'vSphere üzerinde\nWindows 11 + InfraScope', 'Sanal makine, Docker Desktop ve GitHub/GHCR üzerinden InfraScope kurulumu.', [
 ('cover', None),
 p('Bu kılavuz, InfraScope kullanıcısının Windows sanal makinesine bağlanıp tarayıcıyı bu makinede açtığı yerel kullanım içindir. Uygulama adresi <b>http://localhost:8170</b> olacaktır.'),
 table(['Belge', 'Hedef'], [('Kapsam / tarih', 'Online kurulum + güncelleme / 21 Ekim 2026'), ('Ortam', 'vSphere / ESXi + kalıcı Windows 11 x64 VM'), ('Çalışma motoru', 'WSL2 + Docker Desktop, Linux x86_64 imajları'), ('Dağıtım', 'GitHub Releases + GHCR; alternatif çevrimdışı 1.0.1')], [.31, .69]),
 note('Doğrulama sınırı', 'Windows + Docker Desktop üzerinde üretim imajlarıyla boş veritabanı, ilk kurulum, giriş ve geri yükleme provası yapıldı. Müşterinin ESXi sunucusunda henüz kurulum yapılmadı. Bu kılavuzdaki kontrol noktaları o ortamda uygulanmalıdır.'),
 p('İzlenecek sıra: ortam hazırlığı → anahtar sağlayıcısı → VM donanımı → Windows → WSL2 → Docker → paket → ilk yönetici → yedek → yeniden başlatma testi.'),
 p('<b>Sayfa rehberi</b><br/>vSphere ve Windows: 2-5 · WSL2 ve Docker: 6-7<br/>Kurulum ve ilk yönetici: 8-11 · İşletim, yedek ve güncelleme: 12-15<br/>Hata giderme: 16-17 · Teslim formu ve kaynaklar: 18-19'),
 ]),
('PLANLAMA', '01 / Başlamadan önce', 'Eksik bilgileri kurulumdan önce kayıt altına alın.', [
 table(['Kayıt', 'Doldurulacak bilgi'], [('vCenter / ESXi sürümü', '_______________________________'), ('Fiziksel işlemci', 'Intel / AMD - model: __________________'), ('VM adı / Windows adı', 'Örnek: IS-MUSTERI-01'), ('IP / ağ grubu / DNS', '_______________________________'), ('Kurulumu sürdürecek hesap', '_______________________________'), ('Lisans anahtarı / yedek hedefi', 'Anahtarı bu belgeye yazmayın; güvenli kasada tutun.')], [.39, .61]),
 h('Kaynak planı'),
 p('Küçük bir başlangıç kurulumu için mühendislik önerisi: <b>4 vCPU, 16 GB RAM ve 150 GB sanal disk</b>. Bu değerler yük testiyle garantilenmiş cihaz kapasitesi değildir. Envanter, olay saklama süresi ve yedek büyümesine göre kaynaklar izlenip artırılmalıdır. Datastore ve Windows sistem diski için büyüme payı bırakın.'),
 steps('Güncel ve Microsoft tarafından desteklenen Windows 11 Pro, Enterprise veya Education x64 ISO ve lisansını hazırlayın.', 'vCenter yetkisi, Windows yerel yönetici yetkisi, uygun port group ve DNS/zaman erişimini sağlayın.', 'WSL, Docker ve Windows güncellemeleri için gereken indirme erişimini planlayın. InfraScope lisans sunucusu: https://lisans.webmahsul.com.tr (TCP 443).', 'Her müşteri için ayrı VM/kurulum, veritabanı ve benzersiz anahtarlar kullanın.'),
 note('AMD ve destek koşulu', 'Broadcom, AMD için ESXi 7.0 U3o, 8.0 U1c veya sonraki uygun sürümleri belirtir. Docker, sanal makine ortamına yönelik resmi desteği Docker Business kapsamında sunar. Kurumun Docker abonelik ve destek koşullarını doğrulayın. Menü adları vSphere/Docker sürümüne göre değişebilir.'),
 refs(2, 4, 5), check('ESXi / CPU bilgisi kaydedildi; kaynak, ISO, ağ ve lisans erişimi hazır.'),
 ]),
('VSPHERE', '02 / Anahtar sağlayıcısı ve vTPM', 'Windows 11 için vTPM 2.0 ve uygun firmware hazırlığı.', [
 p('Ortamda uygun ve aktif bir anahtar sağlayıcısı zaten varsa yeni bir sağlayıcı oluşturmayın. Kurumun mevcut Native Key Provider veya KMS düzenini kullanın.'),
 p('Native Key Provider, vSphere 7.0 U2 ve sonrasında bulunur. Bu adımlar vCenter yönetimi varsayar; bağımsız ESXi hostunda desteklenen vTPM/anahtar yönetimi yolunu vSphere yöneticisiyle netleştirin.'),
 steps('vSphere Client içinde vCenter nesnesini seçin. Configure → Security → Key Providers bölümünü açın.', 'Yeni kurulumda Add Native Key Provider seçin ve kurum standardına uygun bir ad verin.', 'Yalnız TPM korumalı ESXi hostlarında kullanım seçeneğini fiziksel host özelliklerine göre belirleyin. Hostlarda TPM yoksa bu kısıtlama işaretli kalmamalıdır; değişikliği vSphere yöneticisiyle uygulayın.', 'Back Up işlemini tamamlayın. İndirilen .p12 dosyasını ve varsa parolasını güvenli, bağımsız bir yerde saklayın. Sağlayıcının etkin/kullanılabilir olduğunu doğrulayın.', 'VM oluştururken Add New Device → Trusted Platform Module ekleyin. VM Options → Boot Options altında EFI/UEFI ve Secure Boot ayarlarını doğrulayın.'),
 note('Kurtarma için saklayın', 'Key Provider yedeği, InfraScope uygulama yedeğinden farklıdır. vTPM ve VM erişimini kurtarmak için de gerekir. Sağlayıcıyı silmeyin; vTPM aygıtını sonradan kaldırmayın. Windows disk şifrelemesi kullanılırsa ilgili kurtarma anahtarını ayrıca kurum kasasında saklayın.'),
 h('vTPM eklenemiyorsa'),
 p('“Key provider is not configured” veya “TPM2 device is required” hatasında sağlayıcı durumu, yedeği ve host uygunluğunu kontrol edin. TPM gereksinimi karşılanmadan Windows kurulumu aşamasına geçmeyin.'),
 refs(1, 11), check('Anahtar sağlayıcısı kullanılabilir, yedeği saklandı, VM için vTPM seçilebiliyor.'),
 ]),
('VSPHERE', '03 / Sanal makineyi oluşturun', 'İç içe sanallaştırma, VM kapalıyken etkinleştirilir.', [
 steps('Create a new virtual machine sihirbazını başlatın. VM adı olarak örneğin IS-MUSTERI-01 kullanın; hedef cluster/host ve datastore seçin.', 'Hedef hostlarla uyumlu güncel VM compatibility düzeyini seçin. Guest OS alanında Windows 11 (64-bit) kullanın. Seçenek görünmüyorsa vSphere sürümünü/uyumluluğu doğrulayın.', 'Başlangıç kaynaklarını ayarlayın: 4 vCPU, 16 GB RAM, 150 GB disk. Thin disk kullanılıyorsa fiziksel datastore boşluğunu da izleyin.', 'Kurum ağına ait port group seçin; ağ aygıtının başlangıçta bağlı olmasını sağlayın. VMXNET3 kullanılacaksa Windows sürücüsünü/VMware Tools medyasını hazırlayın.', 'Windows ISO dosyasını sanal CD/DVD aygıtına bağlayıp açılışta bağlanmasını seçin. vTPM 2.0, EFI/UEFI ve Secure Boot ayarlarını kontrol edin.', 'CPU → Hardware Virtualization altında Expose hardware assisted virtualization to the guest OS seçeneğini etkinleştirin. Ayarları kaydedin.'),
 note('Ayarın amacı', 'Bu seçenek, Windows içindeki WSL2 motorunun sanallaştırma özelliklerine erişmesini sağlar. Sadece vCPU sayısını artırmak bu ayarı etkinleştirmez. Hyper-V için yazılmış Set-VMProcessor komutu vSphere yönetim komutu değildir.'),
 p('vGPU veya PCI passthrough bu VM için gerekli değildir. Bu tür aygıtlarla nested virtualization çakışması varsa kurum yöneticisiyle VM donanımını uygun hale getirin; bağımlı başka iş yükünün aygıtını kaldırmayın.'),
 refs(3, 10), check('VM donanımı kaydedildi; nested virtualization, vTPM ve firmware ayarları doğrulandı.'),
 ]),
('WINDOWS', '04 / Windows 11 kurulumu', 'Kalıcı bir VM ve kurulumdan sonra kullanılacak tek işletim hesabı.', [
 steps('VM konsolunu açın, ISO ile başlatın ve Windows 11 kurulumunu tamamlayın. Doğru disk, dil ve saat dilimini seçin.', 'Ağ aygıtı veya disk görünmüyorsa seçilen sanal donanımın Windows sürücüsünü yükleyin; ardından kurulum sihirbazına dönün.', 'Kurumun hesap/etki alanı politikasına uygun işletim hesabıyla oturum açın. Docker Desktop daha sonra aynı kullanıcı profili altında kullanılmalıdır.', 'vSphere içinden VMware Tools kurulum medyasını bağlayın, kurulumu tamamlayın ve gerekiyorsa yeniden başlatın.', 'Windows Update işlemlerini ve yeniden başlatmaları tamamlayın. Sanal makinenin IP, DNS, ağ geçidi ve saat eşitlemesini doğrulayın.', 'Ayarlar → Sistem → Güç bölümünde elektriğe bağlı kullanımda otomatik uyku/hibernasyon olmayacak şekilde kurum politikasını uygulayın.'),
 h('Windows içinden kontrol'),
 code(r'''hostname
ipconfig /all
wsl --version'''),
 p('WSL henüz yüklü değilse son komutun hata vermesi bu aşamada normaldir; bir sonraki adımda kurulacak. Windows sürümünü winver ile kontrol edin.'),
 note('Yerel erişim ne demektir?', 'http://localhost:8170 adresi, tarayıcının çalıştığı Windows VM’ini ifade eder. Kendi bilgisayarınızın tarayıcısında aynı adresi açmak VM’e bağlanmaz. Yerel kullanımda VM konsolundan veya kurumun yetkilendirdiği uzak masaüstü oturumundan VM içindeki tarayıcıyı açın.'),
 check('Windows güncel, Tools hazır, ağ/saat doğru ve işletim hesabı belirlendi.'),
 ]),
('WSL2', '05 / WSL2 bileşenini kurun', 'Komutlar Windows PowerShell içinde uygulanır.', [
 p('<b>Yönetici olarak PowerShell</b> açın. Yeni bir Windows kurulumunda aşağıdaki komut WSL bileşenlerini hazırlar; ayrıca Ubuntu kurmanız gerekmez.'),
 code('wsl --install --no-distribution'),
 p('Windows yeniden başlatma istiyorsa çalışmaları kaydedip VM’i yeniden başlatın. Aynı işletim hesabıyla tekrar oturum açın. Ardından yönetici PowerShell içinde devam edin:'),
 code('''wsl --update
wsl --set-default-version 2
wsl --version
wsl --status'''),
 p('Güncel WSL sürümünü kullanın; Docker belgesindeki alt sınır 2.1.5’tir. “Varsayılan sürüm 2” ile WSL yazılımının 2.x sürüm numarası farklı bilgilerdir. Docker Desktop kendi Linux ortamını oluşturur; ayrıca bir Linux dağıtımına Docker Engine kurmayın.'),
 h('WSL bileşeni etkin mi?'),
 code('Get-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform'),
 p('Çıktıda State: Enabled beklenir. Komutlar desteklenmiyorsa Windows güncellemelerini tamamlayın ve resmi WSL kurulum/hata giderme adımlarını izleyin. Nested virtualization hatasında 03. adımdaki VM CPU ayarına dönün.'),
 note('Devam koşulu', 'WSL komutlarında sanal makine başlatma/sanallaştırma hatası kalmamalıdır. Gereken Windows yeniden başlatmasını atlamayın. Üretim kurulumu sırasında wsl --shutdown çalıştırmak Docker iş yüklerini de durdurur.'),
 refs(6, 7, 9), check('WSL güncel, varsayılan sürüm 2, VirtualMachinePlatform etkin.'),
 ]),
('DOCKER', '06 / Docker Desktop kurulumu', 'Windows x64 kurucusu, WSL2 motoru ve Linux containers.', [
 steps('Docker’ın resmi Windows indirme sayfasından x86_64/AMD64 Docker Desktop kurucusunu indirin. ARM64 paketi bu InfraScope teslimi için uygun değildir.', 'Kurucuyu çalıştırın. WSL2 motoru seçeneği görünüyorsa etkinleştirin; istenen yetki ve yeniden başlatma adımlarını tamamlayın.', 'Windows işletim hesabıyla oturum açıp Docker Desktop’ı elle başlatın. Kurumun abonelik koşullarını değerlendirdikten sonra lisans sözleşmesini yetkili kişi kabul etmelidir.', 'Settings → General altında Use WSL 2 based engine ayarını doğrulayın. Uyumlu sistemde varsayılan açık olduğundan seçenek görünmeyebilir.', 'Docker Windows containers modundaysa menüden Linux containers moduna geçin. Docker motorunun Running durumuna gelmesini bekleyin.', 'Start Docker Desktop when you sign in ayarını etkinleştirin. Windows’ta başka bir hesapla giriş yapmak aynı WSL/Docker verilerini kullanacağı anlamına gelmez.'),
 h('Windows PowerShell içinde doğrulayın'),
 code('''docker version
docker compose version
docker info --format '{{.OSType}}/{{.Architecture}}'
docker context show'''),
 p('docker version hem Client hem Server bilgisi vermelidir. Platform çıktısı <b>linux/x86_64</b> veya <b>linux/amd64</b> olmalıdır. Server’a bağlanamıyorsanız InfraScope kurucusuna geçmeyin. Bağlamın uzaktaki başka bir Docker sunucusuna yönelmediğini doğrulayın.'),
 refs(4, 7, 8), check('Yerel Linux Docker motoru ve Compose çalışıyor.'),
 ]),
('PAKET', '07B / Çevrimdışı paketi açın', 'Alternatif yol: mevcut InfraScope 1.0.1 müşteri ZIP’i.', [
 p('Müşteri ZIP’ini ve güvenilir kanaldan alınmış SHA256SUMS-1.0.1.txt dosyasını VM’de örneğin C:\\Install klasörüne kopyalayın. Windows PowerShell içinde:'),
 code(r'''certutil -hashfile C:\Install\infrascope-customer-deploy-1.0.1.zip SHA256'''),
 p('Beklenen 1.0.1 ZIP SHA-256 değeri:'),
 code(EXPECTED),
 p('Değeri karakter karakter teslim manifestiyle karşılaştırın. Fark varsa dosyayı tekrar güvenilir kaynaktan alın; devam etmeyin. Hash eşleşmesi dosya bütünlüğünü gösterir; kaynağın kimliğini ayrıca güvenilir teslim kanalı belirler.'),
 h('Yeni kurulum klasörü'),
 code(r'''Expand-Archive `
  -LiteralPath C:\Install\infrascope-customer-deploy-1.0.1.zip `
  -DestinationPath C:\InfraScope
Set-Location C:\InfraScope\infrascope
Get-ChildItem'''),
 p('Beklenen dosyalar: install.ps1, backup.ps1, docker-compose.yml, env.example, INSTALL_WINDOWS.md ve images klasörü. images içinde uygulama, NMS ve PostgreSQL arşivleri ile image-manifest.json bulunur.'),
 note('Kalıcı konum', 'ZIP içinde infrascope üst klasörü vardır; yukarıdaki komutlarla çalışma yolu C:\\InfraScope\\infrascope olur. OneDrive/geçici klasör kullanmayın. Mevcut kurulumun üzerine Expand-Archive -Force uygulamayın; güncelleme prosedürünü izleyin.'),
 check('ZIP hash’i eşleşti, dosyalar kalıcı klasöre açıldı, üç imaj arşivi mevcut.'),
 ]),
('INFRASCOPE', '08 / Servisleri kurun', 'Normal PowerShell; gerektiğinde Windows’un yetki isteğini değerlendirin.', [
 code(r'''Set-Location C:\InfraScope\infrascope
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\install.ps1 -ProjectName infrascope-musteri'''),
 p('ExecutionPolicy Bypass yalnız bu PowerShell çalıştırması için kullanılır. Kurumun AppLocker/WDAC gibi uygulama politikalarını değiştirmez. Betik kısıtlanırsa kurumun onaylı imzalama/çalıştırma yöntemini kullanın.'),
 table(['Kurucu adımı', 'Oluşan durum'], [('Yapılandırma', 'Boş şablondan .env; benzersiz DB/oturum/şifreleme/NMS anahtarları'), ('İmaj hazırlığı', 'Paket arşivlerinin hash ve imaj kimliği doğrulaması, Docker’a yükleme'), ('Veritabanı', 'PostgreSQL volume ve bekleyen şema migration işlemleri'), ('Uygulama / NMS / yedek', 'app, nms, postgres, database-backup servisleri'), ('Son kontrol', 'Servislerin hazır/healthy olmasının beklenmesi')], [.30, .70]),
 p('İşlem bitene kadar terminali kapatmayın. Kurucu imajları paketten yükler; bu aşama registry hesabı gerektirmez. Docker/WSL kurulumu ve gerçek lisans etkinleştirmesi ayrıca ağ erişimi ister.'),
 h('8170 portu kullanımdaysa'),
 code(r'''powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\install.ps1 -ProjectName infrascope-musteri -AppPort 8171'''),
 p('Bu seçenekle uygulama adresi http://localhost:8171 olur; sonraki sağlık kontrolünde de bu portu kullanın. ProjectName ve kurulum yolu ilk kurulumdan sonra sabit kalmalıdır. Mevcut .env anahtarlarını elle yenilemeyin.'),
 check('Kurucu hata vermeden tamamlandı; terminalde kurulum adresi gösterildi.'),
 ]),
('INFRASCOPE', '09 / Lisans ve ilk yönetici', 'Sihirbazı Windows VM’in tarayıcısında tamamlayın.', [
 steps('Windows VM içinde Edge/Chrome açıp http://localhost:8170/setup adresine gidin. Farklı port seçtiyseniz o portu kullanın.', 'Müşteriye verilmiş lisans anahtarını girip Lisansı Aktive Et düğmesine basın. Hata varsa DNS, saat, proxy/sertifika ve lisans sunucusu erişimini düzeltin.', 'Kurum adını, ilk yönetici adını, e-posta adresini ve güçlü parolayı girin. İlk Admini Oluştur düğmesini kullanın.', 'Kurulum tamamlandı mesajından sonra Login Ekranına Git seçeneğiyle giriş yapın. Varsayılan yönetici hesabı/parolası yoktur.', 'Olay Merkezi ve Ağ Topolojisi sayfalarını açın; yükleme tamamlandıktan sonra sayfa içeriğini doğrulayın. Boş müşteri kurulumunda cihaz ve incident olmaması normaldir.'),
 h('Hazırlık ve kurulum durumunu doğrulayın'),
 code('''Invoke-RestMethod http://localhost:8170/api/health/ready
Invoke-RestMethod http://localhost:8170/api/setup/status'''),
 p('İlk yanıtta status: ready, version: 1.0.1 ve app/database için ready beklenir. İkinci yanıtta yönetici oluşturulduktan sonra hasAdmin: true ve setupRequired: false beklenir.'),
 note('Hazır olmak ile entegrasyon sağlığı farklıdır', 'Readiness, uygulama ve veritabanı erişimini kontrol eder. VMware/Fortinet/Zabbix/NMS/e-posta tanımlanmadan entegrasyon uyarıları olabilir. Bu, tek başına veritabanı kurulumunun başarısız olduğu anlamına gelmez. Varsayılan sistem alarm kataloğu, müşteri olayı değildir.'),
 check('Gerçek müşteri lisansı kabul edildi, ilk yönetici giriş yaptı, sayfalar yüklendi.'),
 ]),
('DOĞRULAMA', '10 / Entegrasyon ve kabul', 'Önce servisleri, sonra her gerçek veri kaynağını doğrulayın.', [
 code(r'''Set-Location C:\InfraScope\infrascope
docker compose ps
docker compose logs --tail 100 app nms database-backup'''),
 p('Dört servis için Up/healthy durumunu doğrulayın. Kurucu 300 saniyede zaman aşımına uğrarsa günlükleri inceleyin; terminalde başarısız kurulum varken hizmeti kabul etmeyin. Günlükler kuruma özel bilgi içerebilir; destekle paylaşmadan önce maskeleyin.'),
 table(['İşlev', 'Müşteride yapılacak doğrulama'], [('VMware / Fortinet / Zabbix', 'Doğru uç nokta, yetkili servis hesabı, TLS güven zinciri ve bağlantı testi'), ('SNMP / SSH izleme', 'VM’den ve Docker içinden hedefe yönlendirme/ACL; gerçek cihaz test isteği'), ('E-posta', 'SMTP ayarları ve yetkili adrese kontrollü test iletisi'), ('Olay akışı', 'İzinli bir test alarmı ile liste/detay/çözme işlemi; sonra test kaydını temizleme')], [.33, .67]),
 p('vSphere port group, Windows güvenlik duvarı, yönlendirici ACL ve cihaz erişim listelerini birlikte değerlendirin. Windows içindeki bir TCP bağlantı testi, konteynerin eriştiğini tek başına kanıtlamaz. SNMP için TCP testi kullanmayın; uygulamanın gerçek protokol testini kullanın.'),
 note('Yerel web erişimi', 'PostgreSQL 5432 ve NMS 8500 dışarı açılmamalıdır. Mevcut Compose web portunu host arayüzlerinde yayınlayabilir; Windows güvenlik duvarında 8170’i LAN’a açmayın. Başka bilgisayarlardan web erişimi gerekiyorsa alan adı, HTTPS ve uygulama URL’si ayrıca yapılandırılmalıdır.'),
 check('Dört servis healthy; tanımlanan her entegrasyon gerçek müşteri ortamında doğrulandı.'),
 ]),
('İŞLETİM', '11 / Yeniden başlatma provası', 'Docker Desktop’ın Windows kullanıcı oturumuna bağlı başlangıcını doğrulayın.', [
 steps('İlk taşınabilir yedeği alın (12. adım). Kullanıcıdan planlı kesinti için uygun zamanı belirleyin.', 'Windows’u normal biçimde yeniden başlatın. Aynı işletim hesabıyla tekrar oturum açın.', 'Docker Desktop’ın açıldığını ve motorun Running durumuna geldiğini doğrulayın.', 'Kurulum klasöründe docker compose ps ve readiness kontrolünü çalıştırın. Gerekirse aşağıdaki kontrollü başlatmayı uygulayın.', 'Yöneticiyle tekrar giriş yapın; kurum, kullanıcılar ve lisans durumunun korunduğunu doğrulayın.', 'Bir cihaz entegrasyonu varsa yeni ölçümün/alım zamanının ilerlediğini kontrol edin. Sonucu teslim kontrol listesine işleyin.'),
 code(r'''Set-Location C:\InfraScope\infrascope
docker compose up -d --wait --wait-timeout 300
Invoke-RestMethod http://localhost:8170/api/health/ready'''),
 table(['Günlük işlem', 'Komut / anlam'], [('Durum / günlük', 'docker compose ps / docker compose logs --tail 100 app nms'), ('Planlı durdurma', 'docker compose stop'), ('Tekrar başlatma', 'docker compose start; ardından ps/readiness kontrolü')], [.32, .68]),
 note('7/24 işletim kabul koşulu', 'Docker Desktop’ın “oturum açınca başlat” seçeneği, Windows açılır açılmaz kullanıcı oturumu olmadan hizmet vereceği anlamına gelmez. Yeniden başlatma sonrası işletim hesabıyla giriş ve doğrulama sürecini kurumla belirleyin. Uyku, oturum profili silinmesi, Docker’ın kapanması veya disk dolması izlemeyi keser.'),
 p('Compose proje adını değiştirmek başka volume’ların seçilmesine neden olabilir. .env, makine kimliği ve şifreleme anahtarlarını koruyun. VM snapshot geri dönüşü lisans ve veri zamanını da geri alabilir; kontrollü kurtarma prosedürü kullanın.'),
 refs(8), check('Windows yeniden başlatıldı; uygulama, veri ve izleme geri geldi.'),
 ]),
('YEDEK', '12 / Şifreli taşınabilir yedek', 'Veritabanı ile birlikte kurulum anahtarlarını koruyun.', [
 steps('C:\\Private gibi yalnız yetkili işletim hesabının eriştiği bir yerde, en az 16 baytlık tek satırdan oluşan güçlü kurtarma parolası dosyası hazırlayın. Metin düzenleyicide UTF-8 olarak saklayın.', 'Dosyanın Windows izinlerini kontrol edin. Örnek dosya adı: infrascope-recovery-passphrase.txt. Parolayı komut satırına veya bu belgeye yazmayın.', 'Kurulum klasöründen aşağıdaki yedek komutunu çalıştırın.', 'backups altında oluşan .isbackup dosyasını farklı disk/sunucu/depolamaya kopyalayın. Kurtarma parolasını yedekten ayrı güvenli kasada saklayın.', 'İlk teslimde ve önemli sürüm değişimlerinde ayrı bir test ortamında geri yükleme doğrulaması yapın. Canlı veritabanını prova için sıfırlamayın.'),
 code(r'''Set-Location C:\InfraScope\infrascope
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\backup.ps1 `
  -PassphraseFile C:\Private\infrascope-recovery-passphrase.txt
Get-ChildItem .\backups -Filter *.isbackup'''),
 table(['Kayıt', 'Kurtarma açısından rolü'], [('backups\\database', 'Otomatik DB dump’ları; tek başına kurulum anahtarlarının yerini tutmaz'), ('.isbackup', 'Parolayla şifrelenmiş DB dump + kurulum anahtar/kimlik malzemesi'), ('.env ve data', 'Kuruluma özel anahtarlar, lisans cache ve makine kimliği'), ('Docker volume', 'Canlı PostgreSQL verisi; sadece C:\\InfraScope klasörünü kopyalamak tüm DB’yi taşımaz')], [.31, .69]),
 note('Kurtarma ve saklama', 'Paketteki BACKUP_OPERATIONS.md kurtarma işlemlerinin teknik kaynağıdır. Yanlış parola yedeği açmaz. Yeni kurulum anahtarları üretip eski şifreli kayıtları açmaya çalışmayın. vSphere snapshot ve aynı VM diski üzerindeki yedek, bağımsız yedek kopyasının yerine geçmez.'),
 check('İlk .isbackup oluşturuldu, bağımsız hedefe kopyalandı, parola ayrı saklandı.'),
 ]),
('HATA GİDERME', '13 / Sanallaştırma ve Docker', 'Belirtiye göre ilk kontrolü uygulayın; verileri sıfırlamayın.', [
 table(['Belirti', 'Kontrol / sonraki adım'], [
 ('Windows kurulumu TPM istiyor', 'Aktif Key Provider, provider yedeği, VM vTPM 2.0 ve EFI/Secure Boot ayarlarını kontrol edin.'),
 ('0x80370102 / VMX yok / Hyper-V başlatılamıyor', 'VM’i kapatın; CPU sanallaştırmasını konuğa açın. ESXi/CPU uygunluğunu, WSL Windows özelliğini ve yeniden başlatmayı doğrulayın.'),
 ('AMD üzerinde Windows açılış döngüsü', 'Güncel ESXi/Windows yamalarını ve Broadcom’un tam sürüm eşleşmesini kontrol edin. Rastgele güvenlik özelliği kapatarak üretim standardı oluşturmayın.'),
 ('Nested virtualization seçilemiyor', 'VM kapalı mı? Host/VM uyumluluğu ve varsa vGPU/PCI passthrough çakışmasını inceleyin.'),
 ('docker: command not found', 'Docker Desktop kurulumu ve Windows terminalinin yeniden açılması; CLI PATH durumunu kontrol edin.'),
 ('Docker daemon’a bağlanamıyor', 'Aynı işletim hesabıyla Docker Desktop’ı açın. docker version Server bölümünü, context ve WSL durumunu kontrol edin.'),
 ('Platform windows/amd64 görünüyor', 'Docker menüsünden Linux containers moduna geçin. Sonra docker info kontrolünü tekrarlayın.'),
 ('WSL güncellenmiyor / kurulum indiremiyor', 'Kurumsal proxy, Microsoft/Store indirme erişimi ve Windows güncellemelerini kontrol edin. Microsoft’un web-download seçeneğini yalnız kurum izniyle değerlendirin.'),
 ], [.37, .63]),
 p('Bu kılavuz WSL2 motorunu kullanır. Sistem gereksinimlerini karşılayamayan bir VM’de kurucuya tekrar basmak nested virtualization sorununu çözmez. Hyper-V/WSL/VBS bileşenlerini topluca kapatmak Docker motorunun çalışmasını engelleyebilir.'),
 refs(1, 2, 3, 9, 10), check('WSL ve Docker hatası giderildi; Linux motoru gerçekten çalışıyor.'),
 ]),
('HATA GİDERME', '14 / InfraScope kurulumu', 'Önce hata kaydını okuyun, ardından aynı kurulumda güvenli tekrar deneyin.', [
 table(['Belirti', 'Kontrol / sonraki adım'], [
 ('8170 portu meşgul', 'Get-NetTCPConnection -LocalPort 8170 -ErrorAction SilentlyContinue ile inceleyin. Başka uygulamayı kapatmak yerine kurucuda -AppPort 8171 seçebilirsiniz.'),
 ('Image archive checksum mismatch', 'ZIP ve içeriği güvenilir kanaldan tekrar alın. Manifesti değiştirerek kontrolü atlamayın.'),
 ('Registry unauthorized / pull hatası', 'Pakette üç .tar ve image-manifest.json var mı? Yalnız kaynak kod paketiyle çevrimdışı kurulum yapılamaz.'),
 ('app / postgres unhealthy veya 503', 'docker compose ps ve app/postgres günlüklerini okuyun. Disk alanı, DB erişimi ve migration hatasını inceleyin. .env veya volume silmeyin.'),
 ('Lisans aktive olmuyor', 'VM saati, DNS ve lisans sunucusuna TCP443 erişimini kontrol edin. Müşteri anahtarının doğru ve bu kurulum için uygun olduğunu teyit edin.'),
 ('IP ile giriş oluyor gibi ama oturum kalmıyor', 'Yerel kullanımda VM içinden localhost adresini kullanın. LAN erişimini HTTPS/uygun URL ile ayrıca yapılandırın.'),
 ('Access denied / betik çalışmıyor', 'Kalıcı yerel klasör, aynı işletim hesabı, NTFS izinleri ve kurum uygulama denetimi politikalarını kontrol edin.'),
 ('Yeniden başlatınca boş kurulum açılıyor', 'Aynı Windows hesabı, Docker context, kurulum yolu ve COMPOSE_PROJECT_NAME kullanılıyor mu? Farklı proje/engine başka volume seçebilir.'),
 ], [.36, .64]),
 note('Veriyi koruyan müdahale', 'Factory reset, Docker verilerini silme, volume kaldırma, .env silip yeniden oluşturma ve vTPM kaldırma işlemleri normal hata giderme adımı değildir. Kurulumda tekrar denemek için aynı klasörde aynı install.ps1 komutunu kullanın; proje adını koruyun.'),
 p('Online güncellemede 12A adımındaki update.ps1 komutunu kullanın. Betik zorunlu şifreli yedek alır ve mevcut ayarları korur. Sadece eski uygulama etiketine dönmek, veritabanı değişikliklerini geri almaz.'),
 check('Hatalar giderildi veya açıklamalarıyla kayıt altına alındı; veri korundu.'),
 ]),
('TESLİM', '15 / Kabul ve kayıt formu', 'Her satırı gerçek müşteri ortamındaki sonuçla işaretleyin.', [
 table(['Kontrol', 'Sonuç / not'], [
 ('ESXi sürümü / CPU / nested virtualization uygun', '[ ] ______________________________'),
 ('Key Provider yedeği, vTPM, UEFI/Secure Boot', '[ ] ______________________________'),
 ('Windows güncel; ağ/saat/işletim hesabı doğru', '[ ] ______________________________'),
 ('WSL güncel; Docker yerel Linux x86_64', '[ ] ______________________________'),
 ('1.0.1 ZIP hash’i doğrulandı', '[ ] ______________________________'),
 ('Dört Compose servisi healthy', '[ ] ______________________________'),
 ('Gerçek lisans ve ilk yönetici girişi', '[ ] ______________________________'),
 ('Olay Merkezi / Ağ Topolojisi yükleme tamam', '[ ] ______________________________'),
 ('Gerçek entegrasyon ve yeni ölçüm doğrulandı', '[ ] ______________________________'),
 ('Şifreli yedek dış depoda; parola ayrı kasada', '[ ] ______________________________'),
 ('Yeniden başlatma / oturum sonrası geri geliş', '[ ] ______________________________'),
 ('Test kayıtları temiz; işletim sorumlusu belli', '[ ] ______________________________'),
 ], [.64, .36]),
 h('Teslim bilgileri'),
 p('Kurulum yolu: C:\\InfraScope\\infrascope<br/>Proje adı: infrascope-musteri<br/>Uygulama adresi: http://localhost:8170<br/>Yedek hedefi: _________________________________________<br/>İşletim sorumlusu / tarih: ________________________________<br/>Kurulumu yapan / tarih: _________________________________'),
 note('Parolaları bu forma yazmayın', 'Windows, ilk yönetici, lisans, Key Provider ve kurtarma parolası kasadaki konumlarıyla teslim edilmelidir. Oturum açmadan otomatik başlatma gereksinimi varsa ayrıca kabul maddesi olarak ele alın.'),
 ]),
('KAYNAKLAR', '16 / Resmi kaynaklar ve kapsam', 'Web kaynakları 21 Ekim 2026 tarihinde kontrol edildi.', [
 ('sources', None),
 h('InfraScope kaynak ve doğrulama kayıtları'),
 p('Komutlar, mevcut 1.0.1 kurucusundaki parametrelerle karşılaştırılmıştır: deploy/install.ps1, deploy/backup.ps1, deploy/docker-compose.yml, deploy/INSTALL_WINDOWS.md ve readiness/setup API sözleşmeleri. Mevcut sürüm doğrulaması: 565/565 Chromium senaryosu, temiz TypeScript/lint, boş DB ve şifreli geri yükleme provası.'),
 p('Belgedeki vSphere/Windows/WSL hazırlık komutları müşterinin hostunda uygulanmış gibi raporlanmaz. Gerçek müşteri lisansı ve cihaz erişimi için bu kılavuzun kabul formu tamamlanmalıdır. Kaynak menüleri ve destek koşulları değişirse resmi güncel belgeyi esas alın.'),
 ]),
]

PAGES.insert(7, ('GITHUB / GHCR', '07A / İnternetten kurulum', 'Büyük imaj ZIP’i taşımadan küçük kurulum dosyasıyla başlayın.', [
 p('<a href="https://github.com/celebigilfatih/infrascope/releases">InfraScope Releases</a> sayfasından install-infrascope.ps1 ve SHA256SUMS-online dosyalarını alın. Code → Download ZIP yalnız kaynak koddur. Betiği güvenilir release hash’iyle karşılaştırın. Aşağıda <b>1.0.2 örnektir</b>; yalnız gerçekten yayımlanmış sürümü seçin. Bu kılavuz uzak yayın yapıldığını göstermez.'),
 code(r'''Get-FileHash .\install-infrascope.ps1 -Algorithm SHA256
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\install-infrascope.ps1 -Version 1.0.2 `
  -Destination C:\InfraScope\infrascope `
  -ProjectName infrascope-musteri'''),
 p('Hedef klasör boş olmalıdır. Başlatıcı release ZIP’inin GitHub SHA-256 değerini, paket dosyalarını ve sürümü doğrular. App, NMS ve PostgreSQL imajları sabit digest referanslarıyla indirilir. Sonra 09. adımdaki lisans/ilk yönetici adımına geçin; 07B ve 08 çevrimdışı alternatifidir.'),
 note('Özel depo / imaj', 'Özel release erişimi için GH_TOKEN yalnız o PowerShell oturumunda ayarlanır. Özel GHCR imajları için aynı Windows kullanıcısıyla docker login ghcr.io gerekir. Tokenı .env veya betiğe yazmayın; ayrıntılar INSTALL_WINDOWS.md içindedir. Açık paketlerde giriş gerekmez.'),
 p('GitHub API/release indirme alanları, GHCR ve Docker Hub HTTPS erişimi gerekir. Kurulum başladıktan sonra hata olursa kalıcı klasörde install.ps1 ile devam edin; başlatıcı mevcut kurulumun üzerine yazmaz.'),
 check('Doğru yayımlanmış sürüm seçildi; hash ve imaj erişimleri doğrulandı.'),
]))
backup_page = next(index for index, page in enumerate(PAGES) if page[1].startswith('12 /'))
PAGES.insert(backup_page + 1, ('GÜNCELLEME', '12A / Yedek alarak güncelleyin', 'Aynı kurulum yolu, aynı Docker projesi ve korunmuş müşteri ayarları.', [
 p('Yeni sürümün release notlarını okuyun. Bakım penceresinde kullanıcı/entegrasyon yazmalarını durdurun. Docker Desktop çalışır durumda olsun. VERSION değerini elle değiştirmeyin. <b>1.0.2 örnek sürümdür.</b>'),
 code(r'''Set-Location C:\InfraScope\infrascope
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\update.ps1 -Version 1.0.2 `
  -PassphraseFile C:\Private\infrascope-recovery-passphrase.txt'''),
 table(['Adım', 'Davranış'], [('Hazırlık', 'Release hash’leri ve digest sabitli imajlar doğrulanır'), ('Zorunlu yedek', 'Şifreli .isbackup tamamlanmadan servisler değişmez'), ('Uygulama', 'Dağıtım dosyaları + yalnız VERSION; müşteri anahtar/veri/kimliği korunur'), ('Hazır olma', 'Migration ve servis sağlık kontrolleri en fazla 300 sn beklenir')], [.27, .73]),
 p('Eski çevrimdışı pakette updater yoksa yeni küçük ZIP’i ayrı yere açın; yalnız update.ps1, release-common.ps1 ve -PassThru destekli backup.ps1 dosyalarını hash doğrulamasıyla mevcut klasöre alın. .env/data klasörlerini yeni dosyalarla değiştirmeyin.'),
 note('Yarım kaldıysa', '.update-state.json dosyasını silmeyin. Hata giderildikten sonra aynı sürüm/depo ile tekrar deneyin; ilk kurtarma yedeği korunur. Migration sonrası otomatik eski imaja dönüş yapılmaz. Kurtarma gerekiyorsa BACKUP_OPERATIONS.md izlenir.'),
 p('Yedeği bağımsız depolamaya kopyalayın; parolasını ayrı saklayın. Elle Compose komutlarında -f docker-compose.yml -f release-images.yml seçeneklerini birlikte kullanın. Normal güncellemede volume silinmez.'),
 check('Tüm servisler healthy; müşteri verileri/ayarları doğru; yedek ve parola ayrı saklandı.'),
]))

GREEN = colors.HexColor('#087F5B'); INK=colors.HexColor('#132B2A'); MUTED=colors.HexColor('#526663'); PALE=colors.HexColor('#EDF7F2'); LINE=colors.HexColor('#D9E6E0')
STYLES = {
 'body': ParagraphStyle('body',fontName='Guide',fontSize=10,leading=14.3,textColor=INK,spaceAfter=8),
 'small': ParagraphStyle('small',fontName='Guide',fontSize=8.5,leading=11.5,textColor=MUTED,spaceAfter=6),
 'h': ParagraphStyle('h',fontName='GuideBold',fontSize=12,leading=16,textColor=GREEN,spaceBefore=7,spaceAfter=7),
 'title': ParagraphStyle('title',fontName='GuideBold',fontSize=25,leading=29,textColor=INK,spaceAfter=10),
 'lede': ParagraphStyle('lede',fontName='Guide',fontSize=11,leading=15.5,textColor=MUTED,spaceAfter=16),
 'cell': ParagraphStyle('cell',fontName='Guide',fontSize=9,leading=12,textColor=INK),
 'head': ParagraphStyle('head',fontName='GuideBold',fontSize=9,leading=12,textColor=colors.white),
}
WIDTH=A4[0]-90

class Pipeline(Flowable):
    def __init__(self): super().__init__();self.width=WIDTH;self.height=118
    def draw(self):
        c=self.canv
        items=[('vSphere / ESXi','Fiziksel sanallaştırma'),('Windows 11','Kalıcı sanal makine'),('WSL2 + Docker','Yerel Linux motoru'),('InfraScope','App + NMS + PostgreSQL')]
        gap=8;w=(WIDTH-3*gap)/4
        for i,(title,sub) in enumerate(items):
            x=i*(w+gap);c.setFillColor(PALE if i<3 else GREEN);c.roundRect(x,36,w,67,7,fill=1,stroke=0)
            c.setFillColor(INK if i<3 else colors.white);c.setFont('GuideBold',10);c.drawCentredString(x+w/2,78,title)
            c.setFont('Guide',7.3);c.drawCentredString(x+w/2,59,sub)
            if i<3:c.setStrokeColor(GREEN);c.line(x+w+1,68,x+w+gap-1,68)
        c.setFillColor(MUTED);c.setFont('Guide',9);c.drawString(0,14,'Yerel tarayıcı: http://localhost:8170  |  İlk kurulum: /setup')

def make_table(headers, rows, ratios):
    ratios=ratios or [1/len(headers)]*len(headers)
    data=[[Paragraph(html.escape(str(v)),STYLES['head']) for v in headers]]+[[Paragraph(html.escape(str(v)),STYLES['cell']) for v in row] for row in rows]
    t=Table(data,colWidths=[WIDTH*v for v in ratios],repeatRows=1,hAlign='LEFT')
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),GREEN),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#F5F8F6')]),('LINEBELOW',(0,1),(-1,-1),.4,LINE)]))
    return [t,Spacer(1,10)]

def pdf_blocks(blocks):
    result=[]
    for kind,value in blocks:
        if kind=='p':result.append(Paragraph(value,STYLES['body']))
        elif kind=='h':result.append(Paragraph(value,STYLES['h']))
        elif kind=='cover':result.append(Pipeline())
        elif kind=='code':
            max_chars=max(map(len,value.splitlines()));size=min(9.1,WIDTH/max(max_chars,1)/.57-0.45)
            style=ParagraphStyle('code',fontName='Code',fontSize=size,leading=size*1.45,textColor=INK)
            box=Table([[Preformatted(value,style)]],colWidths=[WIDTH]);box.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#F1F5F4')),('BOX',(0,0),(-1,-1),.5,LINE),('LEFTPADDING',(0,0),(-1,-1),12),('RIGHTPADDING',(0,0),(-1,-1),12),('TOPPADDING',(0,0),(-1,-1),10),('BOTTOMPADDING',(0,0),(-1,-1),10)]));result += [box,Spacer(1,10)]
        elif kind=='steps':
            for i,text in enumerate(value,1):result.append(Paragraph(f'<b>{i:02d}.</b> {html.escape(text)}',STYLES['body']))
        elif kind=='table':result+=make_table(*value)
        elif kind in ('note','check'):
            title,text=value if kind=='note' else ('Kontrol noktası',value)
            box=Table([[Paragraph(f'<b>{html.escape(title)}</b><br/>{html.escape(text)}',STYLES['body'])]],colWidths=[WIDTH]);box.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),PALE),('LINEBEFORE',(0,0),(0,-1),3,GREEN),('LEFTPADDING',(0,0),(-1,-1),12),('RIGHTPADDING',(0,0),(-1,-1),12),('TOPPADDING',(0,0),(-1,-1),10),('BOTTOMPADDING',(0,0),(-1,-1),5)]));result += [box,Spacer(1,10)]
        elif kind=='refs':result.append(Paragraph('Resmi kaynak: '+', '.join(f'[{n}]' for n in value)+' - bağlantılar son sayfada.',STYLES['small']))
        elif kind=='sources':
            for i,(title,org,url) in enumerate(SOURCES,1):
                result.append(Paragraph(f'<b>[{i}] {html.escape(org)} - {html.escape(title)}</b><br/><link href="{html.escape(url,quote=True)}" color="#087F5B">{html.escape(url)}</link>',STYLES['small']))
    return result

def decorate(c, doc):
    c.saveState()
    n=c.getPageNumber();c.setStrokeColor(LINE);c.line(45,800,A4[0]-45,800);c.setFillColor(GREEN);c.setFont('GuideBold',9);c.drawString(45,812,'InfraScope / Kurulum Kılavuzu');c.setFont('Guide',8);c.setFillColor(MUTED);c.drawRightString(A4[0]-45,812,'Windows 11 + vSphere / 1.0.1')
    c.line(45,42,A4[0]-45,42);c.setFont('Guide',8);c.drawString(45,28,'21 Ekim 2026  /  Yerel müşteri kurulumu');c.drawRightString(A4[0]-45,28,f'{n:02d} / {len(PAGES):02d}')
    c.restoreState()

def render_html():
    parts=[]
    for n,(phase,title,lede,blocks) in enumerate(PAGES,1):
        body=[f'<section class="sheet" id="adim-{n}"><header><b>InfraScope</b><span>{html.escape(phase)} / {n:02d}</span></header><h1>{html.escape(title).replace(chr(10),"<br>")}</h1><p class="lede">{html.escape(lede)}</p>']
        for kind,value in blocks:
            if kind=='p':body.append(f'<p>{value}</p>')
            elif kind=='h':body.append(f'<h2>{html.escape(value)}</h2>')
            elif kind=='code':body.append(f'<pre><code>{html.escape(value)}</code></pre>')
            elif kind=='steps':body.append('<ol>'+''.join(f'<li>{html.escape(t)}</li>' for t in value)+'</ol>')
            elif kind=='table':
                heads,rows,_=value;body.append('<table><thead><tr>'+''.join(f'<th>{html.escape(t)}</th>' for t in heads)+'</tr></thead><tbody>'+''.join('<tr>'+''.join(f'<td>{html.escape(str(t))}</td>' for t in row)+'</tr>' for row in rows)+'</tbody></table>')
            elif kind in ('note','check'):
                a,b=value if kind=='note' else ('Kontrol noktası',value);body.append(f'<aside><b>{html.escape(a)}</b><p>{html.escape(b)}</p></aside>')
            elif kind=='refs':body.append('<p class="source">Resmi kaynak: '+', '.join(f'<a href="#kaynak-{k}">[{k}]</a>' for k in value)+'</p>')
            elif kind=='sources':body.append('<ol class="sources">'+''.join(f'<li id="kaynak-{i}"><b>{html.escape(org)} - {html.escape(title)}</b><br><a href="{html.escape(url,quote=True)}">{html.escape(url)}</a></li>' for i,(title,org,url) in enumerate(SOURCES,1))+'</ol>')
            elif kind=='cover':body.append('<div class="pipeline">'+''.join(f'<div><b>{a}</b><small>{b}</small></div>' for a,b in [('vSphere / ESXi','Fiziksel sanallaştırma'),('Windows 11','Kalıcı sanal makine'),('WSL2 + Docker','Yerel Linux motoru'),('InfraScope','App + NMS + PostgreSQL')])+'</div>')
        body.append(f'<footer>21 Ekim 2026 / InfraScope kurulum ve güncelleme <span>{n:02d} / {len(PAGES):02d}</span></footer></section>');parts+=body
    style='''*{box-sizing:border-box}body{margin:0;background:#e8efeb;color:#132b2a;font:15px/1.5 Arial,sans-serif}.sheet{background:white;width:900px;max-width:calc(100% - 32px);margin:24px auto;padding:42px 50px;box-shadow:0 4px 24px #132b2a12}header{display:flex;justify-content:space-between;border-bottom:1px solid #d9e6e0;padding-bottom:14px;color:#087f5b}header span{font-size:12px;letter-spacing:1px}h1{font-size:31px;line-height:1.15;margin:26px 0 12px}h2{font-size:18px;color:#087f5b;margin:22px 0 9px}.lede{font-size:17px;color:#526663;margin-bottom:22px}p{margin:10px 0}li{padding-left:5px;margin:12px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f1f5f4;border:1px solid #d9e6e0;padding:15px;font:13px/1.6 Consolas,monospace;border-radius:6px}table{width:100%;border-collapse:collapse;font-size:14px;margin:18px 0}th{background:#087f5b;color:white;text-align:left}td,th{padding:11px 12px;vertical-align:top;border-bottom:1px solid #d9e6e0}tbody tr:nth-child(even){background:#f5f8f6}td:first-child{width:34%}aside{background:#edf7f2;border-left:4px solid #087f5b;padding:14px 18px;margin:18px 0}aside p{margin:6px 0 0}.pipeline{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:28px 0}.pipeline div{background:#edf7f2;padding:20px 9px;text-align:center;border-radius:8px}.pipeline div:last-child{background:#087f5b;color:white}.pipeline small{display:block;font-size:11px;margin-top:9px}.source,.sources{font-size:12px;color:#526663}a{color:#087f5b;overflow-wrap:anywhere}.sources li{margin:9px 0}footer{border-top:1px solid #d9e6e0;font-size:12px;color:#526663;margin-top:30px;padding-top:12px}footer span{float:right}.tools{position:sticky;top:0;background:#132b2a;color:white;padding:12px 24px;display:flex;gap:20px;align-items:center;justify-content:center;z-index:10}.tools button{border:0;border-radius:5px;background:#22b383;color:white;padding:9px 16px;cursor:pointer}@media(max-width:650px){.sheet{padding:24px}.pipeline{grid-template-columns:1fr 1fr}h1{font-size:27px}header span{font-size:10px}}@media print{@page{size:A4;margin:12mm}.tools{display:none}body{background:white;font-size:10pt}.sheet{width:auto;max-width:none;margin:0;padding:0;box-shadow:none;break-after:page}.sheet:last-child{break-after:auto}h1{font-size:24pt}pre{font-size:9pt}table{font-size:9pt}tr,pre,aside{break-inside:avoid}}'''
    style+='@media(max-width:650px){.tools{flex-wrap:wrap;font-size:12px;padding:10px}.tools span{display:none}table{font-size:12px}td,th{padding:8px}}'
    HTML.write_text('<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>InfraScope - vSphere / Windows 11 kurulum kılavuzu</title><style>'+style+'</style><div class="tools"><b>InfraScope</b><span>vSphere → Windows 11 → Docker → InfraScope</span><button onclick="window.print()">Yazdır / PDF</button></div><main>'+''.join(parts)+'</main></html>',encoding='utf8')

if __name__=='__main__':
    OUT.mkdir(parents=True,exist_ok=True);HTML.parent.mkdir(parents=True,exist_ok=True)
    story=[]
    for n,(phase,title,lede,blocks) in enumerate(PAGES,1):
        if n>1:story.append(PageBreak())
        story.append(Paragraph(f'{phase} / {n:02d}',STYLES['h']));story.append(Paragraph(html.escape(title).replace('\n','<br/>'),STYLES['title']));story.append(Paragraph(html.escape(lede),STYLES['lede']));story+=pdf_blocks(blocks)
    doc=SimpleDocTemplate(str(PDF),pagesize=A4,rightMargin=45,leftMargin=45,topMargin=62,bottomMargin=56,title='InfraScope - vSphere Windows 11 Kurulum Kılavuzu',author='InfraScope',subject='InfraScope 1.0.1 Windows + Docker Desktop müşteri kurulumu')
    doc.build(story,onFirstPage=decorate,onLaterPages=decorate);render_html()
    print(json.dumps({'pdf':str(PDF),'html':str(HTML),'plannedPages':len(PAGES),'packageSha256':EXPECTED},ensure_ascii=False,indent=2))
