import type { Reporter, File, Task } from 'vitest';

interface TimingData {
  name: string;
  duration: number;
  status: 'pass' | 'fail' | 'skip';
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
};

class TimingReporter implements Reporter {
  private timings: Map<string, TimingData[]> = new Map();

  onTaskUpdate(tasks: Task[]) {
    // Collect timing data from completed tasks
    tasks.forEach(task => {
      if (task.result?.state === 'pass' || task.result?.state === 'fail') {
        const duration = task.result.duration || 0;
        const file = (task as any).file?.name || 'unknown';

        if (!this.timings.has(file)) {
          this.timings.set(file, []);
        }

        const fileTimings = this.timings.get(file)!;
        const existing = fileTimings.find(t => t.name === task.name);

        if (!existing) {
          fileTimings.push({
            name: task.name,
            duration,
            status: task.result.state as 'pass' | 'fail'
          });
        }
      }
    });
  }

  onFinished(files?: File[]) {
    if (!files || files.length === 0) return;

    console.log(`\n${colors.bright}${colors.cyan}╔═══════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}║                    Test Timing Report                     ║${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}╚═══════════════════════════════════════════════════════════╝${colors.reset}\n`);

    // Collect all test timings
    const allTimings: Array<TimingData & { file: string }> = [];
    files.forEach(file => {
      file.tasks.forEach(task => {
        this.collectTaskTimings(task, file.name, allTimings);
      });
    });

    if (allTimings.length === 0) {
      console.log(`${colors.yellow}No timing data available${colors.reset}\n`);
      return;
    }

    // Sort by duration (slowest first)
    allTimings.sort((a, b) => b.duration - a.duration);

    // Print top 10 slowest tests
    console.log(`${colors.bright}Top 10 Slowest Tests:${colors.reset}\n`);
    const top10 = allTimings.slice(0, 10);
    const maxDuration = Math.max(...top10.map(t => t.duration));

    top10.forEach((timing, index) => {
      const barWidth = 40;
      const barLength = Math.floor((timing.duration / maxDuration) * barWidth);
      const bar = '▰'.repeat(barLength) + '▱'.repeat(barWidth - barLength);

      const statusColor = timing.status === 'pass' ? colors.green : colors.red;
      const durationColor = timing.duration > 1000 ? colors.red : timing.duration > 500 ? colors.yellow : colors.green;

      console.log(`${colors.dim}${(index + 1).toString().padStart(2)}.${colors.reset} ${statusColor}${timing.status === 'pass' ? '✓' : '✗'}${colors.reset} ${timing.name}`);
      console.log(`    ${colors.blue}${bar}${colors.reset} ${durationColor}${this.formatDuration(timing.duration)}${colors.reset}`);
      console.log(`    ${colors.dim}${timing.file}${colors.reset}\n`);
    });

    // Statistics
    const totalDuration = allTimings.reduce((sum, t) => sum + t.duration, 0);
    const avgDuration = totalDuration / allTimings.length;
    const passedTests = allTimings.filter(t => t.status === 'pass');
    const failedTests = allTimings.filter(t => t.status === 'fail');

    console.log(`${colors.bright}Statistics:${colors.reset}\n`);
    console.log(`  Total tests:      ${allTimings.length}`);
    console.log(`  ${colors.green}Passed:${colors.reset}           ${passedTests.length}`);
    if (failedTests.length > 0) {
      console.log(`  ${colors.red}Failed:${colors.reset}           ${failedTests.length}`);
    }
    console.log(`  Total duration:   ${this.formatDuration(totalDuration)}`);
    console.log(`  Average:          ${this.formatDuration(avgDuration)}`);
    console.log(`  Slowest:          ${this.formatDuration(allTimings[0]?.duration || 0)}`);
    console.log(`  Fastest:          ${this.formatDuration(allTimings[allTimings.length - 1]?.duration || 0)}`);

    // Performance warnings
    const slowTests = allTimings.filter(t => t.duration > 1000);
    if (slowTests.length > 0) {
      console.log(`\n${colors.yellow}⚠ Performance Warning:${colors.reset}`);
      console.log(`  ${slowTests.length} test(s) took longer than 1 second`);
      console.log(`  Consider optimizing or splitting these tests\n`);
    }

    // File-based summary
    console.log(`\n${colors.bright}Duration by Test File:${colors.reset}\n`);
    const fileTimings = new Map<string, number>();
    allTimings.forEach(t => {
      fileTimings.set(t.file, (fileTimings.get(t.file) || 0) + t.duration);
    });

    const sortedFiles = Array.from(fileTimings.entries()).sort((a, b) => b[1] - a[1]);
    const maxFileDuration = Math.max(...sortedFiles.map(([, d]) => d));

    sortedFiles.forEach(([file, duration]) => {
      const barWidth = 30;
      const barLength = Math.floor((duration / maxFileDuration) * barWidth);
      const bar = '▰'.repeat(barLength) + '▱'.repeat(barWidth - barLength);
      const fileName = file.split('/').pop() || file;

      console.log(`  ${fileName.padEnd(35)} ${colors.cyan}${bar}${colors.reset} ${this.formatDuration(duration)}`);
    });

    console.log();
  }

  private collectTaskTimings(task: Task, fileName: string, timings: Array<TimingData & { file: string }>) {
    if (task.type === 'test' && task.result) {
      const duration = task.result.duration || 0;
      const status = task.result.state === 'pass' ? 'pass' : task.result.state === 'fail' ? 'fail' : 'skip';

      timings.push({
        name: task.name,
        duration,
        status,
        file: fileName
      });
    }

    // Recursively collect from nested tasks
    if (task.tasks) {
      task.tasks.forEach(childTask => {
        this.collectTaskTimings(childTask, fileName, timings);
      });
    }
  }

  private formatDuration(ms: number): string {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }
}

export default TimingReporter;
