#!/usr/bin/env node

const { build, dev, init } = require('../lib/builder');

const command = process.argv[2];

if (command === 'dev') {
  dev();
} else if (command === 'init') {
  init();
} else {
  build();
}
