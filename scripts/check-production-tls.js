// Preserve the existing CLI entry point while keeping scanner implementation in ESM.
import('./check-production-tls.mjs').then(({ run }) => run()).catch(() => {
  console.error('Production TLS scanner could not run');
  process.exitCode = 1;
});
