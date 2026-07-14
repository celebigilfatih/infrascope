const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourceRoots = ['app', 'lib'];

function collectFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(target);
    return /\.(ts|tsx)$/.test(entry.name) ? [target] : [];
  });
}

const files = sourceRoots.flatMap((directory) => collectFiles(path.join(root, directory)));
const failures = [];
let directConstructors = 0;

for (const file of files) {
  const relative = path.relative(root, file);
  const source = fs.readFileSync(file, 'utf8');

  if (/new\s+FortiGateService\s*\(/.test(source)) {
    if (relative !== 'lib/firewall/connector-factory.ts') {
      failures.push(`${relative}: FortiGateService must be created by connector-factory`);
    } else {
      directConstructors += (source.match(/new\s+FortiGateService\s*\(/g) || []).length;
    }
  }

  if (/integrationConfig\.findFirst\([\s\S]{0,240}type:\s*['"]FORTIGATE['"]/.test(source)) {
    failures.push(`${relative}: arbitrary FortiGate findFirst target selection is forbidden`);
  }
}

const serviceSource = fs.readFileSync(path.join(root, 'lib/integrations/fortigate.ts'), 'utf8');
if (/new\s+PrismaClient\s*\(/.test(serviceSource)) {
  failures.push('lib/integrations/fortigate.ts: shared prisma client is required');
}
if (!serviceSource.includes("requestUrl.searchParams.set('vdom', this.config.vdom)")) {
  failures.push('lib/integrations/fortigate.ts: REST requests must carry VDOM scope');
}

const apiSource = fs.readFileSync(path.join(root, 'app/api/integrations/fortigate/route.ts'), 'utf8');
if (!apiSource.includes('`${target.key}:${suffix}`')) {
  failures.push('app/api/integrations/fortigate/route.ts: response cache must use target key');
}
if (directConstructors !== 2) {
  failures.push(`connector-factory should contain exactly shared and ephemeral constructors (found ${directConstructors})`);
}

if (failures.length > 0) {
  console.error('FortiGate connector scope check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('FortiGate connector scope check passed (singleton, target, VDOM, Prisma, cache).');
