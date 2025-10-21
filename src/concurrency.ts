import { Effect, Console, Duration, pipe, Exit, Fiber } from "effect"

// Type aliases
type Fx<A, E = never> = Effect.Effect<A, E>

/**
 * Simulates an API call with configurable delay and result
 */
export const simulateApiCall = <A>(
  name: string,
  delayMs: number,
  result: A
): Fx<A> =>
  pipe(
    Effect.sleep(Duration.millis(delayMs)),
    Effect.tap(() => Console.log(`${name} completed after ${delayMs}ms`)),
    Effect.map(() => result)
  )

/**
 * Simulates a failing API call
 */
export const simulateFailingApiCall = (
  name: string,
  delayMs: number,
  errorMessage: string
): Fx<never, Error> =>
  pipe(
    Effect.sleep(Duration.millis(delayMs)),
    Effect.tap(() => Console.log(`${name} failed after ${delayMs}ms`)),
    Effect.flatMap(() => Effect.fail(new Error(errorMessage)))
  )

// ============================================================================
// 1. Racing Effects
// ============================================================================

/**
 * Races two effects - returns the result of whichever completes first
 * The loser is automatically interrupted
 */
export const raceExample = pipe(
  Effect.race(
    simulateApiCall("Slow API", 1000, { source: "slow", data: "slow result" }),
    simulateApiCall("Fast API", 100, { source: "fast", data: "fast result" })
  ),
  Effect.tap((result) => Console.log(`Race winner: ${result.source}`))
)

/**
 * Races multiple effects using Effect.raceAll
 */
export const raceAllExample = (delays: number[]) =>
  pipe(
    Effect.raceAll(
      delays.map((delay, i) =>
        simulateApiCall(`API-${i + 1}`, delay, { apiId: i + 1, delay })
      )
    ),
    Effect.tap((result) =>
      Console.log(`Winner was API-${result.apiId} (${result.delay}ms)`)
    )
  )

/**
 * Race with timeout - fail if operation takes too long
 */
export const raceWithTimeout = <A, E>(
  effect: Fx<A, E>,
  timeoutMs: number
): Fx<A, E | Error> =>
  pipe(
    Effect.race(
      effect,
      pipe(
        Effect.sleep(Duration.millis(timeoutMs)),
        Effect.flatMap(() =>
          Effect.fail(new Error(`Operation timed out after ${timeoutMs}ms`))
        )
      )
    )
  )

// ============================================================================
// 2. Parallel Processing with Effect.all
// ============================================================================

/**
 * Runs multiple effects in parallel and collects all results
 */
export const parallelFetchAll = (ids: number[]) =>
  pipe(
    Effect.all(
      ids.map((id) =>
        simulateApiCall(`Fetch-${id}`, 100 * id, { id, data: `Data-${id}` })
      ),
      { concurrency: "unbounded" } // Run all in parallel
    ),
    Effect.tap((results) =>
      Console.log(`Fetched ${results.length} items in parallel`)
    )
  )

/**
 * Sequential processing - runs one at a time
 */
export const sequentialFetchAll = (ids: number[]) =>
  pipe(
    Effect.all(
      ids.map((id) =>
        simulateApiCall(`Fetch-${id}`, 100, { id, data: `Data-${id}` })
      ),
      { concurrency: 1 } // Run sequentially
    ),
    Effect.tap((results) =>
      Console.log(`Fetched ${results.length} items sequentially`)
    )
  )

/**
 * Batched processing with concurrency limit
 */
export const batchedFetchAll = (ids: number[], concurrencyLimit: number) =>
  pipe(
    Effect.all(
      ids.map((id) =>
        simulateApiCall(`Fetch-${id}`, 100, { id, data: `Data-${id}` })
      ),
      { concurrency: concurrencyLimit } // Limit concurrent operations
    ),
    Effect.tap((results) =>
      Console.log(
        `Fetched ${results.length} items with concurrency limit ${concurrencyLimit}`
      )
    )
  )

// ============================================================================
// 3. Effect.forEach for Concurrent Iteration
// ============================================================================

/**
 * Process items concurrently with Effect.forEach
 */
export const processConcurrently = (items: string[]) =>
  pipe(
    Effect.forEach(
      items,
      (item) =>
        pipe(
          simulateApiCall(`Process-${item}`, 100, item.toUpperCase()),
          Effect.tap((result) => Console.log(`Processed: ${result}`))
        ),
      { concurrency: "unbounded" }
    )
  )

/**
 * Process items with controlled concurrency
 */
export const processWithLimit = (items: string[], limit: number) =>
  pipe(
    Effect.forEach(
      items,
      (item, index) =>
        pipe(
          Effect.sleep(Duration.millis(50)),
          Effect.tap(() =>
            Console.log(
              `[${new Date().toISOString().slice(14, 23)}] Processing item ${index + 1}: ${item}`
            )
          ),
          Effect.map(() => ({ item, processed: true }))
        ),
      { concurrency: limit }
    )
  )

/**
 * Discard results when you only care about side effects
 */
export const processAndDiscard = (items: string[]) =>
  pipe(
    Effect.forEach(
      items,
      (item) =>
        pipe(
          simulateApiCall(`Send-${item}`, 50, undefined),
          Effect.tap(() => Console.log(`Sent notification for: ${item}`))
        ),
      { concurrency: "unbounded", discard: true }
    )
  )

// ============================================================================
// 4. Error Handling in Concurrent Operations
// ============================================================================

/**
 * When one effect fails, all others are interrupted
 */
export const failFastConcurrent = pipe(
  Effect.all([
    simulateApiCall("API-1", 100, "success-1"),
    simulateFailingApiCall("API-2", 50, "API-2 failed"),
    simulateApiCall("API-3", 200, "success-3"),
  ]),
  Effect.catchAll((error) =>
    pipe(
      Console.log(`Fast fail detected: ${error.message}`),
      Effect.map(() => ({ error: error.message }))
    )
  )
)

/**
 * Validate all effects but collect both successes and failures
 */
export const validateAllConcurrent = <A, E>(effects: Fx<A, E>[]) =>
  Effect.all(effects, { concurrency: "unbounded", mode: "validate" })

// ============================================================================
// 5. Interruption Handling
// ============================================================================

/**
 * An interruptible long-running task
 */
export const interruptibleTask = (taskId: string, durationMs: number) =>
  pipe(
    Effect.sleep(Duration.millis(durationMs)),
    Effect.tap(() => Console.log(`Task ${taskId} completed`)),
    Effect.onInterrupt(() =>
      Console.log(`Task ${taskId} was interrupted before completion`)
    ),
    Effect.map(() => ({ taskId, completed: true }))
  )

/**
 * Demonstrates manual interruption of a fiber
 */
export const manualInterruptionExample = pipe(
  Effect.gen(function* (_) {
    // Fork a long-running task
    const fiber = yield* _(Effect.fork(interruptibleTask("Long-Task", 5000)))

    // Wait a bit
    yield* _(Effect.sleep(Duration.millis(100)))
    yield* _(Console.log("Interrupting the long-running task..."))

    // Interrupt it
    yield* _(Fiber.interrupt(fiber))

    return { interrupted: true }
  })
)

/**
 * Uninterruptible region - guarantees completion
 */
export const uninterruptibleExample = (taskId: string) =>
  pipe(
    Effect.uninterruptible(
      pipe(
        Effect.sleep(Duration.millis(100)),
        Effect.tap(() =>
          Console.log(`${taskId}: This will complete even if interrupted`)
        ),
        Effect.map(() => ({ taskId, guaranteed: true }))
      )
    )
  )

// ============================================================================
// 6. Fiber Management
// ============================================================================

/**
 * Fork multiple fibers and join them later
 */
export const forkJoinExample = pipe(
  Effect.gen(function* (_) {
    yield* _(Console.log("Forking multiple background tasks..."))

    // Fork multiple fibers
    const fiber1 = yield* _(
      Effect.fork(simulateApiCall("Background-1", 200, "result-1"))
    )
    const fiber2 = yield* _(
      Effect.fork(simulateApiCall("Background-2", 100, "result-2"))
    )
    const fiber3 = yield* _(
      Effect.fork(simulateApiCall("Background-3", 150, "result-3"))
    )

    // Do some other work
    yield* _(Console.log("Doing other work while tasks run in background..."))
    yield* _(Effect.sleep(Duration.millis(50)))

    // Join all fibers (wait for completion)
    const result1 = yield* _(Fiber.join(fiber1))
    const result2 = yield* _(Fiber.join(fiber2))
    const result3 = yield* _(Fiber.join(fiber3))

    return [result1, result2, result3]
  })
)

/**
 * Fork and await multiple fibers in parallel
 */
export const forkAwaitAllExample = pipe(
  Effect.gen(function* (_) {
    // Fork multiple background tasks
    const fibers = yield* _(
      Effect.all([
        Effect.fork(simulateApiCall("Task-A", 100, "A")),
        Effect.fork(simulateApiCall("Task-B", 150, "B")),
        Effect.fork(simulateApiCall("Task-C", 80, "C")),
      ])
    )

    // Await all fibers
    const results = yield* _(
      Effect.all(fibers.map((fiber) => Fiber.join(fiber)))
    )

    return results
  })
)

/**
 * Scoped fiber that cleans up automatically
 */
export const scopedFiberExample = Effect.scoped(
  pipe(
    Effect.gen(function* (_) {
      // Fork a fiber in a scope
      const fiber = yield* _(
        Effect.forkScoped(interruptibleTask("Scoped-Task", 1000))
      )

      yield* _(Console.log("Fiber forked in scope"))

      // If we exit this scope (even via error), the fiber is interrupted
      yield* _(Effect.sleep(Duration.millis(50)))

      return { fiberStarted: true }
    })
    // Fiber is automatically interrupted when scope closes
  )
)

// ============================================================================
// 7. Advanced Patterns
// ============================================================================

/**
 * Parallel processing with early exit on first success
 */
export const raceSuccesses = <A, E>(effects: Fx<A, E>[]) =>
  pipe(
    Effect.raceAll(effects),
    Effect.tap(() => Console.log("First success found, others interrupted"))
  )

/**
 * Run effects until first failure
 */
export const raceFailing = <A>(tasks: Fx<A, Error>[]) =>
  pipe(
    Effect.all(tasks, { concurrency: "unbounded" }),
    Effect.tap(() => Console.log("All tasks succeeded")),
    Effect.catchAll((error) =>
      pipe(
        Console.log(`A task failed: ${error.message}`),
        Effect.flatMap(() => Effect.fail(error))
      )
    )
  )

/**
 * Timeout with fallback value
 */
export const withTimeoutFallback = <A>(
  effect: Fx<A>,
  timeoutMs: number,
  fallback: A
): Fx<A> =>
  pipe(
    effect,
    Effect.race(
      pipe(
        Effect.sleep(Duration.millis(timeoutMs)),
        Effect.map(() => fallback),
        Effect.tap(() =>
          Console.log(`Timeout after ${timeoutMs}ms, using fallback`)
        )
      )
    )
  )

/**
 * Retry with exponential backoff using Effect.retry
 */
export const retryWithBackoff = <A, E>(
  effect: Fx<A, E>,
  maxAttempts: number
) =>
  pipe(
    effect,
    Effect.retry({
      times: maxAttempts - 1,
      schedule: pipe(
        // Exponential backoff: 100ms, 200ms, 400ms, etc.
        Effect.scheduleExponential(Duration.millis(100)),
        Effect.scheduleIntersect(Effect.scheduleRecurs(maxAttempts - 1))
      ),
    }),
    Effect.tap(() => Console.log("Operation succeeded after retries"))
  )

/**
 * Concurrent deduplication - multiple callers share the same result
 * Returns a memoized version of the effect that caches the result
 */
export const memoizedConcurrent = <A>(effect: Fx<A>) =>
  Effect.cached(effect)
