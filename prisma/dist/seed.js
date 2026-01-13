"use strict";
/**
 * Prisma Seed Script for InfraScope
 * Populates database with sample data for development and testing
 */
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🌱 Seeding database...');
    try {
        // ======================================================================
        // CLEAR EXISTING DATA
        // ======================================================================
        await prisma.connection.deleteMany();
        await prisma.switchPort.deleteMany();
        await prisma.networkInterface.deleteMany();
        await prisma.dependency.deleteMany();
        await prisma.service.deleteMany();
        await prisma.application.deleteMany();
        await prisma.rackUnit.deleteMany();
        await prisma.device.deleteMany();
        await prisma.rack.deleteMany();
        await prisma.room.deleteMany();
        await prisma.floor.deleteMany();
        await prisma.building.deleteMany();
        await prisma.organization.deleteMany();
        console.log('✓ Cleared existing data');
        // ======================================================================
        // CREATE ORGANIZATION
        // ======================================================================
        const org = await prisma.organization.create({
            data: {
                name: 'TechCorp Inc.',
                code: 'TECHCORP',
                description: 'Enterprise IT Infrastructure',
            },
        });
        console.log('✓ Created organization:', org.name);
        // ======================================================================
        // CREATE BUILDINGS
        // ======================================================================
        const buildingNY = await prisma.building.create({
            data: {
                name: 'New York Data Center',
                address: '123 Tech Avenue',
                city: 'New York',
                country: 'USA',
                postalCode: '10001',
                latitude: 40.7128,
                longitude: -74.006,
                organizationId: org.id,
            },
        });
        const buildingSF = await prisma.building.create({
            data: {
                name: 'San Francisco Hub',
                address: '456 Innovation Way',
                city: 'San Francisco',
                country: 'USA',
                postalCode: '94105',
                latitude: 37.7749,
                longitude: -122.4194,
                organizationId: org.id,
            },
        });
        console.log('✓ Created SF building:', buildingSF.name);
        console.log('✓ Created buildings');
        // ======================================================================
        // CREATE FLOORS & ROOMS
        // ======================================================================
        const floor1 = await prisma.floor.create({
            data: {
                name: 'Ground Floor',
                floorNumber: 0,
                buildingId: buildingNY.id,
            },
        });
        const floor2 = await prisma.floor.create({
            data: {
                name: 'First Floor',
                floorNumber: 1,
                buildingId: buildingNY.id,
            },
        });
        console.log('✓ Created floor 2:', floor2.name);
        const room1 = await prisma.room.create({
            data: {
                name: 'Server Room A',
                description: 'Primary server room',
                floorId: floor1.id,
                capacity: 10,
            },
        });
        const room2 = await prisma.room.create({
            data: {
                name: 'Network Room',
                description: 'Network equipment room',
                floorId: floor1.id,
                capacity: 5,
            },
        });
        console.log('✓ Created room 2:', room2.name);
        console.log('✓ Created floors and rooms');
        // ======================================================================
        // CREATE RACKS
        // ======================================================================
        const rack1 = await prisma.rack.create({
            data: {
                name: 'Rack-001',
                type: 'RACK_42U',
                maxUnits: 42,
                roomId: room1.id,
                position: 'A1',
                operationalStatus: 'OPERATIONAL',
            },
        });
        const rack2 = await prisma.rack.create({
            data: {
                name: 'Rack-002',
                type: 'RACK_42U',
                maxUnits: 42,
                roomId: room1.id,
                position: 'A2',
                operationalStatus: 'OPERATIONAL',
            },
        });
        console.log('✓ Created racks');
        // ======================================================================
        // CREATE DEVICES (SERVERS)
        // ======================================================================
        const server1 = await prisma.device.create({
            data: {
                name: 'WEB-SERVER-01',
                type: 'PHYSICAL_SERVER',
                vendor: 'Dell',
                model: 'PowerEdge R750',
                serialNumber: 'DELL-001',
                assetTag: 'AST-001',
                firmwareVersion: '2.15.1',
                operatingSystem: 'Ubuntu 22.04 LTS',
                criticality: 'CRITICAL',
                status: 'ACTIVE',
                rackId: rack1.id,
                rackUnitPosition: 1,
                metadata: {
                    cpu: '2x Intel Xeon Gold 6348',
                    ram: '256GB DDR4',
                    storage: '2TB SSD',
                },
            },
        });
        const server2 = await prisma.device.create({
            data: {
                name: 'DB-SERVER-01',
                type: 'PHYSICAL_SERVER',
                vendor: 'Dell',
                model: 'PowerEdge R760',
                serialNumber: 'DELL-002',
                assetTag: 'AST-002',
                operatingSystem: 'Ubuntu 22.04 LTS',
                criticality: 'CRITICAL',
                status: 'ACTIVE',
                rackId: rack1.id,
                rackUnitPosition: 4,
                metadata: {
                    cpu: '2x Intel Xeon Platinum 8480',
                    ram: '512GB DDR5',
                    storage: '4TB NVMe SSD',
                },
            },
        });
        const firewall = await prisma.device.create({
            data: {
                name: 'FIREWALL-MAIN',
                type: 'FIREWALL',
                vendor: 'Palo Alto',
                model: 'PA-5220',
                serialNumber: 'FW-001',
                criticality: 'CRITICAL',
                status: 'ACTIVE',
                rackId: rack2.id,
                rackUnitPosition: 1,
            },
        });
        const coreSwitch = await prisma.device.create({
            data: {
                name: 'SWITCH-CORE-01',
                type: 'SWITCH',
                vendor: 'Cisco',
                model: 'Nexus 9300',
                serialNumber: 'CISCO-001',
                criticality: 'CRITICAL',
                status: 'ACTIVE',
                rackId: rack2.id,
                rackUnitPosition: 2,
            },
        });
        console.log('✓ Created devices (servers, firewall, switch)');
        // ======================================================================
        // CREATE NETWORK INTERFACES
        // ======================================================================
        const eth1 = await prisma.networkInterface.create({
            data: {
                name: 'eth0',
                type: 'ETHERNET',
                ipv4: '192.168.1.10',
                macAddress: '00:11:22:33:44:55',
                deviceId: server1.id,
                status: 'UP',
            },
        });
        const eth2 = await prisma.networkInterface.create({
            data: {
                name: 'eth0',
                type: 'ETHERNET',
                ipv4: '192.168.1.11',
                macAddress: '00:11:22:33:44:66',
                deviceId: server2.id,
                status: 'UP',
            },
        });
        const eth3 = await prisma.networkInterface.create({
            data: {
                name: 'mgmt0',
                type: 'MANAGEMENT',
                ipv4: '10.0.0.1',
                macAddress: '00:11:22:33:44:77',
                deviceId: firewall.id,
                status: 'UP',
            },
        });
        console.log('✓ Created management interface:', eth3.name);
        console.log('✓ Created network interfaces');
        // ======================================================================
        // CREATE SWITCH PORTS
        // ======================================================================
        const switchPort1 = await prisma.switchPort.create({
            data: {
                name: 'Ethernet1/1',
                portType: 'ACCESS',
                vlanId: 100,
                status: 'UP',
                speed: '10Gbps',
                duplex: 'FULL',
                switchDeviceId: coreSwitch.id,
                connectedToId: eth1.id,
            },
        });
        console.log('✓ Created switch port 1:', switchPort1.name);
        const switchPort2 = await prisma.switchPort.create({
            data: {
                name: 'Ethernet1/2',
                portType: 'ACCESS',
                vlanId: 100,
                status: 'UP',
                speed: '10Gbps',
                duplex: 'FULL',
                switchDeviceId: coreSwitch.id,
                connectedToId: eth2.id,
            },
        });
        console.log('✓ Created switch port 2:', switchPort2.name);
        console.log('✓ Created switch ports');
        // ======================================================================
        // CREATE APPLICATIONS
        // ======================================================================
        const nginx = await prisma.application.create({
            data: {
                name: 'Nginx',
                vendor: 'Nginx Inc.',
                version: '1.24.0',
                installPath: '/usr/bin/nginx',
            },
        });
        const postgres = await prisma.application.create({
            data: {
                name: 'PostgreSQL',
                vendor: 'PostgreSQL Global Development Group',
                version: '15.2',
                installPath: '/usr/lib/postgresql/15/bin',
            },
        });
        console.log('✓ Created applications');
        // ======================================================================
        // CREATE SERVICES
        // ======================================================================
        const webService = await prisma.service.create({
            data: {
                name: 'HTTP Web Server',
                type: 'WEB_SERVER',
                displayName: 'Nginx',
                description: 'Primary web server for web applications',
                status: 'RUNNING',
                port: 80,
                protocol: 'TCP',
                deviceId: server1.id,
                applicationId: nginx.id,
                criticality: 'CRITICAL',
                metadata: {
                    workers: 8,
                    maxConnections: 10000,
                },
            },
        });
        const httpsService = await prisma.service.create({
            data: {
                name: 'HTTPS Web Server',
                type: 'WEB_SERVER',
                displayName: 'Nginx SSL',
                description: 'Secure web server for web applications',
                status: 'RUNNING',
                port: 443,
                protocol: 'TCP',
                deviceId: server1.id,
                applicationId: nginx.id,
                criticality: 'CRITICAL',
            },
        });
        const dbService = await prisma.service.create({
            data: {
                name: 'PostgreSQL Database',
                type: 'DATABASE',
                description: 'Primary database server',
                status: 'RUNNING',
                port: 5432,
                protocol: 'TCP',
                deviceId: server2.id,
                applicationId: postgres.id,
                criticality: 'CRITICAL',
                metadata: {
                    sharedBuffers: '64GB',
                    effectiveCacheSize: '192GB',
                    maxConnections: 200,
                },
            },
        });
        console.log('✓ Created database service:', dbService.name);
        console.log('✓ Created services');
        // ======================================================================
        // CREATE DEPENDENCIES
        // ======================================================================
        await prisma.dependency.create({
            data: {
                sourceServiceId: webService.id,
                targetDeviceId: server2.id,
                type: 'DEPENDS_ON',
                criticality: 'CRITICAL',
                description: 'Web server depends on database server',
            },
        });
        await prisma.dependency.create({
            data: {
                sourceServiceId: httpsService.id,
                targetDeviceId: server2.id,
                type: 'DEPENDS_ON',
                criticality: 'CRITICAL',
                description: 'HTTPS service depends on database server',
            },
        });
        console.log('✓ Created dependencies');
        // ======================================================================
        // CREATE RACK UNITS
        // ======================================================================
        for (let i = 1; i <= 5; i++) {
            await prisma.rackUnit.create({
                data: {
                    position: i,
                    rackId: rack1.id,
                    side: 'FRONT',
                    deviceId: i <= 2 ? (i === 1 ? server1.id : server2.id) : undefined,
                },
            });
        }
        console.log('✓ Created rack units');
        console.log('\n✅ Database seeding completed successfully!');
    }
    catch (error) {
        console.error('❌ Error seeding database:', error);
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
main();
