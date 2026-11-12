'use strict';
/**
 * Node's built-in fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1 was set before
 * startup (Node >= 22.21). On a machine behind a proxy, re-exec once with it set.
 * On an ordinary connection this is a no-op.
 */
function ensureProxy() {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!proxy || process.env.NODE_USE_ENV_PROXY) return;
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
  process.exit(r.status === null ? 1 : r.status);
}
module.exports = { ensureProxy };
