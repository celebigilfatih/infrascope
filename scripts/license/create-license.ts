import { LicenseTier, type PrismaClient } from '@prisma/client';
import { createLicenseWithCustomer } from '../../lib/license/admin-service';

type Args = {
  company?: string;
  contact?: string;
  email?: string;
  tier?: LicenseTier;
  maxDevices?: number;
  maxUsers?: number;
  days?: number;
  activationLimit?: number;
  phone?: string;
  notes?: string;
};

const VALID_TIERS = new Set<string>(Object.values(LicenseTier));
let db: PrismaClient | undefined;

function parseArgs(argv: string[]): Args {
  const args: Args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    index += 1;

    switch (key) {
      case 'company':
        args.company = value.trim();
        break;
      case 'contact':
        args.contact = value.trim();
        break;
      case 'email':
        args.email = value.trim().toLowerCase();
        break;
      case 'tier':
        if (!VALID_TIERS.has(value)) {
          throw new Error(`Invalid tier: ${value}. Use TRIAL, STANDARD, or ENTERPRISE.`);
        }
        args.tier = value as LicenseTier;
        break;
      case 'max-devices':
        args.maxDevices = parsePositiveInt(key, value);
        break;
      case 'max-users':
        args.maxUsers = parsePositiveInt(key, value);
        break;
      case 'days':
        args.days = parsePositiveInt(key, value);
        break;
      case 'activation-limit':
        args.activationLimit = parsePositiveInt(key, value);
        break;
      case 'phone':
        args.phone = value.trim();
        break;
      case 'notes':
        args.notes = value.trim();
        break;
      default:
        throw new Error(`Unknown option: --${key}`);
    }
  }

  return args;
}

function parsePositiveInt(key: string, value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${key} must be a positive integer`);
  }
  return parsed;
}

function requireValue<T>(value: T | undefined, name: string): T {
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required option: --${name}`);
  }
  return value;
}

function printUsage(): void {
  console.log(`
Usage:
  npm run license:create -- \\
    --company "Acme Ltd" \\
    --contact "Ali Veli" \\
    --email "admin@acme.com" \\
    --tier STANDARD \\
    --max-devices 250 \\
    --max-users 10 \\
    --days 365 \\
    --activation-limit 1

Optional:
  --phone "+90..."
  --notes "Internal note"
`);
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  const companyName = requireValue(args.company, 'company');
  const contactName = requireValue(args.contact, 'contact');
  const email = requireValue(args.email, 'email');
  const tier = requireValue(args.tier, 'tier');
  const maxDevices = requireValue(args.maxDevices, 'max-devices');
  const maxUsers = requireValue(args.maxUsers, 'max-users');
  const days = requireValue(args.days, 'days');
  const activationLimit = requireValue(args.activationLimit, 'activation-limit');

  const { prisma } = await import('../../lib/prisma');
  db = prisma;

  const { customer, license } = await createLicenseWithCustomer(db, {
    companyName,
    contactName,
    email,
    phone: args.phone,
    notes: args.notes,
    tier,
    maxDevices,
    maxUsers,
    days,
    activationLimit,
  });

  console.log('License created successfully.');
  console.log('');
  console.log(`Customer: ${customer.companyName} <${customer.email}>`);
  console.log(`Tier: ${license.tier}`);
  console.log(`Max devices: ${license.maxDevices}`);
  console.log(`Max users: ${license.maxUsers}`);
  console.log(`Activation limit: ${license.activationLimit}`);
  console.log(`Valid until: ${license.validUntil.toISOString()}`);
  console.log('');
  console.log(`License key: ${license.key}`);
  console.log('');
  console.log('Send only this license key to the customer.');
}

main()
  .catch((error) => {
    console.error(`License creation failed: ${error.message}`);
    printUsage();
    process.exitCode = 1;
  })
  .finally(async () => {
    await db?.$disconnect();
  });
