#!/usr/bin/env node

const { build, dev, init } = require('../lib/builder');

const HELP_TEXT = `mssgen - Minimal static site generator

Usage:
  mssgen [command] [options]

Commands:
  init       Create setting.json, common parts, and index.html when missing
  dev        Start a development server with live reload
  help       Show this help

Options:
  -h, --help Show help for any command

Examples:
  mssgen init
  mssgen
  mssgen dev
`;

function printHelp() {
  console.log(HELP_TEXT.trimEnd());
}

const args = process.argv.slice(2);
const command = args[0];
const wantsHelp = args.includes('--help') || args.includes('-h') || command === 'help';

(async () => {
  if (wantsHelp) {
    printHelp();
    return;
  }

  if (!command) {
    await build();
    return;
  }

  if (command === 'dev') {
    dev();
    return;
  }

  if (command === 'init') {
    init();
    return;
  }

  console.error(`[mssgen] unknown command: ${command}`);
  printHelp();
  process.exitCode = 1;
})().catch((error) => {
  console.error(`[mssgen] ${error.message}`);
  process.exitCode = 1;
});
