import { Effect, Metric, pipe, Duration } from "effect"

// ============================================================================
// 1. Basic Metrics
// ============================================================================

/**
 * Counter - tracks cumulative values that only increase
 */
export const requestCounter = Metric.counter("http_requests_total", {
  description: "Total number of HTTP requests",
})

export const errorCounter = Metric.counter("errors_total", {
  description: "Total number of errors",
})

/**
 * Gauge - tracks values that can go up and down
 */
export const activeConnectionsGauge = Metric.gauge("active_connections", {
  description: "Number of active connections",
})

export const memoryUsageGauge = Metric.gauge("memory_usage_bytes", {
  description: "Current memory usage in bytes",
})

/**
 * Histogram - tracks distribution of values
 */
export const requestDurationHistogram = Metric.histogram(
  "http_request_duration_seconds",
  {
    description: "HTTP request duration in seconds",
  }
)

export const responseSizeHistogram = Metric.histogram("response_size_bytes", {
  description: "HTTP response size in bytes",
})

/**
 * Frequency - tracks count of specific values
 */
export const statusCodeFrequency = Metric.frequency("http_status_codes", {
  description: "Frequency of HTTP status codes",
})

// ============================================================================
// 2. Tagged Metrics (Labels)
// ============================================================================

/**
 * Counter with labels for different HTTP methods and status codes
 */
export const labeledRequestCounter = (method: string, status: number) =>
  pipe(
    requestCounter,
    Metric.tagged("method", method),
    Metric.tagged("status", status.toString())
  )

/**
 * Gauge with labels for different services
 */
export const serviceHealthGauge = (serviceName: string) =>
  pipe(
    Metric.gauge("service_health", {
      description: "Service health status (1 = healthy, 0 = unhealthy)",
    }),
    Metric.tagged("service", serviceName)
  )

/**
 * Histogram with labels for different endpoints
 */
export const endpointDurationHistogram = (endpoint: string) =>
  pipe(
    requestDurationHistogram,
    Metric.tagged("endpoint", endpoint)
  )

// ============================================================================
// 3. Metric Tracking Utilities
// ============================================================================

/**
 * Track operation duration automatically
 */
export const withDurationTracking = <A, E, R>(
  metric: Metric.Metric.Histogram<number>,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    const startTime = Date.now()
    const result = yield* effect
    const duration = (Date.now() - startTime) / 1000 // Convert to seconds
    yield* Metric.update(metric, duration)
    return result
  })

/**
 * Track success and error counts
 */
export const withCountTracking = <A, E, R>(
  successMetric: Metric.Metric.Counter<number>,
  errorMetric: Metric.Metric.Counter<number>,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> =>
  pipe(
    effect,
    Effect.tap(() => Metric.increment(successMetric)),
    Effect.tapError(() => Metric.increment(errorMetric))
  )

/**
 * Track gauge value during operation
 */
export const withGaugeTracking = <A, E, R>(
  metric: Metric.Metric.Gauge<number>,
  incrementBy: number,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    // Increment gauge at start
    yield* Metric.update(metric, incrementBy)

    const result = yield* Effect.exit(effect)

    // Decrement gauge after operation (success or failure)
    yield* Metric.update(metric, -incrementBy)

    if (result._tag === "Success") {
      return result.value
    } else {
      return yield* Effect.failCause(result.cause)
    }
  })

// ============================================================================
// 4. Practical Examples
// ============================================================================

/**
 * Example: Track HTTP request metrics
 */
export const handleHttpRequest = (
  method: string,
  endpoint: string,
  handler: Effect.Effect<string, Error>
) =>
  pipe(
    handler,
    withDurationTracking(endpointDurationHistogram(endpoint)),
    Effect.tap(() =>
      Metric.increment(labeledRequestCounter(method, 200))
    ),
    Effect.tapError(() =>
      Metric.increment(labeledRequestCounter(method, 500))
    )
  )

/**
 * Example: Track database connection pool
 */
export const dbActiveConnections = Metric.gauge("db_active_connections", {
  description: "Number of active database connections",
})

export const dbQueryDuration = Metric.histogram("db_query_duration_ms", {
  description: "Database query duration in milliseconds",
})

export const executeQuery = <A>(
  query: string,
  handler: Effect.Effect<A, Error>
) =>
  pipe(
    handler,
    withGaugeTracking(dbActiveConnections, 1),
    withDurationTracking(
      pipe(dbQueryDuration, Metric.tagged("query_type", query.split(" ")[0]))
    )
  )

/**
 * Example: Track cache metrics
 */
export const cacheHits = Metric.counter("cache_hits_total", {
  description: "Total number of cache hits",
})

export const cacheMisses = Metric.counter("cache_misses_total", {
  description: "Total number of cache misses",
})

export const cacheSize = Metric.gauge("cache_size_bytes", {
  description: "Current cache size in bytes",
})

export const trackCacheLookup = <A>(
  key: string,
  effect: Effect.Effect<A | null, Error>
) =>
  pipe(
    effect,
    Effect.tap((result) =>
      result !== null
        ? Metric.increment(cacheHits)
        : Metric.increment(cacheMisses)
    )
  )

/**
 * Example: Track queue metrics
 */
export const queueSize = Metric.gauge("queue_size", {
  description: "Number of items in queue",
})

export const queueProcessingTime = Metric.histogram("queue_processing_time_ms", {
  description: "Time to process queue item in milliseconds",
})

export const enqueueItem = <A>(
  item: A,
  handler: Effect.Effect<void, Error>
) =>
  pipe(
    Metric.increment(queueSize),
    Effect.flatMap(() => handler)
  )

export const dequeueAndProcess = <A>(
  handler: Effect.Effect<A, Error>
) =>
  pipe(
    handler,
    withDurationTracking(queueProcessingTime),
    Effect.tap(() => Metric.update(queueSize, -1))
  )

// ============================================================================
// 5. Business Metrics
// ============================================================================

/**
 * Example: E-commerce metrics
 */
export const orderTotal = Metric.counter("orders_total", {
  description: "Total number of orders",
})

export const orderValue = Metric.histogram("order_value_dollars", {
  description: "Order value in dollars",
})

export const activeUsers = Metric.gauge("active_users", {
  description: "Number of active users",
})

export const recordOrder = (amount: number, userId: string) =>
  pipe(
    Metric.increment(orderTotal),
    Effect.flatMap(() => Metric.update(orderValue, amount)),
    Effect.flatMap(() =>
      Metric.update(
        pipe(orderTotal, Metric.tagged("user_id", userId)),
        1
      )
    )
  )

/**
 * Example: API rate limiting metrics
 */
export const rateLimitExceeded = Metric.counter("rate_limit_exceeded_total", {
  description: "Total number of rate limit violations",
})

export const requestsPerSecond = Metric.gauge("requests_per_second", {
  description: "Current requests per second",
})

export const trackRateLimit = (clientId: string, allowed: boolean) =>
  allowed
    ? Metric.update(requestsPerSecond, 1)
    : pipe(
        Metric.increment(rateLimitExceeded),
        Effect.flatMap(() =>
          Metric.increment(
            pipe(rateLimitExceeded, Metric.tagged("client_id", clientId))
          )
        )
      )

// ============================================================================
// 6. System Metrics
// ============================================================================

/**
 * Example: CPU and memory monitoring
 */
export const cpuUsagePercent = Metric.gauge("cpu_usage_percent", {
  description: "CPU usage percentage",
})

export const heapMemoryUsed = Metric.gauge("heap_memory_used_bytes", {
  description: "Heap memory used in bytes",
})

export const garbageCollectionDuration = Metric.histogram("gc_duration_ms", {
  description: "Garbage collection duration in milliseconds",
})

export const recordSystemMetrics = () =>
  Effect.gen(function* () {
    // Simulate reading system metrics
    const memUsage = process.memoryUsage()
    yield* Metric.set(heapMemoryUsed, memUsage.heapUsed)
    yield* Metric.set(
      memoryUsageGauge,
      memUsage.rss
    )
  })

// ============================================================================
// 7. Custom Metric Aggregations
// ============================================================================

/**
 * Example: Success rate metric
 */
export const successRate = (
  successCount: number,
  totalCount: number
): number => {
  if (totalCount === 0) return 0
  return (successCount / totalCount) * 100
}

/**
 * Example: Throughput metric
 */
export const calculateThroughput = (
  itemsProcessed: number,
  durationSeconds: number
): number => {
  if (durationSeconds === 0) return 0
  return itemsProcessed / durationSeconds
}

// ============================================================================
// 8. Metric Snapshots and Reporting
// ============================================================================

/**
 * Get current metric value
 */
export const getMetricValue = <Out>(
  metric: Metric.Metric<any, number, Out>
): Effect.Effect<Out> => Metric.value(metric)

/**
 * Example: Collect all metrics for monitoring dashboard
 */
export interface MetricSnapshot {
  readonly httpRequests: number
  readonly errors: number
  readonly activeConnections: number
  readonly avgRequestDuration: number
}

export const collectMetrics = (): Effect.Effect<MetricSnapshot, never> =>
  Effect.gen(function* () {
    // In a real application, you would collect actual metric values
    // For this example, we'll return dummy data
    return {
      httpRequests: 1000,
      errors: 10,
      activeConnections: 50,
      avgRequestDuration: 0.25,
    }
  })

// ============================================================================
// 9. Advanced Patterns
// ============================================================================

/**
 * Composite metrics - track multiple related metrics together
 */
export const trackApiCall = <A, E>(
  endpoint: string,
  method: string,
  effect: Effect.Effect<A, E>
) =>
  pipe(
    effect,
    Effect.timed,
    Effect.tap(([result, duration]) =>
      pipe(
        Metric.increment(labeledRequestCounter(method, 200)),
        Effect.flatMap(() =>
          Metric.update(
            endpointDurationHistogram(endpoint),
            Number(duration) / 1_000_000_000
          )
        ),
        Effect.flatMap(() => Metric.increment(activeConnectionsGauge))
      )
    ),
    Effect.tapError((error) =>
      pipe(
        Metric.increment(labeledRequestCounter(method, 500)),
        Effect.flatMap(() => Metric.increment(errorCounter))
      )
    ),
    Effect.map(([result]) => result)
  )

/**
 * Batch metric updates for efficiency
 */
export const batchMetricUpdates = <A, E>(
  updates: ReadonlyArray<Effect.Effect<A, E>>
): Effect.Effect<ReadonlyArray<A>, E> =>
  Effect.all(updates, { concurrency: "unbounded" })

/**
 * Conditional metrics - only track if condition is met
 */
export const conditionalMetric = <A, E>(
  condition: boolean,
  metric: Metric.Metric.Counter<number>,
  effect: Effect.Effect<A, E>
): Effect.Effect<A, E> =>
  condition
    ? pipe(effect, Effect.tap(() => Metric.increment(metric)))
    : effect

/**
 * Metric polling - periodically collect metric values
 */
export const pollMetric = <Out>(
  metric: Metric.Metric<any, number, Out>,
  intervalMs: number
): Effect.Effect<never, never> =>
  pipe(
    Metric.value(metric),
    Effect.flatMap((value) =>
      Effect.log(`Metric value: ${JSON.stringify(value)}`)
    ),
    Effect.repeat({ schedule: { _tag: "Delay", duration: intervalMs } }),
    Effect.forever
  )

// ============================================================================
// 10. Real-World Example: Complete Request Handler
// ============================================================================

/**
 * Complete example combining multiple metrics
 */
export const handleCompleteRequest = (
  method: string,
  endpoint: string,
  userId: string
) =>
  Effect.gen(function* () {
    // Increment active connections
    yield* Metric.increment(activeConnectionsGauge)

    const startTime = Date.now()

    try {
      // Simulate request processing
      yield* Effect.sleep("50 millis")

      const responseSize = 1024 // bytes
      const duration = (Date.now() - startTime) / 1000 // seconds

      // Record success metrics
      yield* Metric.increment(labeledRequestCounter(method, 200))
      yield* Metric.update(endpointDurationHistogram(endpoint), duration)
      yield* Metric.update(responseSizeHistogram, responseSize)

      // Track user activity
      yield* Metric.update(
        pipe(activeUsers, Metric.tagged("user_id", userId)),
        1
      )

      return { status: 200, size: responseSize, duration }
    } catch (error) {
      // Record error metrics
      yield* Metric.increment(labeledRequestCounter(method, 500))
      yield* Metric.increment(errorCounter)

      throw error
    } finally {
      // Decrement active connections
      yield* Metric.update(activeConnectionsGauge, -1)
    }
  })
