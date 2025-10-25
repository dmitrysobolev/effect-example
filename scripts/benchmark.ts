#!/usr/bin/env ts-node
import { Effect, pipe, Schedule, Duration } from 'effect';
import * as fs from 'fs';
import * as path from 'path';

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  opsPerSecond: number;
}

interface BenchmarkSuite {
  timestamp: string;
  results: BenchmarkResult[];
  metadata: {
    nodeVersion: string;
    platform: string;
    cpus: number;
  };
}

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

const BASELINE_FILE = path.join(__dirname, '..', '.benchmark-baseline.json');
const ITERATIONS = 1000;

// Sample benchmark functions
const benchmarks = [
  {
    name: 'Effect.succeed',
    fn: () => Effect.succeed(42)
  },
  {
    name: 'Effect.fail',
    fn: () => Effect.fail('error')
  },
  {
    name: 'pipe with flatMap',
    fn: () => pipe(
      Effect.succeed(1),
      Effect.flatMap(n => Effect.succeed(n + 1)),
      Effect.flatMap(n => Effect.succeed(n * 2))
    )
  },
  {
    name: 'Effect.all (3 effects)',
    fn: () => Effect.all([
      Effect.succeed(1),
      Effect.succeed(2),
      Effect.succeed(3)
    ])
  },
  {
    name: 'Effect.race (2 effects)',
    fn: () => Effect.race(
      Effect.succeed(1),
      Effect.succeed(2)
    )
  },
  {
    name: 'Effect.gen',
    fn: () => Effect.gen(function* (_) {
      const a = yield* _(Effect.succeed(1));
      const b = yield* _(Effect.succeed(2));
      return a + b;
    })
  },
  {
    name: 'Effect.catchAll',
    fn: () => pipe(
      Effect.fail('error'),
      Effect.catchAll(() => Effect.succeed('recovered'))
    )
  },
  {
    name: 'Effect with delay',
    fn: () => pipe(
      Effect.succeed(42),
      Effect.delay(Duration.millis(1))
    )
  }
];

async function runBenchmark(name: string, fn: () => Effect.Effect<any, any, any>, iterations: number): Promise<BenchmarkResult> {
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await Effect.runPromise(fn());
    const end = performance.now();
    times.push(end - start);
  }

  const totalTime = times.reduce((sum, t) => sum + t, 0);
  const averageTime = totalTime / iterations;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const opsPerSecond = 1000 / averageTime;

  return {
    name,
    iterations,
    totalTime,
    averageTime,
    minTime,
    maxTime,
    opsPerSecond
  };
}

function formatNumber(num: number, decimals: number = 2): string {
  return num.toFixed(decimals);
}

function formatTime(ms: number): string {
  if (ms < 0.001) return `${formatNumber(ms * 1000000, 3)}ns`;
  if (ms < 1) return `${formatNumber(ms * 1000, 3)}μs`;
  if (ms < 1000) return `${formatNumber(ms, 3)}ms`;
  return `${formatNumber(ms / 1000, 3)}s`;
}

function printProgressBar(current: number, total: number, name: string) {
  const percentage = Math.floor((current / total) * 100);
  const barLength = 30;
  const filled = Math.floor((current / total) * barLength);
  const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);

  process.stdout.write(`\r${colors.cyan}${bar}${colors.reset} ${percentage}% - ${name}${' '.repeat(50)}`);

  if (current === total) {
    process.stdout.write('\n');
  }
}

function printBenchmarkResult(result: BenchmarkResult, baseline?: BenchmarkResult) {
  console.log(`\n${colors.bright}${colors.blue}${result.name}${colors.reset}`);
  console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}`);
  console.log(`  Iterations:    ${colors.yellow}${result.iterations.toLocaleString()}${colors.reset}`);
  console.log(`  Total time:    ${colors.cyan}${formatTime(result.totalTime)}${colors.reset}`);
  console.log(`  Average time:  ${colors.cyan}${formatTime(result.averageTime)}${colors.reset}`);
  console.log(`  Min time:      ${colors.green}${formatTime(result.minTime)}${colors.reset}`);
  console.log(`  Max time:      ${colors.yellow}${formatTime(result.maxTime)}${colors.reset}`);
  console.log(`  Ops/sec:       ${colors.magenta}${formatNumber(result.opsPerSecond, 0).toLocaleString()}${colors.reset}`);

  if (baseline) {
    const avgDiff = ((result.averageTime - baseline.averageTime) / baseline.averageTime) * 100;
    const opsDiff = ((result.opsPerSecond - baseline.opsPerSecond) / baseline.opsPerSecond) * 100;

    const avgColor = avgDiff > 10 ? colors.red : avgDiff > 5 ? colors.yellow : colors.green;
    const opsColor = opsDiff < -10 ? colors.red : opsDiff < -5 ? colors.yellow : colors.green;

    console.log(`\n  ${colors.bright}Baseline Comparison:${colors.reset}`);
    console.log(`    Avg time:    ${avgColor}${avgDiff > 0 ? '+' : ''}${formatNumber(avgDiff)}%${colors.reset}`);
    console.log(`    Ops/sec:     ${opsColor}${opsDiff > 0 ? '+' : ''}${formatNumber(opsDiff)}%${colors.reset}`);
  }
}

function saveBaseline(suite: BenchmarkSuite) {
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(suite, null, 2), 'utf-8');
  console.log(`\n${colors.green}✓ Baseline saved to ${BASELINE_FILE}${colors.reset}`);
}

function loadBaseline(): BenchmarkSuite | null {
  try {
    if (fs.existsSync(BASELINE_FILE)) {
      const data = fs.readFileSync(BASELINE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error(`${colors.yellow}Warning: Could not load baseline${colors.reset}`, error);
  }
  return null;
}

function printSummary(results: BenchmarkResult[], baseline: BenchmarkSuite | null) {
  console.log(`\n${colors.bright}${colors.cyan}╔═══════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}║                    Benchmark Summary                      ║${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}╚═══════════════════════════════════════════════════════════╝${colors.reset}\n`);

  // Find fastest and slowest
  const sorted = [...results].sort((a, b) => a.averageTime - b.averageTime);
  const fastest = sorted[0];
  const slowest = sorted[sorted.length - 1];

  console.log(`${colors.green}⚡ Fastest:${colors.reset} ${fastest.name} (${formatTime(fastest.averageTime)})`);
  console.log(`${colors.yellow}🐌 Slowest:${colors.reset} ${slowest.name} (${formatTime(slowest.averageTime)})`);
  console.log(`${colors.blue}📊 Speed ratio:${colors.reset} ${formatNumber(slowest.averageTime / fastest.averageTime)}x\n`);

  if (baseline) {
    const regressions = results.filter((r, i) => {
      const baselineResult = baseline.results[i];
      if (!baselineResult) return false;
      const diff = ((r.averageTime - baselineResult.averageTime) / baselineResult.averageTime) * 100;
      return diff > 10;
    });

    if (regressions.length > 0) {
      console.log(`${colors.red}⚠ Performance Regressions Detected:${colors.reset}`);
      regressions.forEach(r => {
        const baselineResult = baseline.results.find(b => b.name === r.name);
        if (baselineResult) {
          const diff = ((r.averageTime - baselineResult.averageTime) / baselineResult.averageTime) * 100;
          console.log(`  - ${r.name}: ${colors.red}+${formatNumber(diff)}%${colors.reset} slower`);
        }
      });
      console.log();
    } else {
      console.log(`${colors.green}✓ No significant performance regressions${colors.reset}\n`);
    }
  }
}

function printVisualComparison(results: BenchmarkResult[]) {
  console.log(`${colors.bright}${colors.cyan}Visual Performance Comparison:${colors.reset}\n`);

  const maxOps = Math.max(...results.map(r => r.opsPerSecond));
  const barWidth = 40;

  results.forEach(result => {
    const barLength = Math.floor((result.opsPerSecond / maxOps) * barWidth);
    const bar = '▰'.repeat(barLength) + '▱'.repeat(barWidth - barLength);

    console.log(`${result.name.padEnd(25)} ${colors.green}${bar}${colors.reset} ${formatNumber(result.opsPerSecond, 0).padStart(10)} ops/sec`);
  });
  console.log();
}

async function main() {
  const args = process.argv.slice(2);
  const shouldSaveBaseline = args.includes('--save-baseline');
  const shouldCompare = !args.includes('--no-compare');

  console.log(`\n${colors.cyan}${colors.bright}╔═══════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}║              Effect Library - Benchmarks                  ║${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}╚═══════════════════════════════════════════════════════════╝${colors.reset}\n`);

  const baseline = shouldCompare ? loadBaseline() : null;

  if (baseline) {
    console.log(`${colors.green}✓ Loaded baseline from ${baseline.timestamp}${colors.reset}`);
  } else if (shouldCompare) {
    console.log(`${colors.yellow}⚠ No baseline found. Run with --save-baseline to create one.${colors.reset}`);
  }

  console.log(`\n${colors.bright}Running ${benchmarks.length} benchmarks (${ITERATIONS.toLocaleString()} iterations each)...${colors.reset}\n`);

  const results: BenchmarkResult[] = [];

  for (let i = 0; i < benchmarks.length; i++) {
    const benchmark = benchmarks[i];
    printProgressBar(i, benchmarks.length, benchmark.name);
    const result = await runBenchmark(benchmark.name, benchmark.fn, ITERATIONS);
    results.push(result);
    printProgressBar(i + 1, benchmarks.length, benchmark.name);
  }

  console.log(`\n${colors.bright}${colors.green}✓ All benchmarks completed${colors.reset}\n`);

  // Print individual results
  console.log(`${colors.bright}${colors.cyan}Detailed Results:${colors.reset}`);
  results.forEach((result, i) => {
    const baselineResult = baseline?.results.find(b => b.name === result.name);
    printBenchmarkResult(result, baselineResult);
  });

  // Print visual comparison
  console.log();
  printVisualComparison(results);

  // Print summary
  printSummary(results, baseline);

  // Save baseline if requested
  if (shouldSaveBaseline) {
    const suite: BenchmarkSuite = {
      timestamp: new Date().toISOString(),
      results,
      metadata: {
        nodeVersion: process.version,
        platform: process.platform,
        cpus: require('os').cpus().length
      }
    };
    saveBaseline(suite);
  }

  // Check for regressions and exit with error code if found
  if (baseline) {
    const hasRegressions = results.some((r, i) => {
      const baselineResult = baseline.results.find(b => b.name === r.name);
      if (!baselineResult) return false;
      const diff = ((r.averageTime - baselineResult.averageTime) / baselineResult.averageTime) * 100;
      return diff > 10;
    });

    if (hasRegressions) {
      console.log(`${colors.red}❌ Benchmark failed: Performance regressions detected${colors.reset}\n`);
      process.exit(1);
    }
  }

  console.log(`${colors.green}✓ Benchmark completed successfully${colors.reset}\n`);
}

main().catch((error) => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});
