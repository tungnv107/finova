/** Disposable, loopback-only audit environment. Never loads application credentials. */
import { spawnSync } from 'node:child_process';
const port = process.env.FINOVA_AUDIT_DB_PORT;
if (!port || !/^\d{2,5}$/.test(port)) throw new Error('Set FINOVA_AUDIT_DB_PORT to the disposable PostgreSQL container port');
Object.assign(process.env, {
 DATABASE_URL: `postgresql://finova_qa:disposable_qa_only@127.0.0.1:${port}/finova_system_audit`,
 BETTER_AUTH_SECRET: 'finova-disposable-system-audit-secret-20261031',
 BETTER_AUTH_URL: 'http://localhost:31800', NEXT_PUBLIC_APP_URL: 'http://localhost:31800',
 FINOVA_NEXT_DIST_DIR: '.next-system-audit', FINOVA_TEST_RUN: '1',
 FINOVA_ADMIN_ENABLED: '1', FINOVA_USER_ACCESS_ENFORCED: '1', FINOVA_PREMIUM_ENTITLEMENTS_ENFORCED: '0',
 FINOVA_USAGE_ANALYTICS_ENABLED: '0', FINOVA_BILLING_CHECKOUT_ENABLED: '0', FINOVA_CSP_ENFORCE: '1',
 GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', OPENAI_API_KEY: '',
 LLM__Endpoint: '', LLM__ApiKey: '', LLM__ChatModelId: '', LLM__VisionModelId: '', LLM__ApiMode: '', LLM__ResponseFormat: '',
 FINOVA_SEPAY_BANKHUB_ENABLED: '0', FINOVA_BILLING_SEPAY_WEBHOOK_ENABLED: '0', FINOVA_BILLING_ALERTS_ENABLED: '0',
 FINOVA_TRUSTED_CLIENT_IP_HEADER: '',
});
const mode = process.argv[2];
if (mode === "integration" || mode === "security") { process.env.DATABASE_URL = process.env.DATABASE_URL.replace("/finova_system_audit", "/finova_test"); process.env.FINOVA_ADMIN_ENABLED = "0"; process.env.FINOVA_USER_ACCESS_ENFORCED = "0"; }
const args = mode === 'server' ? ['node_modules/next/dist/bin/next', 'dev', '--webpack', '-p', '31800', '--hostname', '127.0.0.1']
 : mode === 'integration' ? ['--import', 'tsx', 'scripts/integration-check.ts']
 : mode === 'security' ? ['--import', 'tsx', 'scripts/security-integration-check.ts']
 : mode === 'browser' ? ['--import', 'tsx', 'scripts/system-audit-browser.ts']
 : null;
if (!args) throw new Error('Choose server, integration, or browser');
const child = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env, windowsHide: true });
process.exitCode = child.status ?? 1;
