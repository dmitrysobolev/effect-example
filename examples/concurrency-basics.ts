/**
 * Concurrency Basics - Parallel and Race Patterns
 *
 * This example demonstrates:
 * - Running effects in parallel vs sequentially
 * - Racing effects (first to complete wins)
 * - Controlling concurrency with limits
 * - Working with fibers (lightweight threads)
 * - Interruption and cancellation
 */

import { Effect, Console, Duration, pipe, Fiber } from "effect"

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Simulates an async operation with configurable delay
 */
const simulateTask = (name: string, delayMs: number, result: string) =>
  pipe(
    Effect.sleep(Duration.millis(delayMs)),
    Effect.tap(() => Console.log(`${name} completed after ${delayMs}ms`)),
    Effect.map(() => result)
  )

/**
 * Logs the current time for demonstrating timing
 */
const logWithTime = (message: string) =>
  Effect.sync(() => {
    const time = new Date().toISOString().slice(14, 23)
    console.log(`[${time}] ${message}`)
  })

// ============================================================================
// 1. Sequential vs Parallel Execution
// ============================================================================

/**
 * Sequential execution - tasks run one after another
 * Total time: sum of all delays
 */
const sequentialExample = Effect.gen(function* () {
  yield* logWithTime("Starting sequential execution...")

  const result1 = yield* simulateTask("Task A", 100, "A")
  const result2 = yield* simulateTask("Task B", 100, "B")
  const result3 = yield* simulateTask("Task C", 100, "C")

  yield* logWithTime("Sequential execution completed")

  return [result1, result2, result3]
})

/**
 * Parallel execution with Effect.all
 * Total time: max of all delays (tasks run concurrently)
 */
const parallelExample = Effect.gen(function* () {
  yield* logWithTime("Starting parallel execution...")

  const results = yield* Effect.all(
    [
      simulateTask("Task A", 100, "A"),
      simulateTask("Task B", 100, "B"),
      simulateTask("Task C", 100, "C"),
    ],
    { concurrency: "unbounded" } // Run all in parallel
  )

  yield* logWithTime("Parallel execution completed")

  return results
})

/**
 * Compare timing: Sequential vs Parallel
 */
const compareSequentialVsParallel = Effect.gen(function* () {
  const start1 = Date.now()
  yield* sequentialExample
  const sequentialTime = Date.now() - start1

  const start2 = Date.now()
  yield* parallelExample
  const parallelTime = Date.now() - start2

  yield* Console.log(`\nSequential took ${sequentialTime}ms`)
  yield* Console.log(`Parallel took ${parallelTime}ms`)
  yield* Console.log(`Speedup: ${(sequentialTime / parallelTime).toFixed(1)}x`)
})

// ============================================================================
// 2. Racing Effects
// ============================================================================

/**
 * Race two effects - first to complete wins, loser is cancelled
 */
const raceExample = Effect.gen(function* () {
  yield* Console.log("Racing two API calls...")

  const winner = yield* Effect.race(
    simulateTask("Slow API", 200, "slow-result"),
    simulateTask("Fast API", 50, "fast-result")
  )

  yield* Console.log(`Winner: ${winner}`)
  return winner
})

/**
 * Race multiple effects with Effect.raceAll
 */
const raceMultiple = Effect.gen(function* () {
  yield* Console.log("Racing multiple tasks...")

  const winner = yield* Effect.raceAll([
    simulateTask("Task 1", 150, "Result 1"),
    simulateTask("Task 2", 100, "Result 2"),
    simulateTask("Task 3", 200, "Result 3"),
  ])

  yield* Console.log(`Winner: ${winner}`)
  return winner
})

/**
 * Race with timeout - fail if operation takes too long
 */
const withTimeout = <A, E>(
  operation: Effect.Effect<A, E>,
  timeoutMs: number
) =>
  Effect.gen(function* () {
    const result = yield* Effect.race(
      operation,
      pipe(
        Effect.sleep(Duration.millis(timeoutMs)),
        Effect.flatMap(() =>
          Effect.fail(new Error(`Timeout after ${timeoutMs}ms`))
        )
      )
    )
    return result
  })

const timeoutExample = Effect.gen(function* () {
  yield* Console.log("Testing timeout...")

  // This will succeed
  const result1 = yield* withTimeout(
    simulateTask("Fast task", 50, "success"),
    200
  )
  yield* Console.log(`Result 1: ${result1}`)

  // This will timeout
  try {
    yield* withTimeout(
      simulateTask("Slow task", 300, "too-slow"),
      100
    )
  } catch (error) {
    yield* Console.log(`Result 2: ${(error as Error).message}`)
  }
})

// ============================================================================
// 3. Controlled Concurrency
// ============================================================================

/**
 * Process items with concurrency limit
 * Useful for rate limiting or resource management
 */
const batchProcessing = (items: number[], concurrency: number) =>
  Effect.gen(function* () {
    yield* Console.log(`Processing ${items.length} items with concurrency ${concurrency}...`)

    const results = yield* Effect.all(
      items.map(item =>
        pipe(
          simulateTask(`Item ${item}`, 100, `Result ${item}`),
          Effect.tap(() => logWithTime(`Item ${item} done`))
        )
      ),
      { concurrency } // Limit concurrent operations
    )

    return results
  })

/**
 * Effect.forEach with concurrency control
 */
const forEachWithLimit = (items: string[], limit: number) =>
  Effect.gen(function* () {
    yield* Console.log(`Processing with forEach (limit ${limit})...`)

    yield* Effect.forEach(
      items,
      (item) => pipe(
        Effect.sleep(Duration.millis(100)),
        Effect.tap(() => logWithTime(`Processed: ${item}`))
      ),
      { concurrency: limit }
    )
  })

// ============================================================================
// 4. Working with Fibers
// ============================================================================

/**
 * Fork a fiber (background task) and join it later
 */
const forkJoinExample = Effect.gen(function* () {
  yield* Console.log("Forking background task...")

  // Fork starts the task in the background
  const fiber = yield* Effect.fork(
    simulateTask("Background Task", 200, "bg-result")
  )

  yield* Console.log("Main thread continues working...")
  yield* Effect.sleep(Duration.millis(50))

  yield* Console.log("Waiting for background task...")
  const result = yield* Fiber.join(fiber)

  yield* Console.log(`Background task result: ${result}`)
  return result
})

/**
 * Fork multiple fibers and join them all
 */
const forkMultipleExample = Effect.gen(function* () {
  yield* Console.log("Forking multiple background tasks...")

  const fiber1 = yield* Effect.fork(simulateTask("BG-1", 100, "Result-1"))
  const fiber2 = yield* Effect.fork(simulateTask("BG-2", 150, "Result-2"))
  const fiber3 = yield* Effect.fork(simulateTask("BG-3", 80, "Result-3"))

  yield* Console.log("All tasks forked, doing other work...")
  yield* Effect.sleep(Duration.millis(50))

  yield* Console.log("Joining all fibers...")
  const results = yield* Effect.all([
    Fiber.join(fiber1),
    Fiber.join(fiber2),
    Fiber.join(fiber3),
  ])

  return results
})

// ============================================================================
// 5. Interruption and Cancellation
// ============================================================================

/**
 * Manually interrupt a long-running fiber
 */
const interruptExample = Effect.gen(function* () {
  yield* Console.log("Starting long-running task...")

  const fiber = yield* Effect.fork(
    pipe(
      simulateTask("Long Task", 1000, "completed"),
      Effect.onInterrupt(() =>
        Console.log("Task was interrupted!")
      )
    )
  )

  yield* Effect.sleep(Duration.millis(100))
  yield* Console.log("Interrupting the task...")

  yield* Fiber.interrupt(fiber)
  yield* Console.log("Task interrupted")
})

/**
 * Uninterruptible regions - guarantee completion
 */
const uninterruptibleExample = Effect.gen(function* () {
  yield* Console.log("Critical section - cannot be interrupted")

  const result = yield* Effect.uninterruptible(
    pipe(
      Effect.sleep(Duration.millis(100)),
      Effect.tap(() => Console.log("Critical work completed")),
      Effect.map(() => "important-data")
    )
  )

  return result
})

// ============================================================================
// 6. Practical Examples
// ============================================================================

/**
 * Fetch data from multiple sources and use the fastest
 */
const fetchFromMultipleSources = Effect.gen(function* () {
  yield* Console.log("Fetching from multiple sources...")

  const data = yield* Effect.race(
    simulateTask("Primary DB", 150, { source: "primary", data: [1, 2, 3] }),
    simulateTask("Cache", 50, { source: "cache", data: [1, 2, 3] })
  )

  yield* Console.log(`Using data from: ${data.source}`)
  return data
})

/**
 * Process batch of API requests with rate limiting
 */
const batchApiRequests = (urls: string[], maxConcurrent: number) =>
  Effect.gen(function* () {
    yield* Console.log(`Fetching ${urls.length} URLs with max ${maxConcurrent} concurrent...`)

    const results = yield* Effect.all(
      urls.map(url =>
        simulateTask(`Fetch ${url}`, 100, `Response from ${url}`)
      ),
      { concurrency: maxConcurrent }
    )

    yield* Console.log(`All ${urls.length} requests completed`)
    return results
  })

/**
 * Parallel data processing pipeline
 */
const parallelPipeline = (data: number[]) =>
  Effect.gen(function* () {
    yield* Console.log("Running parallel pipeline...")

    // Stage 1: Transform all items in parallel
    const transformed = yield* Effect.all(
      data.map(item =>
        pipe(
          Effect.succeed(item * 2),
          Effect.tap(result => Console.log(`Transformed ${item} -> ${result}`))
        )
      ),
      { concurrency: "unbounded" }
    )

    // Stage 2: Filter in parallel
    const filtered = yield* Effect.all(
      transformed.map(item =>
        Effect.succeed(item > 10 ? item : null)
      ),
      { concurrency: "unbounded" }
    )

    return filtered.filter((x): x is number => x !== null)
  })

// ============================================================================
// Main Example Runner
// ============================================================================

async function main() {
  console.log("=== Concurrency Basics Examples ===\n")

  console.log("1. Sequential vs Parallel comparison:")
  await Effect.runPromise(compareSequentialVsParallel)
  console.log()

  console.log("2. Racing two effects:")
  await Effect.runPromise(raceExample)
  console.log()

  console.log("3. Racing multiple effects:")
  await Effect.runPromise(raceMultiple)
  console.log()

  console.log("4. Batch processing with concurrency limit (2):")
  await Effect.runPromise(batchProcessing([1, 2, 3, 4, 5], 2))
  console.log()

  console.log("5. Fork and join:")
  await Effect.runPromise(forkJoinExample)
  console.log()

  console.log("6. Fork multiple fibers:")
  const results = await Effect.runPromise(forkMultipleExample)
  console.log("Results:", results)
  console.log()

  console.log("7. Interrupt example:")
  await Effect.runPromise(interruptExample)
  console.log()

  console.log("8. Fetch from multiple sources:")
  await Effect.runPromise(fetchFromMultipleSources)
  console.log()

  console.log("9. Batch API requests:")
  await Effect.runPromise(batchApiRequests(
    ["api/users", "api/posts", "api/comments"],
    2
  ))
  console.log()
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error)
}

/**
 * Expected Output:
 * ================
 *
 * This example demonstrates:
 * - Sequential execution takes 3x longer than parallel for same tasks
 * - Racing returns the first completed result and cancels others
 * - Concurrency limits prevent overwhelming resources
 * - Fibers enable background processing
 * - Interruption allows cancelling long-running operations
 * - Uninterruptible regions guarantee completion of critical sections
 *
 * Key Takeaways:
 * - Use Effect.all with concurrency: "unbounded" for full parallelism
 * - Use Effect.all with concurrency: N to limit concurrent operations
 * - Effect.race for "first wins" scenarios (e.g., timeouts, fallbacks)
 * - Effect.fork/Fiber.join for background processing
 * - Effect.interrupt for cancellation
 * - Effect.uninterruptible for critical sections
 *
 * When to Use What:
 * - Sequential (concurrency: 1): Order matters, state dependencies
 * - Parallel (unbounded): Independent operations, maximize speed
 * - Limited (concurrency: N): Rate limiting, resource constraints
 * - Race: Timeouts, fastest source, fallback strategies
 * - Fibers: Long-running background tasks, fire-and-forget
 */
