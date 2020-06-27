import fs from 'fs';

const FILE = 'test.log';
const MAX_LINES = 100000000;
const SLEEP_TIME = 2 * 1000;

let currentLine = 0;

async function main() {
  while (true) {
    if (currentLine > MAX_LINES) {
      currentLine = 0;
      fs.unlinkSync(FILE);
    }
    currentLine += 1;

    fs.appendFileSync(FILE, `Log line: ${currentLine}...\r\n`);
    await new Promise((resolve) => setTimeout(resolve, SLEEP_TIME));
  }
}

main();
