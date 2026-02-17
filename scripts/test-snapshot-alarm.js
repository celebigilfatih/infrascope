/**
 * Test Snapshot Alarm Detection & Email Notification
 * 
 * This script tests via API endpoints:
 * 1. Checks VMware snapshot events
 * 2. Checks alarm definitions
 * 3. Checks email configuration
 * 4. Shows recent alarm events
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testSnapshotAlarms() {
  console.log('========================================');
  console.log('SNAPSHOT ALARM TEST');
  console.log('========================================\n');

  try {
    // 1. Get VMware configuration
    console.log('📡 Loading VMware configuration...');
    const vmwareConfig = await prisma.integrationConfig.findFirst({
      where: { type: 'VMWARE_VCENTER' },
    });

    if (!vmwareConfig || !vmwareConfig.enabled) {
      console.error('❌ VMware integration not configured or disabled');
      return;
    }

    const config = vmwareConfig.config;
    console.log(`✅ VMware Host: ${config.host}`);

    // 2. Check alarm definitions
    console.log('\n🔔 Checking alarm definitions...');
    const alarmDefs = await prisma.alarmDefinition.findMany({
      where: {
        code: {
          in: ['SNAPSHOT_CREATED', 'SNAPSHOT_DELETED', 'SNAPSHOT_REVERTED'],
        },
        enabled: true,
      },
    });

    console.log(`✅ Found ${alarmDefs.length} enabled snapshot alarms`);
    alarmDefs.forEach(alarm => {
      console.log(`   - ${alarm.code}: ${alarm.name} (Email: ${alarm.notifyEmail ? '✅' : '❌'})`);
    });

    if (alarmDefs.length === 0) {
      console.log('\n⚠️  No snapshot alarms found!');
      console.log('💡 Run: docker-compose exec web npm run db:seed');
      return;
    }

    // 3. Check email configuration
    console.log('\n📧 Checking email configuration...');
    const emailConfig = await prisma.notificationConfig.findUnique({
      where: { channel: 'email' },
    });

    if (!emailConfig || !emailConfig.enabled) {
      console.log('❌ Email notifications not configured or disabled');
      console.log('💡 Configure email in Settings > Alerts page');
    } else {
      const config = emailConfig.config;
      console.log('✅ Email configured:');
      console.log(`   SMTP Host: ${config.smtpHost}`);
      console.log(`   SMTP Port: ${config.smtpPort}`);
      console.log(`   From: ${config.smtpUser}`);
      console.log(`   Recipients: ${config.recipients.join(', ')}`);
    }

    // 4. Check recent alarm events
    console.log('\n🚨 Recent alarm events (last 24 hours):');
    const recentAlarms = await prisma.alarmEvent.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
        alarm: {
          code: {
            in: ['SNAPSHOT_CREATED', 'SNAPSHOT_DELETED', 'SNAPSHOT_REVERTED'],
          },
        },
      },
      include: {
        alarm: {
          select: {
            code: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    });

    if (recentAlarms.length === 0) {
      console.log('   No recent snapshot alarms found');
    } else {
      console.log(`   Found ${recentAlarms.length} alarms:`);
      recentAlarms.forEach((alarm, idx) => {
        console.log(`\n   ${idx + 1}. ${alarm.alarm.code}`);
        console.log(`      Title: ${alarm.title}`);
        console.log(`      Time: ${alarm.createdAt.toLocaleString('tr-TR')}`);
        console.log(`      Notified: ${alarm.notifiedAt ? '✅ ' + alarm.notifiedAt.toLocaleString('tr-TR') : '❌ No'}`);
        console.log(`      Channel: ${alarm.notifyChannel || 'N/A'}`);
      });
    }

    // 5. Check last alarm check
    console.log('\n⏰ Last alarm engine check:');
    const lastCheck = await prisma.alarmCheckLog.findFirst({
      orderBy: { checkTime: 'desc' },
    });

    if (lastCheck) {
      console.log(`   Time: ${lastCheck.checkTime.toLocaleString('tr-TR')}`);
      console.log(`   Status: ${lastCheck.status}`);
      console.log(`   Alarms evaluated: ${lastCheck.alarmsEvaluated}`);
      console.log(`   Alarms triggered: ${lastCheck.alarmsTriggered}`);
    } else {
      console.log('   No alarm checks yet');
    }

    // 6. Summary & Recommendations
    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY & RECOMMENDATIONS');
    console.log('='.repeat(80));
    
    const emailEnabledCount = alarmDefs.filter(a => a.notifyEmail).length;
    
    if (emailEnabledCount === 0) {
      console.log('⚠️  Snapshot alarms enabled but email notifications disabled!');
      console.log('💡 Fix: notifyEmail is now set to true in alarm-definitions.ts');
      console.log('💡 Restart: docker-compose restart web');
    } else if (!emailConfig || !emailConfig.enabled) {
      console.log('⚠️  Email notifications not configured!');
      console.log('💡 Configure email in: http://localhost:3000/settings/alerts');
    } else {
      console.log('✅ Snapshot detection and email notifications configured!');
      if (recentAlarms.length === 0) {
        console.log('💡 Create a snapshot in vCenter to test');
        console.log('💡 Alarm engine runs every 5 minutes automatically');
        console.log('💡 Or trigger manually via: curl http://localhost:3000/api/alarms/check');
      } else {
        const notifiedCount = recentAlarms.filter(a => a.notifiedAt).length;
        console.log(`✅ ${notifiedCount}/${recentAlarms.length} alarms sent email notifications`);
      }
    }

    console.log('\n✨ Test completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

// Run test
testSnapshotAlarms();
