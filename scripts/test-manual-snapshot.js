/**
 * Manual Snapshot Event Detection Test
 * Run this to manually check for snapshot events and trigger alarms
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testManualSnapshotDetection() {
  console.log('========================================');
  console.log('MANUAL SNAPSHOT DETECTION TEST');
  console.log('========================================\n');

  try {
    // 1. Get VMware config
    console.log('1️⃣ Loading VMware configuration...');
    const vmwareConfig = await prisma.integrationConfig.findFirst({
      where: { type: 'VMWARE_VCENTER', enabled: true },
    });

    if (!vmwareConfig) {
      console.error('❌ VMware not configured');
      return;
    }

    const config = vmwareConfig.config;
    console.log(`✅ VMware Host: ${config.host}`);

    // 2. Test via compiled lib (import from dist)
    console.log('\n2️⃣ Importing VMwareService...');
    const { VMwareService } = require('../lib/integrations/vmware');
    
    const vmware = new VMwareService({
      host: config.host,
      username: config.username,
      password: config.password,
      pollingInterval: 15,
      enabledModules: {
        datacenters: true,
        clusters: true,
        hosts: true,
        vms: true,
        datastores: true,
      },
    });

    // 3. Authenticate SOAP
    console.log('\n3️⃣ Authenticating SOAP...');
    const soapAuth = await vmware.authenticateSOAP();
    if (!soapAuth) {
      console.error('❌ SOAP authentication failed');
      return;
    }
    console.log('✅ SOAP authenticated');

    // 4. Fetch snapshot events (last 120 minutes to be sure)
    console.log('\n4️⃣ Fetching snapshot events (last 120 minutes)...');
    const snapshotEvents = await vmware.fetchSnapshotEvents(120);
    
    console.log(`\n📊 Found ${snapshotEvents.length} snapshot events:`);
    console.log('─'.repeat(80));
    
    if (snapshotEvents.length === 0) {
      console.log('\n⚠️  No snapshot events found in last 120 minutes!');
      console.log('\n💡 Possible reasons:');
      console.log('   1. No snapshots were created/deleted in vCenter');
      console.log('   2. Events may be older than 120 minutes');
      console.log('   3. vCenter event collection might be delayed');
      console.log('\n💡 Try creating a NEW snapshot in vCenter now and run this test again');
    } else {
      snapshotEvents.forEach((evt, idx) => {
        console.log(`\n${idx + 1}. ${evt.eventType.toUpperCase()}`);
        console.log(`   VM: ${evt.vmName}`);
        console.log(`   Snapshot: ${evt.snapshotName}`);
        console.log(`   User: ${evt.userName}`);
        console.log(`   Time: ${new Date(evt.eventTime).toLocaleString('tr-TR')}`);
        console.log(`   Status: ${evt.taskState}`);
      });
    }

    console.log('\n' + '─'.repeat(80));

    // 5. Show alarm status
    console.log('\n5️⃣ Checking alarm definitions...');
    const alarms = await prisma.alarmDefinition.findMany({
      where: {
        code: { in: ['SNAPSHOT_CREATED', 'SNAPSHOT_DELETED', 'SNAPSHOT_REVERTED'] },
        enabled: true,
      },
    });

    alarms.forEach(alarm => {
      console.log(`   ${alarm.code}: ${alarm.notifyEmail ? '✅ Email ON' : '❌ Email OFF'}`);
    });

    // 6. Summary
    console.log('\n' + '='.repeat(80));
    console.log('NEXT STEPS');
    console.log('='.repeat(80));
    
    if (snapshotEvents.length > 0) {
      console.log('✅ Snapshot events detected!');
      console.log('\n💡 To trigger alarm:');
      console.log('   1. Wait 5 minutes for automatic alarm check');
      console.log('   2. OR run: curl -X POST http://localhost:3000/api/alarms/check');
      console.log('   3. Check email inbox for notifications');
    } else {
      console.log('⚠️  No recent snapshot events found');
      console.log('\n💡 To test:');
      console.log('   1. Go to vCenter (10.5.56.10)');
      console.log('   2. Select any VM');
      console.log('   3. Take a snapshot');
      console.log('   4. Run this script again: docker-compose exec web node scripts/test-manual-snapshot.js');
    }

    console.log('\n✨ Test completed');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testManualSnapshotDetection();
