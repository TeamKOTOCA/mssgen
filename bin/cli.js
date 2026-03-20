#!/usr/bin/env node

const { build, dev, init } = require('../lib/builder');

const command = process.argv[2];

(async () => {
  if (command === 'dev') {
    dev();
    return;
  }

  if (command === 'init') {
    init();
    return;
  }

  await build();
})().catch((error) => {
  console.error(`[mssgen] ${error.message}`);
  process.exitCode = 1;
});
