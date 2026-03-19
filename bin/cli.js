#!/usr/bin/env node

const { build, dev } = require('../lib/builder');

const command = process.argv[2];

if (command === 'dev') {
  dev();
} else {
  build();
}
