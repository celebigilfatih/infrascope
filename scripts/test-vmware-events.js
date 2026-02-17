/**
 * Test VMware Snapshot Event Detection
 * Tests if snapshot events are being detected from vCenter
 */

async function testSnapshotEventDetection() {
  console.log('========================================');
  console.log('VMWARE SNAPSHOT EVENT DETECTION TEST');
  console.log('========================================\n');

  try {
    // Test via API endpoint
    console.log('📡 Testing snapshot event detection via API...\n');
    
    const baseUrl = 'http://localhost:3000';
    
    // 1. Check VMware integration status
    console.log('1️⃣ Checking VMware integration...');
    const statusRes = await fetch(`${baseUrl}/api/integrations/vmware?type=status`);
    const statusData = await statusRes.json();
    console.log(`   Status: ${statusRes.ok ? '✅' : '❌'}`);
    if (statusData) {
      console.log(`   Data:`, JSON.stringify(statusData, null, 2));
    }

    // 2. Manually trigger alarm check
    console.log('\n2️⃣ Triggering manual alarm check...');
    const checkRes = await fetch(`${baseUrl}/api/alarms/check`, {
      method: 'POST',
    });
    console.log(`   Status: ${checkRes.status}`);
    
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      console.log(`   Response:`, JSON.stringify(checkData, null, 2));
    } else {
      const errorText = await checkRes.text();
      console.log(`   Error: ${errorText}`);
    }

    // 3. Wait for processing
    console.log('\n3️⃣ Waiting 5 seconds for alarm processing...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 4. Check alarm events
    console.log('\n4️⃣ Checking for alarm events...');
    const eventsRes = await fetch(`${baseUrl}/api/alarms/events?limit=10`);
    if (eventsRes.ok) {
      const events = await eventsRes.json();
      console.log(`   Found ${events.length || 0} recent alarm events`);
      if (events.length > 0) {
        events.slice(0, 3).forEach((evt, idx) => {
          console.log(`\n   ${idx + 1}. ${evt.title || evt.alarm?.name}`);
          console.log(`      Code: ${evt.alarm?.code}`);
          console.log(`      Time: ${new Date(evt.createdAt).toLocaleString('tr-TR')}`);
          console.log(`      Notified: ${evt.notifiedAt ? '✅' : '❌'}`);
        });
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('TEST COMPLETED');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Run test
testSnapshotEventDetection();
