"use strict";
/**
 * PropAgent Deployment Script
 * Automated setup for Termux environment
 */
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const DB_USER = 'propagent';
const DB_PASS = 'propagent123';
const DB_NAME = 'propagent';
const commands = {
    // PostgreSQL
    startPostgres: 'su postgres -c "/usr/lib/postgresql/17/bin/pg_ctl -D /var/lib/postgresql/17/main -l /var/lib/postgresql/logfile start"',
    // Database setup
    createDb: `su postgres -c "psql -c \\"CREATE DATABASE ${DB_NAME};\\""`,
    createUser: `su postgres -c "psql -c \\"CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';\\""`,
    grantPrivileges: `su postgres -c "psql -c \\"GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};\\""`,
    // Redis
    startRedis: 'redis-server --daemonize yes',
    // Dependencies
    installDeps: 'npm install',
    installWebDeps: 'cd apps/web && npm install && cd ../..',
};
async function runStep(name, cmd) {
    console.log(`\n[STEP] ${name}`);
    console.log(`[CMD] ${cmd}`);
    try {
        const { stdout, stderr } = await execAsync(cmd, { timeout: 120000 });
        console.log(`[OK] ${name} completed`);
        return { success: true, output: stdout || stderr };
    }
    catch (error) {
        console.log(`[ERROR] ${name} failed: ${error.message}`);
        return { success: false, output: error.message };
    }
}
async function main() {
    console.log('========================================');
    console.log('PropAgent Deployment Script');
    console.log('========================================');
    console.log(`Started at: ${new Date().toISOString()}`);
    const results = [];
    // Step 1: Start PostgreSQL
    let result = await runStep('Start PostgreSQL', commands.startPostgres);
    results.push({ step: 'Start PostgreSQL', ...result });
    // Step 2: Start Redis
    result = await runStep('Start Redis', commands.startRedis);
    results.push({ step: 'Start Redis', ...result });
    // Step 3: Create database
    result = await runStep('Create Database', commands.createDb);
    results.push({ step: 'Create Database', ...result });
    // Step 4: Create user
    result = await runStep('Create User', commands.createUser);
    results.push({ step: 'Create User', ...result });
    // Step 5: Grant privileges
    result = await runStep('Grant Privileges', commands.grantPrivileges);
    results.push({ step: 'Grant Privileges', ...result });
    // Step 6: Install dependencies
    result = await runStep('Install Dependencies', commands.installDeps);
    results.push({ step: 'Install Dependencies', ...result });
    // Step 7: Install Web dependencies
    result = await runStep('Install Web Dependencies', commands.installWebDeps);
    results.push({ step: 'Install Web Dependencies', ...result });
    // Summary
    console.log('\n========================================');
    console.log('Deployment Summary');
    console.log('========================================');
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    console.log(`Successful: ${successful}/${results.length}`);
    console.log(`Failed: ${failed}/${results.length}`);
    results.forEach(r => {
        console.log(`[${r.success ? 'OK' : 'FAIL'}] ${r.step}`);
    });
    console.log(`\nCompleted at: ${new Date().toISOString()}`);
    // Write results to file
    const reportPath = '/root/.openclaw/workspace/PropAgent/docs/DEPLOYMENT-RESULTS.md';
    const report = generateReport(results, successful, failed);
    require('fs').writeFileSync(reportPath, report);
    console.log(`\nReport saved to: ${reportPath}`);
}
function generateReport(results, successful, failed) {
    return `# PropAgent Deployment Results

## Summary
- **Date:** ${new Date().toISOString()}
- **Successful Steps:** ${successful}/${results.length}
- **Failed Steps:** ${failed}

## Steps Executed

| Step | Status | Output |
|------|--------|--------|
${results.map(r => `| ${r.step} | ${r.success ? '✅ OK' : '❌ FAIL'} | ${r.output.substring(0, 100).replace(/\n/g, ' ')} |`).join('\n')}

## Next Steps

1. Run database migrations:
   \`\`\`bash
   cd /root/.openclaw/workspace/PropAgent
   npm run migrate
   \`\`\`

2. Start services:
   \`\`\`bash
   npm run dev:auth &
   npm run dev:ingestion &
   npm run dev:analytics &
   npm run dev:worker &
   cd apps/web && npm run dev &
   \`\`\`

3. Access the application:
   - Web UI: http://localhost:3000
   - Auth API: http://localhost:4005
   - Ingestion API: http://localhost:4000
   - Analytics API: http://localhost:4003

## Environment Variables Required

\`\`\`bash
export DATABASE_URL="postgresql://propagent:propagent123@localhost:5432/propagent"
export REDIS_URL="redis://localhost:6379"
export JWT_SECRET="your-secret-key-here"
export JWT_REFRESH_SECRET="your-refresh-secret-here"
\`\`\`

---
*Generated by PropAgent Deployment Script*
`;
}
main().catch(console.error);
//# sourceMappingURL=deploy.js.map