'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { runBot } = require('./automation/naukri');

const forceHeaded = process.argv.includes('--headed');

console.log(`Running bot in ${forceHeaded ? 'HEADED (visible)' : 'headless'} mode...\n`);

runBot({ forceHeaded })
  .then(({ jobsFound, jobsApplied }) => {
    console.log(`\nDone — ${jobsFound} jobs found, ${jobsApplied} applied`);
    process.exit(0);
  })
  .catch(err => {
    console.error('\nBot failed:', err.message);
    process.exit(1);
  });
