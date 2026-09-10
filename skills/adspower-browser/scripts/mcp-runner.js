const { spawn } = require('child_process');
const { getLiveAdsPowerPort, requireCredential, loadCredentials } = require('./admin-kit-core');

function runAdsPowerMcp() {
    // 1. Resolve live port dynamically from runtime file
    let port = getLiveAdsPowerPort();
    if (!port) {
        port = parseInt(process.env.PORT || '50325', 10);
    }

    // 2. Resolve API key from AutoLab Admin credentials or environment
    let apiKey = process.env.API_KEY || '';
    if (!apiKey) {
        try {
            apiKey = requireCredential('adsPowerApiKey');
        } catch (e) {
            console.error('[AdsPower MCP Runner] Warning:', e.message);
        }
    }

    // 3. Inject into environment
    const childEnv = {
        ...process.env,
        PORT: String(port),
        API_KEY: apiKey
    };

    // 4. Spawn local-api-mcp-typescript with stdio piped for MCP JSON-RPC
    const isWin = process.platform === 'win32';
    const child = spawn(isWin ? 'npx.cmd' : 'npx', ['-y', 'local-api-mcp-typescript'], {
        stdio: 'inherit',
        shell: isWin,
        env: childEnv
    });

    child.on('error', (err) => {
        console.error('[AdsPower MCP Runner] Failed to start MCP server:', err);
        process.exit(1);
    });

    child.on('exit', (code) => {
        process.exit(code || 0);
    });
}

if (require.main === module) {
    runAdsPowerMcp();
}

module.exports = { runAdsPowerMcp };
