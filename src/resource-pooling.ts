import { Effect, Console, Duration, pipe, Pool, Scope } from "effect"

// Type aliases
type Fx<A, E = never> = Effect.Effect<A, E>

// ============================================================================
// 1. Resource Pool Basics
// ============================================================================

/**
 * Represents a generic database connection
 */
export interface DbConnection {
  id: string
  isOpen: boolean
  query: <T>(sql: string) => Fx<T>
  close: () => Fx<void>
}

/**
 * Represents an HTTP client
 */
export interface HttpClient {
  id: string
  isActive: boolean
  request: <T>(url: string) => Fx<T>
  dispose: () => Fx<void>
}

/**
 * Creates a simulated database connection with a unique ID
 */
export const createDbConnection = (id: string): Fx<DbConnection> =>
  pipe(
    Effect.sleep(Duration.millis(50)), // Simulate connection setup time
    Effect.tap(() => Console.log(`📦 Creating DB connection: ${id}`)),
    Effect.map(() => ({
      id,
      isOpen: true,
      query: <T>(sql: string) =>
        pipe(
          Effect.sleep(Duration.millis(10)),
          Effect.tap(() => Console.log(`  🔍 Query on ${id}: ${sql}`)),
          Effect.map(() => ({ result: `Result for: ${sql}` } as T))
        ),
      close: () =>
        pipe(
          Effect.sync(() => {
            console.log(`🔒 Closing DB connection: ${id}`)
          })
        ),
    }))
  )

/**
 * Creates a simulated HTTP client with a unique ID
 */
export const createHttpClient = (id: string): Fx<HttpClient> =>
  pipe(
    Effect.sleep(Duration.millis(30)), // Simulate client setup time
    Effect.tap(() => Console.log(`🌐 Creating HTTP client: ${id}`)),
    Effect.map(() => ({
      id,
      isActive: true,
      request: <T>(url: string) =>
        pipe(
          Effect.sleep(Duration.millis(20)),
          Effect.tap(() => Console.log(`  📡 Request on ${id}: ${url}`)),
          Effect.map(() => ({ status: 200, data: `Data from ${url}` } as T))
        ),
      dispose: () =>
        pipe(
          Effect.sync(() => {
            console.log(`♻️  Disposing HTTP client: ${id}`)
          })
        ),
    }))
  )

// ============================================================================
// 2. Database Connection Pool
// ============================================================================

/**
 * Creates a pool of database connections with configurable size
 *
 * Best practices:
 * - Set min size based on baseline load
 * - Set max size to prevent resource exhaustion
 * - Use timeToLive to recycle connections periodically
 * - Monitor pool metrics in production
 *
 * @param minSize - Minimum number of connections to maintain
 * @param maxSize - Maximum number of connections allowed
 */
export const makeDbConnectionPool = (minSize: number = 2, maxSize: number = 10) => {
  let connectionCounter = 0
  return Pool.make({
    acquire: Effect.acquireRelease(
      createDbConnection(`conn-${++connectionCounter}`),
      (conn) => conn.close()
    ),
    size: maxSize,
  })
}

/**
 * Example: Query the database using a pooled connection
 *
 * The pool automatically:
 * - Provides an available connection
 * - Creates new connections if needed (up to maxSize)
 * - Returns the connection to the pool when done
 * - Handles connection failures gracefully
 */
export const queryWithPool = <T>(
  pool: Pool.Pool<DbConnection, never>,
  sql: string
) =>
  pipe(
    Pool.get(pool),
    Effect.flatMap((conn) => conn.query<T>(sql)),
    Effect.tap(() => Console.log(`✅ Query completed, connection returned to pool`))
  )

/**
 * Example: Execute multiple queries concurrently using the connection pool
 *
 * This demonstrates the pool's ability to:
 * - Reuse connections efficiently
 * - Limit concurrent connections to maxSize
 * - Queue requests when pool is exhausted
 */
export const executeMultipleQueries = (
  pool: Pool.Pool<DbConnection, never>,
  queries: string[]
) =>
  pipe(
    Effect.all(
      queries.map((sql) => queryWithPool(pool, sql)),
      { concurrency: "unbounded" } // Pool handles limiting
    ),
    Effect.tap((results) =>
      Console.log(`✅ Completed ${results.length} queries using connection pool`)
    )
  )

/**
 * Example: Transaction-like pattern using a single pooled connection
 *
 * Sometimes you need the same connection for multiple operations.
 * This pattern ensures all operations use the same connection.
 */
export const executeTransaction = (
  pool: Pool.Pool<DbConnection, never>,
  operations: ((conn: DbConnection) => Fx<any>)[]
) =>
  pipe(
    Pool.get(pool),
    Effect.flatMap((conn) =>
      pipe(
        Effect.all(operations.map((op) => op(conn)), {
          concurrency: 1, // Sequential within transaction
        }),
        Effect.tap(() => Console.log(`✅ Transaction completed on ${conn.id}`))
      )
    )
  )

// ============================================================================
// 3. HTTP Client Pool
// ============================================================================

/**
 * Creates a pool of HTTP clients for making external requests
 *
 * Use cases:
 * - Making requests to third-party APIs
 * - Connection pooling for HTTP/2 multiplexing
 * - Reusing TCP connections
 * - Rate limiting through pool size
 *
 * @param minSize - Minimum number of clients to maintain
 * @param maxSize - Maximum number of concurrent clients
 */
export const makeHttpClientPool = (minSize: number = 3, maxSize: number = 15) => {
  let clientCounter = 0
  return Pool.make({
    acquire: Effect.acquireRelease(
      createHttpClient(`client-${++clientCounter}`),
      (client) => client.dispose()
    ),
    size: maxSize,
  })
}

/**
 * Example: Make an HTTP request using a pooled client
 */
export const requestWithPool = <T>(
  pool: Pool.Pool<HttpClient, never>,
  url: string
) =>
  pipe(
    Pool.get(pool),
    Effect.flatMap((client) => client.request<T>(url)),
    Effect.tap(() => Console.log(`✅ Request completed, client returned to pool`))
  )

/**
 * Example: Make multiple concurrent HTTP requests using the pool
 *
 * The pool ensures:
 * - Efficient client reuse
 * - Limited concurrent connections (respects pool size)
 * - Automatic backpressure when pool is exhausted
 */
export const fetchMultipleUrls = <T>(
  pool: Pool.Pool<HttpClient, never>,
  urls: string[]
) =>
  pipe(
    Effect.all(
      urls.map((url) => requestWithPool<T>(pool, url)),
      { concurrency: "unbounded" }
    ),
    Effect.tap((results) =>
      Console.log(`✅ Fetched ${results.length} URLs using client pool`)
    )
  )

// ============================================================================
// 4. Pool Configuration Patterns
// ============================================================================

/**
 * Conservative pool configuration
 * Use for: Database connections, expensive resources
 */
export const conservativePoolConfig = {
  minSize: 2,
  maxSize: 10,
  timeToLive: Duration.minutes(5), // Recycle old connections
}

/**
 * Aggressive pool configuration
 * Use for: HTTP clients, lightweight resources
 */
export const aggressivePoolConfig = {
  minSize: 5,
  maxSize: 50,
  timeToLive: Duration.minutes(1),
}

/**
 * Creates a database pool with timeout and retry
 *
 * Best practice: Always add timeout to pool operations to prevent
 * indefinite waiting when pool is exhausted
 */
export const makeResilientDbPool = (maxSize: number = 10) =>
  pipe(
    makeDbConnectionPool(2, maxSize),
    Effect.tap(() => Console.log(`🎯 Created resilient DB pool (max: ${maxSize})`))
  )

/**
 * Example: Query with timeout to prevent indefinite waiting
 */
export const queryWithTimeout = <T>(
  pool: Pool.Pool<DbConnection, never>,
  sql: string,
  timeoutMs: number = 5000
) =>
  pipe(
    queryWithPool<T>(pool, sql),
    Effect.timeout(Duration.millis(timeoutMs)),
    Effect.catchTag("TimeoutException", () =>
      Effect.fail(new Error(`Query timed out after ${timeoutMs}ms`))
    )
  )

// ============================================================================
// 5. Pool Metrics and Monitoring
// ============================================================================

/**
 * Example: Monitor pool usage with metrics
 *
 * In production, you should track:
 * - Active connections
 * - Pool exhaustion events
 * - Average wait time
 * - Connection errors
 */
export const queryWithMetrics = <T>(
  pool: Pool.Pool<DbConnection, never>,
  sql: string,
  metrics: { queries: number; poolWaits: number }
) =>
  pipe(
    Effect.sync(() => {
      metrics.queries++
    }),
    Effect.flatMap(() => queryWithPool<T>(pool, sql)),
    Effect.tap(() =>
      Console.log(`📊 Metrics - Total queries: ${metrics.queries}`)
    )
  )

/**
 * Example: Create a pool with resource lifecycle logging
 *
 * Useful for debugging and monitoring resource usage
 */
export const makeMonitoredDbPool = (maxSize: number = 10) => {
  let monitoredCounter = 0
  return Pool.make({
    acquire: Effect.acquireRelease(
      pipe(
        createDbConnection(`monitored-${++monitoredCounter}`),
        Effect.tap((conn) =>
          Console.log(`📈 Acquired connection: ${conn.id} (pool size: max ${maxSize})`)
        )
      ),
      (conn) => conn.close()
    ),
    size: maxSize,
  })
}

// ============================================================================
// 6. Advanced Patterns
// ============================================================================

/**
 * Example: Scoped resource usage with automatic cleanup
 *
 * This pattern ensures resources are properly released even if errors occur
 */
export const withScopedConnection = <A, E>(
  pool: Pool.Pool<DbConnection, never>,
  use: (conn: DbConnection) => Fx<A, E>
) =>
  pipe(
    Pool.get(pool),
    Effect.flatMap((conn) =>
      pipe(
        use(conn),
        Effect.tap(() => Console.log(`🔄 Connection ${conn.id} will be returned to pool`))
      )
    )
  )

/**
 * Example: Fallback pattern when pool is exhausted
 *
 * Useful for degraded mode operation
 */
export const queryWithFallback = <T>(
  pool: Pool.Pool<DbConnection, never>,
  sql: string,
  fallback: T
) =>
  pipe(
    queryWithTimeout<T>(pool, sql, 1000),
    Effect.catchAll((error) =>
      pipe(
        Console.log(`⚠️  Pool exhausted or timeout, using fallback: ${error}`),
        Effect.map(() => fallback)
      )
    )
  )

/**
 * Example: Warmup pool by creating initial connections
 *
 * Best practice: Pre-warm pools during application startup
 * to avoid cold-start latency on first requests
 */
export const warmupPool = (pool: Pool.Pool<DbConnection, never>, count: number = 3) =>
  pipe(
    Effect.all(
      Array.from({ length: count }, () =>
        pipe(
          Pool.get(pool),
          Effect.tap((conn) =>
            Console.log(`🔥 Warmed up connection: ${conn.id}`)
          )
        )
      ),
      { concurrency: "unbounded" }
    ),
    Effect.tap(() => Console.log(`✅ Pool warmed up with ${count} connections`))
  )
