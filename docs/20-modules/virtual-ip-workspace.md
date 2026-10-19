# Sanal IP Adresleri

`/security/virtual-ips` ortak ikon, başlık, durum etiketi ve çalışma alanı tasarımını kullanır. Cihaz ve VDOM seçilmeden genel/varsayılan FortiGate okunmaz. Tek bağlı cihaz otomatik seçilir; devre dışı profilde kaynak çağrısı yapılmaz. Eşleşmemiş profiller kurulum yönlendirmesi gösterir.

Eşlemeler seçili `/api/firewalls/:connectorId/virtual-ips` kaynağından okunur. Var olan `/vips` sözleşmesi korunmuştur. Yeni okuma, mevcut kapsamlı REST okuma zarfını ve hata sınıflandırmasını kullanır. Seçili profilin sanal IP modülü kapalıysa doğrulanmış boş liste olarak sunulmaz. Politika modülü kapalıysa veya politikalar okunamazsa VIP listesi korunur; kullanım bilgisi bilinmiyor olur.

- Dış IP → iç IP/aralık ve dış port → iç port aynı akışta gösterilir. Çoklu hedef, port aralığı ve protokol korunur. Port çevrimi kapalıysa kaynak varsayılan port değerleri uygulanıyormuş gibi gösterilmez.
- Kaynakta `status` yoksa pasif sayılmaz. Etkin/kapalı tanım, politika eşleşmesi ve trafik kullanımı birbirinden ayrıdır.
- Kullanım etiketi, aynı VDOM'daki politikaların `dstaddr` alanında VIP adına **birebir** başvuru arar. Hem etkin hem kapalı politika ayrıntıları gösterilir. Tek bir politikada yinelenen ad sayılmaz. VIP grubu/dolaylı başvuru ve canlı oturum/son trafik incelenmez; doğrudan başvuru bulunamaması “kullanılmıyor” anlamına gelmez.
- Özetler seçili cihazın tüm tanımlarına, liste sayısı filtre sonucuna aittir. Arama, durum/port çevrimi/politika filtreleri sunucuda; sayfalama onarlı, arama gecikmesi 300 ms. Sayfa daralınca son geçerli sayfaya dönülür.
- Bağlı cihaz açıkça güvenlik duvarı olarak adlandırılır. İç IP'nin hangi sunucuya ait olduğu tahmin edilmez. Ayrıntı penceresi kaynak zamanını, cihazı, VDOM'u, eşlemeyi ve doğrudan politikaları gösterir.
- İstemci cihaz, profil ve VDOM zarfını doğrular; önceki hedefin yanıtı yeni hedefe taşınmaz. Yenileme hatasında önceki veri etiketlenir. Boş, hata, yükleniyor ve bilinmiyor durumları ayrıdır. Ham sağlayıcı hataları gösterilmez.
- Otomatik periyodik sorgu veya yazma/ayar değişikliği eklenmemiştir. Salt GET okumalarıdır.

Kontroller: `node scripts/check-virtual-ips.cjs`, TypeScript, ilgili dosyalarda ESLint ve mevcut firewall okuma/filtre/SNMP sözleşme testleri. Tarayıcıda gerçek bileşen ayrı sentetik veri taşımasıyla doğrulanır; gerçek cihaz veya envanter değiştirilmez.

## Verification boundary

See design-qa.md for the completed review, exact checks and retained evidence. Browser source responses are synthetic; private PostgreSQL is used only for fixture metadata and current-account authorization. No live FortiGate, customer database, backup file or notification recipient is used. The existing source factories, bounded read contracts and backup authorization remain in use.
