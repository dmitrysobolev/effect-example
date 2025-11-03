import { Effect, pipe, Duration, Option } from "effect"

// ============================================================================
// 1. Retry with Custom Logic
// ============================================================================

/**
 * Retry with exponential backoff and max attempts
 */
export const retryWithBackoff = <A, E>(
  maxAttempts: number,
  initialDelay: number = 100
) => (effect: Effect.Effect<A, E>): Effect.Effect<A, E> => {
  const retry = (attempt: number): Effect.Effect<A, E> =>
    pipe(
      effect,
      Effect.catchAll((error) => {
        if (attempt >= maxAttempts) {
          return Effect.fail(error)
        }
        const delay = initialDelay * Math.pow(2, attempt)
        return pipe(
          Effect.sleep(Duration.millis(delay)),
          Effect.flatMap(() => retry(attempt + 1))
        )
      })
    )

  return retry(0)
}

/**
 * Retry only on specific errors
 */
export const retryOnError = <A, E>(
  predicate: (error: E) => boolean,
  maxAttempts: number
) => (effect: Effect.Effect<A, E>): Effect.Effect<A, E> => {
  const retry = (attempt: number): Effect.Effect<A, E> =>
    pipe(
      effect,
      Effect.catchAll((error) => {
        if (!predicate(error) || attempt >= maxAttempts) {
          return Effect.fail(error)
        }
        return retry(attempt + 1)
      })
    )

  return retry(0)
}

// ============================================================================
// 2. Timeout Operators
// ============================================================================

/**
 * Timeout with custom fallback value
 */
export const timeoutWith = <A, E>(
  duration: Duration.DurationInput,
  fallback: A
) => (effect: Effect.Effect<A, E>): Effect.Effect<A, E> =>
  pipe(
    effect,
    Effect.race(pipe(
      Effect.sleep(duration),
      Effect.map(() => fallback)
    ))
  )

/**
 * Timeout with custom error
 */
export const timeoutOrFail = <A, E, E2>(
  duration: Duration.DurationInput,
  onTimeout: () => E2
) => (effect: Effect.Effect<A, E>): Effect.Effect<A, E | E2> =>
  pipe(
    effect,
    Effect.timeout(duration),
    Effect.flatMap((option) =>
      Option.match(option, {
        onNone: () => Effect.fail(onTimeout()),
        onSome: (value) => Effect.succeed(value)
      })
    )
  )

// ============================================================================
// 3. Tap Operators
// ============================================================================

/**
 * Tap with condition
 */
export const tapWhen = <A, E>(
  predicate: (a: A) => boolean,
  f: (a: A) => Effect.Effect<void, E>
) => (effect: Effect.Effect<A, E>): Effect.Effect<A, E> =>
  pipe(
    effect,
    Effect.tap((a) => (predicate(a) ? f(a) : Effect.void))
  )

/**
 * Tap on error with specific error type
 */
export const tapErrorWhen = <A, E>(
  predicate: (e: E) => boolean,
  f: (e: E) => Effect.Effect<void, never>
) => (effect: Effect.Effect<A, E>): Effect.Effect<A, E> =>
  pipe(
    effect,
    Effect.tapError((e) => (predicate(e) ? f(e) : Effect.void))
  )

// ============================================================================
// 4. Filtering Operators
// ============================================================================

/**
 * Filter effect result, failing if predicate is false
 */
export const filterOrFail = <A, E, E2>(
  predicate: (a: A) => boolean,
  onFalse: () => E2
) => (effect: Effect.Effect<A, E>): Effect.Effect<A, E | E2> =>
  pipe(
    effect,
    Effect.flatMap((a) =>
      predicate(a) ? Effect.succeed(a) : Effect.fail(onFalse())
    )
  )

/**
 * Filter and transform
 */
export const filterMap = <A, B, E>(
  f: (a: A) => Option.Option<B>
) => (effect: Effect.Effect<A, E>): Effect.Effect<Option.Option<B>, E> =>
  pipe(effect, Effect.map(f))

// ============================================================================
// 5. Debounce and Throttle
// ============================================================================

/**
 * Debounce - only execute if no new calls within duration
 */
export const debounce = <A, E>(
  duration: Duration.DurationInput
) => (effect: Effect.Effect<A, E>): Effect.Effect<A, E> =>
  pipe(
    Effect.sleep(duration),
    Effect.flatMap(() => effect)
  )

/**
 * Rate limit - ensure minimum time between executions
 */
export const rateLimit = <A, E>(
  minInterval: Duration.DurationInput
) => (effect: Effect.Effect<A, E>): Effect.Effect<A, E> =>
  pipe(
    effect,
    Effect.flatMap((result) =>
      pipe(
        Effect.sleep(minInterval),
        Effect.map(() => result)
      )
    )
  )

// ============================================================================
// 6. Memoization
// ============================================================================

/**
 * Cache effect result for a duration
 */
export const cacheFor = <A, E>(
  duration: Duration.DurationInput
) => (effect: Effect.Effect<A, E>): Effect.Effect<A, E> => {
  let cache: { value: A; expiry: number } | null = null

  return Effect.suspend(() => {
    const now = Date.now()
    if (cache && cache.expiry > now) {
      return Effect.succeed(cache.value)
    }

    return pipe(
      effect,
      Effect.map((value) => {
        cache = {
          value,
          expiry: now + Duration.toMillis(Duration.decode(duration)),
        }
        return value
      })
    )
  })
}

// ============================================================================
// 7. Fallback Operators
// ============================================================================

/**
 * Fallback chain - try multiple alternatives
 */
export const fallbackChain = <A, E>(
  alternatives: ReadonlyArray<Effect.Effect<A, E>>
) => (effect: Effect.Effect<A, E>): Effect.Effect<A, E> => {
  const tryAlternatives = (index: number): Effect.Effect<A, E> => {
    if (index >= alternatives.length) {
      return effect
    }

    return pipe(
      effect,
      Effect.catchAll(() => alternatives[index]),
      Effect.catchAll(() => tryAlternatives(index + 1))
    )
  }

  return tryAlternatives(0)
}

/**
 * Fallback with default value
 */
export const withDefault = <A>(
  defaultValue: A
) => <E>(effect: Effect.Effect<A, E>): Effect.Effect<A, never> =>
  pipe(
    effect,
    Effect.catchAll(() => Effect.succeed(defaultValue))
  )

// ============================================================================
// 8. Conditional Execution
// ============================================================================

/**
 * Execute effect only if condition is true
 */
export const when = <A, E>(
  condition: boolean,
  fallback: A
) => (effect: Effect.Effect<A, E>): Effect.Effect<A, E> =>
  condition ? effect : Effect.succeed(fallback)

/**
 * Execute one of two effects based on condition
 */
export const ifThenElse = <A, E>(
  condition: boolean,
  onTrue: Effect.Effect<A, E>,
  onFalse: Effect.Effect<A, E>
): Effect.Effect<A, E> =>
  condition ? onTrue : onFalse

// ============================================================================
// 9. Logging Operators
// ============================================================================

/**
 * Log before and after effect execution
 */
export const withLogging = <A, E>(
  label: string
) => (effect: Effect.Effect<A, E>): Effect.Effect<A, E> =>
  pipe(
    Effect.log(`[${label}] Starting`),
    Effect.flatMap(() => effect),
    Effect.tap((result) => Effect.log(`[${label}] Success:`, result)),
    Effect.tapError((error) => Effect.log(`[${label}] Error:`, error))
  )

/**
 * Log execution time
 */
export const withTiming = <A, E>(
  label: string
) => (effect: Effect.Effect<A, E>): Effect.Effect<A, E> =>
  Effect.gen(function* () {
    const start = Date.now()
    const result = yield* effect
    const duration = Date.now() - start
    yield* Effect.log(`[${label}] took ${duration}ms`)
    return result
  })

// ============================================================================
// 10. Batching Operators
// ============================================================================

/**
 * Batch array processing with concurrency control
 */
export const batchProcess = <A, B, E>(
  batchSize: number,
  concurrency: number,
  f: (a: A) => Effect.Effect<B, E>
) => (items: ReadonlyArray<A>): Effect.Effect<ReadonlyArray<B>, E> => {
  const batches: A[][] = []
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize) as A[])
  }

  return pipe(
    Effect.all(
      batches.map((batch) =>
        Effect.all(batch.map(f), { concurrency })
      ),
      { concurrency: 1 } // Process batches sequentially
    ),
    Effect.map((results) => results.flat())
  )
}

/**
 * Collect results until predicate is true
 */
export const collectUntil = <A, E>(
  predicate: (accumulated: ReadonlyArray<A>) => boolean
) => (effects: ReadonlyArray<Effect.Effect<A, E>>): Effect.Effect<ReadonlyArray<A>, E> =>
  Effect.gen(function* () {
    const results: A[] = []

    for (const effect of effects) {
      if (predicate(results)) {
        break
      }
      const result = yield* effect
      results.push(result)
    }

    return results
  })

// ============================================================================
// 11. Practical Examples
// ============================================================================

/**
 * Example: HTTP request with retry and timeout
 */
export const fetchWithRetry = (url: string) =>
  pipe(
    Effect.succeed(`Fetching ${url}`),
    Effect.flatMap(() => Effect.sleep("100 millis")),
    Effect.map(() => ({ data: `Data from ${url}`, status: 200 })),
    timeoutOrFail("500 millis", () => new Error("Request timeout")),
    retryWithBackoff(3, 50)
  )

/**
 * Example: Cached API call
 */
export const cachedApiCall = (endpoint: string) =>
  pipe(
    Effect.succeed(`Calling ${endpoint}`),
    Effect.flatMap(() => Effect.sleep("200 millis")),
    Effect.map(() => ({ data: `Response from ${endpoint}` })),
    cacheFor(Duration.seconds(60))
  )

/**
 * Example: Process with fallback
 */
export const processWithFallback = (data: string) =>
  pipe(
    Effect.fail(new Error("Primary processor failed")),
    fallbackChain([
      Effect.succeed(`Fallback 1: ${data}`),
      Effect.succeed(`Fallback 2: ${data}`),
    ]),
    withDefault(`Default: ${data}`)
  )

/**
 * Example: Conditional processing
 */
export const conditionalProcess = (value: number, threshold: number) =>
  pipe(
    when(
      value > threshold,
      value
    )(Effect.succeed(value * 2)),
    Effect.map((result) => ({ value, result, processed: value > threshold }))
  )

/**
 * Example: Batch API requests
 */
export const batchApiRequests = (ids: ReadonlyArray<number>) =>
  pipe(
    ids,
    batchProcess(
      10, // batch size
      3,  // concurrency
      (id) =>
        pipe(
          Effect.sleep("50 millis"),
          Effect.map(() => ({ id, data: `Data for ${id}` }))
        )
    )
  )

/**
 * Example: Rate-limited operation
 */
export const rateLimitedOperation = (item: string) =>
  pipe(
    Effect.succeed(`Processing ${item}`),
    Effect.map(() => ({ item, processed: true })),
    rateLimit("100 millis")
  )
