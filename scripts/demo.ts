#!/usr/bin/env ts-node
import * as readline from 'readline';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface Example {
  name: string;
  file: string;
  description: string;
}

const examples: Example[] = [
  {
    name: 'Quick Start',
    file: 'examples/quick-start.ts',
    description: 'Basic Effect patterns and error handling'
  },
  {
    name: 'Error Handling',
    file: 'examples/error-handling.ts',
    description: 'Typed errors and recovery strategies'
  },
  {
    name: 'Concurrency Basics',
    file: 'examples/concurrency-basics.ts',
    description: 'Parallel processing, racing, and fiber management'
  },
  {
    name: 'Scheduling Basics',
    file: 'examples/scheduling-basics.ts',
    description: 'Retry patterns, backoff strategies, and jitter'
  }
];

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

function printBanner() {
  console.log(`
${colors.cyan}${colors.bright}╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║           Effect Library - Interactive Demo               ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}
`);
}

function printMenu() {
  console.log(`${colors.bright}Available Examples:${colors.reset}\n`);
  examples.forEach((example, index) => {
    console.log(`  ${colors.green}${index + 1}.${colors.reset} ${colors.bright}${example.name}${colors.reset}`);
    console.log(`     ${colors.yellow}→${colors.reset} ${example.description}\n`);
  });
  console.log(`  ${colors.green}0.${colors.reset} ${colors.bright}Exit${colors.reset}\n`);
}

function runExample(example: Example): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n${colors.cyan}${colors.bright}Running: ${example.name}${colors.reset}`);
    console.log(`${colors.yellow}${'='.repeat(60)}${colors.reset}\n`);

    const child = spawn('npm', ['run', 'example', example.file], {
      stdio: 'inherit',
      shell: true
    });

    child.on('close', (code) => {
      console.log(`\n${colors.yellow}${'='.repeat(60)}${colors.reset}`);
      if (code === 0) {
        console.log(`${colors.green}✓ Example completed successfully${colors.reset}\n`);
        resolve();
      } else {
        console.log(`${colors.yellow}⚠ Example exited with code ${code}${colors.reset}\n`);
        resolve(); // Still resolve to continue the demo
      }
    });

    child.on('error', (error) => {
      console.error(`${colors.yellow}Error running example:${colors.reset}`, error);
      reject(error);
    });
  });
}

async function promptUser(rl: readline.Interface): Promise<number> {
  return new Promise((resolve) => {
    rl.question(`${colors.bright}Select an example (0-${examples.length}): ${colors.reset}`, (answer) => {
      const choice = parseInt(answer.trim(), 10);
      resolve(choice);
    });
  });
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  printBanner();

  let running = true;
  while (running) {
    printMenu();
    const choice = await promptUser(rl);

    if (choice === 0) {
      console.log(`\n${colors.cyan}Thanks for trying Effect! 👋${colors.reset}\n`);
      running = false;
    } else if (choice >= 1 && choice <= examples.length) {
      const example = examples[choice - 1];
      try {
        await runExample(example);

        // Ask if they want to continue
        const continuePrompt = await new Promise<string>((resolve) => {
          rl.question(`\n${colors.bright}Press Enter to continue or 'q' to quit: ${colors.reset}`, (answer) => {
            resolve(answer.trim().toLowerCase());
          });
        });

        if (continuePrompt === 'q') {
          console.log(`\n${colors.cyan}Thanks for trying Effect! 👋${colors.reset}\n`);
          running = false;
        } else {
          console.clear();
          printBanner();
        }
      } catch (error) {
        console.error(`\n${colors.yellow}Error:${colors.reset}`, error);
      }
    } else {
      console.log(`\n${colors.yellow}Invalid choice. Please select a number between 0 and ${examples.length}.${colors.reset}\n`);
    }
  }

  rl.close();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
