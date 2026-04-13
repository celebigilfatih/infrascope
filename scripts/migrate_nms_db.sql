-- ============================================================
-- NMS DB Migration Script
-- Migrates data from nms_db to infrascope database
-- ============================================================

-- Step 1: Insert 18 NMS switches into infrascope devices table
INSERT INTO devices (
  id, name, type, vendor,
  management_ip, nms_device_id,
  snmp_community, snmp_version, snmp_port,
  polling_enabled, polling_interval,
  "serialNumber", "assetTag",
  "createdAt", "updatedAt"
)
VALUES
  (gen_random_uuid()::text, 'AMBAR_SW',         'SWITCH', 'cisco', '10.5.0.85',  1,  'Nat3k20May17', '2c', 161, true,  300, 'FDO1543W0XJ', 'C-22000528', NOW(), NOW()),
  (gen_random_uuid()::text, 'BILGI_ISLEM_SW',   'SWITCH', 'cisco', '10.5.0.66',  2,  'Nat3k20May17', '2c', 161, true,  300, NULL, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'ISLETMELER_SW1',   'SWITCH', 'cisco', '10.5.0.80',  3,  'Nat3k20May17', '2c', 161, true,  300, 'FOC2341T2V6', 'C-22001370', NOW(), NOW()),
  (gen_random_uuid()::text, 'Test Router',       'ROUTER', 'cisco', '192.168.1.1', 4, 'public',       '2c', 161, false, 300, NULL, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Sebekeler_Sw1',    'SWITCH', 'hp',    '10.5.0.86',  5,  'Nat3k20May17', '2c', 161, true,  300, 'CN35F6301Z',  'C-22000553', NOW(), NOW()),
  (gen_random_uuid()::text, 'Santral_Sw_1',     'SWITCH', 'cisco', '10.5.0.87',  6,  'Nat3k20May17', '2c', 161, true,  300, 'FDO1542Y2QG', 'C-22000534', NOW(), NOW()),
  (gen_random_uuid()::text, 'Elk_Sw_1',         'SWITCH', 'cisco', '10.5.0.83',  7,  'Nat3k20May17', '2c', 161, true,  300, 'FOC2341T2UY', 'C-22001408', NOW(), NOW()),
  (gen_random_uuid()::text, 'ISG_ANA_DEPO_SW',  'SWITCH', 'cisco', '10.5.0.91',  8,  'Nat3k20May17', '2c', 161, true,  300, 'FCW2324A0LP', 'C-22000557', NOW(), NOW()),
  (gen_random_uuid()::text, 'ISL_PREFABRIK_SW', 'SWITCH', 'hp',    '10.5.0.76',  9,  'Nat3k20May17', '2c', 161, true,  300, NULL, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Elk_Sw_2',         'SWITCH', 'hp',    '10.5.0.81',  10, 'Nat3k20May17', '2c', 161, true,  300, 'CN35F630PD',  'C-22000556', NOW(), NOW()),
  (gen_random_uuid()::text, 'Santral_Sw_3',     'SWITCH', 'hp',    '10.5.0.67',  11, 'Nat3k20May17', '2c', 161, true,  300, 'SG52FLWDSW',  'C-22000519', NOW(), NOW()),
  (gen_random_uuid()::text, 'HUKUK_SW1',        'SWITCH', 'cisco', '10.5.0.65',  12, 'Nat3k20May17', '2c', 161, true,  300, 'FDO1542Y2VR', 'C-22000521', NOW(), NOW()),
  (gen_random_uuid()::text, 'TICARET_SW',       'SWITCH', 'cisco', '10.5.0.94',  13, 'Nat3k20May17', '2c', 161, true,  300, 'FCW2324A0Q8', 'C-22001386', NOW(), NOW()),
  (gen_random_uuid()::text, 'ISLETMELER_SW2',   'SWITCH', 'cisco', '10.5.0.9',   14, 'Nat3k20May17', '2c', 161, true,  300, 'AGM1539L5LD', 'C-22000547', NOW(), NOW()),
  (gen_random_uuid()::text, 'B_BLOK_KAT_5',    'SWITCH', 'hp',    '10.5.0.64',  15, 'Nat3k20May17', '2c', 161, true,  300, 'CN35F630BQ',  'C-22000520', NOW(), NOW()),
  (gen_random_uuid()::text, 'B_BLOK_KAT_1_POE','SWITCH', 'hp',    '10.5.0.69',  16, 'Nat3k20May17', '2c', 161, true,  300, 'CN35F630DW',  'C-22000526', NOW(), NOW()),
  (gen_random_uuid()::text, 'A_BLOK_KAT_3_POE','SWITCH', 'hp',    '10.5.0.89',  17, 'Nat3k20May17', '2c', 161, true,  300, 'CN35F630PR',  'C-22000552', NOW(), NOW()),
  (gen_random_uuid()::text, 'B_BLOK_KAT_3_SW2','SWITCH', 'hp',    '10.5.0.90',  18, 'Nat3k20May17', '2c', 161, true,  300, 'CN35F630DV',  'C-22000554', NOW(), NOW())
ON CONFLICT (nms_device_id) DO NOTHING;

SELECT 'Devices inserted: ' || COUNT(*) FROM devices WHERE nms_device_id IS NOT NULL;
