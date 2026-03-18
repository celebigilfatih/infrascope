// Script to add network switches to the database
const API_BASE = 'http://localhost:8170/api';

async function addSwitches() {
  // Get racks
  const racksRes = await fetch(`${API_BASE}/racks`);
  const racksData = await racksRes.json();
  const kabinet4 = racksData.data.find(r => r.name === 'Kabinet_4');
  
  if (!kabinet4) {
    console.error('Rack not found!');
    return;
  }

  // Switches from the list (parsing HOST NAME, IP, SERIAL NO, MARKA\MODEL)
  const switches = [
    { name: 'Merkez-Switch', ip: '10.5.1.252', serial: 'FOX2337PC5V', vendor: 'Cisco', model: 'Nexus 9504' },
    { name: 'Merkez-Switch-Backup', ip: '10.5.1.250', serial: 'FOX2247PJXN', vendor: 'Cisco', model: 'Nexus 9504' },
    { name: 'B_Blok_So_Sw', ip: '10.5.1.253', serial: 'FOX1537GPUA', vendor: 'Cisco', model: 'Catalyst 4507R-E' },
    { name: '185_CM_SW', ip: '10.5.0.137', serial: 'FCQ1541X3JQ', vendor: 'Cisco', model: 'C2960-48TT-L' },
    { name: 'A_BLOK_KAT_3', ip: '10.5.0.131', serial: 'SG59FLYYPB', vendor: 'HP', model: '2920-48G' },
    { name: 'ISL_PREFABRIK_SW', ip: '10.5.0.76', serial: 'SG52FLWDSV', vendor: 'HP', model: '2920-24G' },
    { name: 'SO_SUNUCU_KABIN_SW', ip: '10.5.0.71', serial: '', vendor: 'Cisco', model: 'C9200L-48P-4X-E' },
    { name: 'B_BLOK_KAT_1_POE', ip: '10.5.0.69', serial: 'CN35F630DW', vendor: 'HP', model: 'A5500-24G POE' },
    { name: '10.KAT_SW', ip: '10.5.0.66', serial: 'FOC2341T2U8', vendor: 'Cisco', model: 'WS-C2960X-48FPD-L' },
    { name: 'HUKUK_SW1', ip: '10.5.0.65', serial: 'FDO1542Y2VR', vendor: 'Cisco', model: '3560E-24TD' },
    { name: 'ISG_ANA_DEPO_SW', ip: '10.5.0.91', serial: 'FCW2324A0LP', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: 'B_BLOK_KAT_5', ip: '10.5.0.64', serial: 'CN35F630BQ', vendor: 'HP', model: 'A5500-24G POE' },
    { name: 'ISLETMELER_SW1', ip: '10.5.0.80', serial: 'FOC2341T2V6', vendor: 'Cisco', model: 'WS-C2960X-48FPD-L' },
    { name: 'ISLETMELER_SW2', ip: '10.5.0.9', serial: 'AGM1539L5LD', vendor: 'Cisco', model: 'C2960-48TC-S' },
    { name: 'Elk_Sw_1', ip: '10.5.0.83', serial: 'FOC2341T2UY', vendor: 'Cisco', model: 'WS-C2960X-48FPD-L' },
    { name: 'Elk_Sw_2', ip: '10.5.0.81', serial: 'CN35F630PD', vendor: 'HP', model: 'A5500-24G POE' },
    { name: 'Santral_Sw_1', ip: '10.5.0.87', serial: 'FDO1542Y2QG', vendor: 'Cisco', model: '3560E-24TD' },
    { name: 'Santral_Sw_3', ip: '10.5.0.67', serial: 'SG52FLWDSW', vendor: 'HP', model: '2920-24G' },
    { name: 'TICARET_SW', ip: '10.5.0.94', serial: 'FCW2324A0Q8', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: 'AMBAR_SW', ip: '10.5.0.85', serial: 'FDO1543W0XJ', vendor: 'Cisco', model: 'WS-C3560E-24TD-S' },
    { name: 'Sebekeler_Sw1', ip: '10.5.0.86', serial: 'CN35F6301Z', vendor: 'HP', model: 'A5500-24G POE' },
    { name: 'B_BLOK_KAT_3_SW2', ip: '10.5.0.90', serial: 'CN35F630DV', vendor: 'HP', model: 'A5500-24G POE' },
    { name: 'A_BLOK_KAT_3_POE', ip: '10.5.0.89', serial: 'CN35F630PR', vendor: 'HP', model: 'A5500-24G POE' },
    { name: 'SAYAC_SW_1', ip: '10.5.0.79', serial: 'FOC2341T2UT', vendor: 'Cisco', model: 'WS-C2960X-48FPD-L' },
    { name: 'Sayaç_Sw_2', ip: '10.5.0.78', serial: 'SG58FLWZ5H', vendor: 'HP', model: '2920-24G' },
    { name: 'GUVENLIK_SW', ip: '10.5.0.99', serial: 'CN35F6302G', vendor: 'HP', model: 'A5500-24G POE' },
    { name: 'Buski_Setbasi_Sw', ip: '10.30.1.245', serial: 'CN50GMW148', vendor: 'HP', model: '1820-24G' },
    { name: 'Gorukle', ip: '10.24.1.245', serial: '', vendor: 'HP', model: '2920-48G' },
    { name: 'Buski_inegol', ip: '10.40.1.245', serial: '', vendor: 'HP', model: '1820-24G' },
    { name: 'Buski_Yenisehir', ip: '10.47.1.245', serial: '', vendor: 'HP', model: '1820-24G' },
    { name: 'Buski_Karacabey', ip: '10.49.1.245', serial: '', vendor: 'HP', model: '1820-24G' },
    { name: 'Buski_MKP', ip: '10.42.1.245', serial: '', vendor: 'HP', model: '1820-24G' },
    { name: 'Buski_Iznik', ip: '10.41.1.245', serial: '', vendor: 'HP', model: '1820-24G' },
    { name: 'Buski_Orhangazi', ip: '10.43.1.245', serial: '', vendor: 'HP', model: '1820-24G' },
    { name: 'Buski_Mudanya_Sw', ip: '10.28.1.250', serial: 'SG57FLYSRB', vendor: 'HP', model: '2920-48G' },
    { name: 'Gürsu', ip: '10.31.1.245', serial: '', vendor: 'HP', model: '2920-24G' },
    { name: 'Kestel', ip: '10.22.1.245', serial: '', vendor: 'HP', model: '2920-48G' },
    { name: 'Buski_Gencosman_Sw', ip: '10.25.1.245', serial: '', vendor: 'HP', model: '1820-24G' },
    { name: 'Gemlik', ip: '10.29.1.245', serial: '', vendor: 'HP', model: '2920-48G' },
    { name: 'Eğitim', ip: '10.23.1.252', serial: '', vendor: 'HP', model: '2920-24G' },
    { name: 'Dobruca_Aritma', ip: '10.36.1.245', serial: '', vendor: 'HP', model: '2920-48G' },
    { name: 'Dobruca_Aritma_3Kat_1', ip: '10.36.1.241', serial: '', vendor: 'HP', model: '1820-24G' },
    { name: 'Dobruca_Aritma_3Kat_2', ip: '10.36.1.243', serial: '', vendor: 'HP', model: '1820-24G' },
    { name: 'Dobruca_Aritma_3Kat_3', ip: '10.36.1.248', serial: '', vendor: 'HP', model: '1820-24G' },
    { name: 'Doğu_Aritma', ip: '10.34.1.245', serial: '', vendor: 'HP', model: '2920-48G' },
    { name: 'Doğu_Aritma_Lab', ip: '10.34.1.246', serial: '', vendor: 'HP', model: '1820-24G' },
    { name: 'Doğu_Aritma_Yeni_Bina', ip: '10.34.1.247', serial: '', vendor: 'HP', model: '1810-24G' },
    { name: 'Doğu_Aritma_Scada', ip: '10.34.1.248', serial: '', vendor: 'HP', model: '1820-24G' },
    { name: 'ANABINA_GUVENLIK', ip: '10.5.0.61', serial: 'FCW2311A2TG', vendor: 'Cisco', model: 'Catalyst 2960L-8TS-LL' },
    { name: 'Arsiv', ip: '10.5.0.45', serial: 'CN50GMW14F', vendor: 'HP', model: '1820-24G' },
    { name: '10.KAT_DONANIM_SW', ip: '10.5.0.37', serial: 'FCW2312A1ZZ', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: '10.KAT_YAZILIM_G_SW', ip: '10.5.0.38', serial: 'FCW2311A2TZ', vendor: 'Cisco', model: 'Catalyst 2960L-8TS-LL' },
    { name: '9.KAT_OZALIT_ODASI_SW', ip: '10.5.0.39', serial: 'FCW2311A2S0', vendor: 'Cisco', model: 'Catalyst 2960L-8TS-LL' },
    { name: '9.KAT_EMLAK_SERVISI_SW', ip: '10.5.0.20', serial: 'FCW2311A2TP', vendor: 'Cisco', model: 'Catalyst 2960L-8TS-LL' },
    { name: '9.KAT_KAMULASTIRMA_SW', ip: '10.5.0.29', serial: 'FCW2312A21P', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: '8.KAT_ART_RUHSAT_SW', ip: '10.5.0.32', serial: 'FCW2312A2RQ', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: '8.KAT_ART_RUHSAT_DENETIM_SW', ip: '10.5.0.33', serial: 'FCW2312A2S1', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: '8.KAT_ZEMIN_ETUT_SW', ip: '10.5.0.28', serial: 'FCW2311A2RZ', vendor: 'Cisco', model: 'Catalyst 2960L-8TS-LL' },
    { name: 'ARITMA_KALITE_SW', ip: '10.5.0.23', serial: 'CN81GMV10L', vendor: 'HP', model: '1820-8G' },
    { name: '7.KAT_KANAL_PROJE_SW', ip: '10.5.0.34', serial: 'FCW2311A2Q5', vendor: 'Cisco', model: 'Catalyst 2960L-8TS-LL' },
    { name: '6.KAT_ICM_BLG_SW', ip: '10.5.0.36', serial: 'FCW2312A20U', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: '6.KAT_ICM_KONTROL_MUH_SW', ip: '10.5.0.43', serial: 'FCW2311A2RP', vendor: 'Cisco', model: 'Catalyst 2960L-8TS-LL' },
    { name: '5.KAT_STRATEJI', ip: '10.5.0.1', serial: 'FCW2311A2SV', vendor: 'Cisco', model: 'Catalyst 2960L-8TS-LL' },
    { name: '4.KAT_KONTROL_GRUBU', ip: '10.5.0.3', serial: 'FCW2312A2RW', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: '4.KAT_BLG_SERVISI', ip: '10.5.0.4', serial: 'FCW2311A2RV', vendor: 'Cisco', model: 'Catalyst 2960L-8TS-LL' },
    { name: '4.KAT_BURO', ip: '10.5.0.2', serial: 'FCW2311A2RR', vendor: 'Cisco', model: 'Catalyst 2960L-8TS-LL' },
    { name: '1.KAT_YONETIM_KURULU', ip: '10.5.0.6', serial: 'FCW2311A2QP', vendor: 'Cisco', model: 'Catalyst 2960L-8TS-LL' },
    { name: '1.KAT_YONETIM_KURULU_2', ip: '10.5.0.93', serial: 'FCW2324A0Q5', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: '1.KAT_PERSONEL_1', ip: '10.5.0.17', serial: 'FCW2312A2RS', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: 'Z.KAT_ABONE_185_SW', ip: '10.5.0.44', serial: 'FCW2312A1Z5', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: '6.KAT_HARITA_KONTROL_SW', ip: '10.5.0.54', serial: 'FCW2311A2S2', vendor: 'Cisco', model: 'Catalyst 2960L-8TS-LL' },
    { name: '1.KAT_MEMUR_SEF_SW2', ip: '10.5.0.5', serial: 'FCW2311A2M9', vendor: 'Cisco', model: 'Catalyst 2960L-8TS-LL' },
    { name: '1.KAT_MEMUR_SEF_SW1', ip: '10.5.0.10', serial: 'FCW2312A229', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: 'Z.KAT_KALITE_SW', ip: '10.5.0.13', serial: 'FCW2312A20J', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: 'Z.KAT_YALIN_MD_SW', ip: '10.5.0.15', serial: 'FCW2249A21D', vendor: 'Cisco', model: 'Catalyst 2960L-8TS-LL' },
    { name: 'ISG_DEPO_SW', ip: '10.5.0.40', serial: 'FCW2311A2QJ', vendor: 'Cisco', model: 'Catalyst 2960L-8TS-LL' },
    { name: 'BASIN_SUBE_MUDUR_SW', ip: '10.5.0.21', serial: 'FCW2311A2TR', vendor: 'Cisco', model: 'Catalyst 2960L-8TS-LL' },
    { name: 'GENEL_EVRAK', ip: '10.5.0.26', serial: 'FCW2311A2TS', vendor: 'Cisco', model: 'Catalyst 2960L-8TS-LL' },
    { name: 'HUKUK_SW2', ip: '10.5.0.27', serial: 'CN35F63091', vendor: 'HP', model: 'A5500-24G POE' },
    { name: 'ELK_ATOLYE_SW', ip: '10.5.0.107', serial: 'FCW2324A0NH', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: 'TAMIRHANE_SW', ip: '10.5.0.42', serial: 'CN35F6306Z', vendor: 'HP', model: 'A5500-24G POE' },
    { name: 'ELK_HABERLESME_SW', ip: '10.5.0.41', serial: 'FCW2312A1ZQ', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: '5.KAT_MAAS_SERVISI', ip: '10.5.0.53', serial: 'FCW2312A20C', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: 'SAYAC_KACAKSU_SW', ip: '10.5.0.58', serial: 'FCW2312A20K', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: 'ISG_SW1', ip: '10.5.0.30', serial: 'FCW2312A207', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: 'ISG_SW2', ip: '10.5.0.59', serial: 'FCW2312A2S3', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: 'AYNIYAT_SW', ip: '10.5.0.84', serial: 'FCW2311A2T0', vendor: 'Cisco', model: 'Catalyst 2960L-8TS-LL' },
    { name: 'AMBAR_IKMAL_STOK_SW', ip: '10.5.0.95', serial: 'FCW2312A2RJ', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: 'SAHA_AMIRLIGI_SW', ip: '10.5.0.96', serial: 'FCW2311A2TQ', vendor: 'Cisco', model: 'Catalyst 2960L-8TS-LL' },
    { name: 'IHALE_SERVISI_SW2', ip: '10.5.0.97', serial: 'FCW2312A1ZV', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: 'ILETIM_HATLARI_POMPA_SW', ip: '10.5.0.98', serial: 'FOC2451L4YE', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: 'KANAL_BAKIM_ONARIM', ip: '10.5.0.108', serial: 'FCW2324A0P6', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: 'ABONE_ZEMIN_BANKO', ip: '10.5.0.109', serial: 'FCW2324A0NK', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: 'SCADA_ATOLYE_SCADA', ip: '10.5.0.119', serial: 'CN35F630P7', vendor: 'HP', model: 'A5500-24G POE' },
    { name: 'SCADA_ATOLYE_BUSKI', ip: '10.5.0.120', serial: 'CN35F63007', vendor: 'HP', model: 'A5500-24G POE' },
    { name: 'ISL_HARITA_VERI_ISLEME', ip: '10.5.0.104', serial: 'FCW2324A0JF', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: 'ENDEKS_OKUMA_SW', ip: '10.5.0.126', serial: 'FCW2324A0QS', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: 'EKIP_YONETIM_SW', ip: '10.5.0.113', serial: 'CN35F6302F', vendor: 'HP', model: 'A5500-24G POE' },
    { name: 'B_BLOK', ip: '10.5.0.123', serial: 'CN35F620XD', vendor: 'HP', model: 'A5500-48G POE' },
    { name: 'A_BLOK_KAT_1', ip: '10.5.0.124', serial: 'CN35F6205L', vendor: 'HP', model: 'A5500-48G POE' },
    { name: 'A_BLOK_SW', ip: '10.5.0.125', serial: 'SG58FLWZ61', vendor: 'HP', model: '2920-24G' },
    { name: 'SANTRAL_KABIN_SW', ip: '10.5.0.118', serial: 'FCQ1541X3J9', vendor: 'Cisco', model: 'C2960-48TT-L' },
    { name: 'A_BLOK_KAT_2', ip: '10.5.0.117', serial: 'FOC1325Y0MV', vendor: 'Cisco', model: 'C2960-48TT-S' },
    { name: 'ELK_ATOLYE_SW_2', ip: '10.5.0.127', serial: 'FCW2324A0MQ', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: 'SO_NETWORK_SW', ip: '10.5.0.128', serial: 'FOC2341T2UZ', vendor: 'Cisco', model: 'WS-C2960X-48FPD-L' },
    { name: 'Merkez-2-switch', ip: '10.5.1.252', serial: 'FOX2337PC5V', vendor: 'Cisco', model: 'Nexus 9504' },
    { name: 'YALIN_YONETIM_SW', ip: '10.5.0.24', serial: 'CN81GMV0CB', vendor: 'HP', model: '1820-8G' },
    { name: 'SAHA_AMIRLIGI_CAY_OCAGI', ip: '10.5.0.129', serial: 'CN81GMV0GS', vendor: 'HP', model: '1820-8G' },
    { name: 'SAHA_AMIRLIGI_SW_1', ip: '10.5.0.130', serial: 'FCW2324A0Q7', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: 'B_BLOK_KAT_4', ip: '10.5.0.132', serial: 'CN35F6205J', vendor: 'HP', model: 'A5500-48G POE' },
    { name: 'B_BLOK_KAT_3_SW1', ip: '10.5.0.133', serial: 'CN35F630PB', vendor: 'HP', model: 'A5500-24G POE' },
    { name: 'B_BLOK_KAT_2', ip: '10.5.0.134', serial: 'SG59FLYYNT', vendor: 'HP', model: '2920-48G' },
    { name: 'B_BLOK_KAT_1', ip: '10.5.0.135', serial: 'SG59FLYYNV', vendor: 'HP', model: '2920-48G' },
    { name: 'B_BLOK_KAT_ZEMIN', ip: '10.5.0.136', serial: 'FOC23393XW2', vendor: 'Cisco', model: 'WS-C2960X-48FPD-L' },
    { name: 'KAT_6_SW', ip: '10.5.0.68', serial: 'JAE25191EU1', vendor: 'Cisco', model: 'C9200L-48P-4X-E' },
    { name: 'KAT_3_SW', ip: '10.5.0.70', serial: 'JAE252932VD', vendor: 'Cisco', model: 'C9200L-48P-4X-E' },
    { name: 'B_BLOK_TOPLANTI_SW', ip: '10.5.0.22', serial: 'CN81GMV10K', vendor: 'HP', model: '1820-8G' },
    { name: 'ISL_HARITA_SW', ip: '10.5.0.138', serial: 'CN81GMV0DP', vendor: 'HP', model: '1820-8G' },
    { name: 'KACAK_ARAMA_SW', ip: '10.5.0.73', serial: 'FOC2451L3X3', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: 'SANTRAL_SIP_SW', ip: '10.5.0.92', serial: 'JAE25291Y7A', vendor: 'Cisco', model: 'C9200L-48P-4X-E' },
    { name: 'GNMD_SW', ip: '10.5.0.74', serial: 'FCW2324A0NV', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: 'ISL_ASFALT_BIRIMI', ip: '10.5.0.75', serial: 'FCW2324A0P4', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
    { name: 'BLG_TEKNIK_SERVIS', ip: '10.5.0.46', serial: '', vendor: 'HP', model: '1820-24G' },
    { name: 'A_BLOK_ZEMIN', ip: '10.5.0.77', serial: 'SG52FLWDSV', vendor: 'HP', model: '2920-24G' },
    { name: 'POMPA_KAYNAK_SW', ip: '10.5.0.35', serial: 'FCW2312A1TK', vendor: 'Cisco', model: 'Catalyst 2960L-16TS-LL' },
  ];

  let created = 0;
  let failed = 0;
  let skipped = 0;

  for (const sw of switches) {
    try {
      // Check if device already exists by name or IP
      const existingRes = await fetch(`${API_BASE}/devices?search=${encodeURIComponent(sw.name)}&limit=1`);
      const existingData = await existingRes.json();
      
      if (existingData.data && existingData.data.length > 0) {
        console.log(`⊘ Skipping ${sw.name} - already exists`);
        skipped++;
        continue;
      }

      const createRes = await fetch(`${API_BASE}/devices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: sw.name,
          type: 'SWITCH',
          vendor: sw.vendor,
          model: sw.model,
          serialNumber: sw.serial || `SN-${sw.name}`,
          criticality: 'HIGH',
          status: 'ACTIVE',
          rackId: kabinet4.id,
          supportDate: '2026-12-31',
        }),
      });
      
      const createResult = await createRes.json();
      if (createResult.success) {
        console.log(`✓ Created ${sw.name} (${sw.vendor} ${sw.model}) - IP: ${sw.ip}`);
        created++;
      } else {
        console.error(`✗ Failed to create ${sw.name}:`, createResult.error);
        failed++;
      }
    } catch (err) {
      console.error(`✗ Error adding ${sw.name}:`, err.message);
      failed++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Created: ${created}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
}

addSwitches();
