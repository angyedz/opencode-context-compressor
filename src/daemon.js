'use strict';

/**
 * context-compressor Daemon — starts the MITM proxy + MCP memory.
 */

const memoStore = require('./memo-store');

// Start MITM proxy (this also initializes the root CA on first run)
require('./proxy');

console.log(`- Stored memory checkpoints: ${memoStore.stats().entries} items`);
console.log(`- Disk storage: ~/.model-memo/memo.json`);
console.log('\n💡 Launch OpenCode through the proxy:');
console.log('   HTTP_PROXY=http://127.0.0.1:3266 HTTPS_PROXY=http://127.0.0.1:3266 opencode');
console.log('   Or use the wrapper: opencode-cc');
