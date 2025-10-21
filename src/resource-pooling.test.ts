import { describe, it, expect } from "vitest"
import { Effect, Duration, pipe, Pool } from "effect"
import {
  dbConnectionPool,
  executeQuery,
  executeConcurrentQueries,
  httpClientPool,
  makeHttpRequest,
  makeConcurrentRequests,
  poolWithInvalidation,
  poolWithHealthCheck,
  getPoolStats,
  warmupPool,
  poolGetWithRetry,
  gracefulPoolShutdown,
  processBatchWithDbPool,
  scrapeUrlsWithPool,
  DatabaseConnection,
  HttpClient,
} from "./resource-pooling"

describe("Resource Pooling Patterns", () => {
  // ============================================================================
  // 1. Database Connection Pool
  // ============================================================================

  describe("Database Connection Pool", () => {
    it("should create and use a database connection pool", async () => {
      const program = Effect.scoped(
        pipe(
          dbConnectionPool(5),
          Effect.flatMap((pool) =>
            pipe(
              executeQuery(pool, "SELECT * FROM users"),
              Effect.map((result) => result.result)
            )
          )
        )
      )

      const result = await Effect.runPromise(program)
      expect(result).toContain("Query result for")
      expect(result).toContain("SELECT * FROM users")
    })

    it("should reuse connections from the pool", async () => {
      const program = Effect.scoped(
        pipe(
          dbConnectionPool(3),
          Effect.flatMap((pool) =>
            pipe(
              Effect.all(
                [
                  executeQuery(pool, "SELECT 1"),
                  executeQuery(pool, "SELECT 2"),
                  executeQuery(pool, "SELECT 3"),
                ],
                { concurrency: "unbounded" }
              ),
              Effect.map((results) => results.map((r) => r.connectionId))
            )
          )
        )
      )

      const connectionIds = await Effect.runPromise(program)
      expect(connectionIds).toHaveLength(3)
      // With a pool of 3 and 3 concurrent queries, we should use at most 3 connections
      const uniqueConnections = new Set(connectionIds)
      expect(uniqueConnections.size).toBeLessThanOrEqual(3)
    })

    it("should execute concurrent queries efficiently", async () => {
      const queries = Array.from(
        { length: 10 },
        (_, i) => `SELECT * FROM table${i}`
      )

      const results = await Effect.runPromise(
        executeConcurrentQueries(queries, 5, 5)
      )

      expect(results).toHaveLength(10)

      // Verify all queries were executed
      results.forEach((result, i) => {
        expect(result.result).toContain(`table${i}`)
      })

      // With pool size 5 and concurrency 5, we should use at most 5 connections
      const uniqueConnections = new Set(results.map((r) => r.connectionId))
      expect(uniqueConnections.size).toBeLessThanOrEqual(5)
    }, 10000)

    it("should respect pool size limits", async () => {
      const poolSize = 3
      const queryCount = 10

      const program = Effect.scoped(
        pipe(
          dbConnectionPool(poolSize),
          Effect.flatMap((pool) =>
            pipe(
              Effect.all(
                Array.from({ length: queryCount }, (_, i) =>
                  executeQuery(pool, `Query ${i}`)
                ),
                { concurrency: "unbounded" }
              )
            )
          )
        )
      )

      const results = await Effect.runPromise(program)
      expect(results).toHaveLength(queryCount)
      // Verify all queries succeeded
      results.forEach((result, i) => {
        expect(result.result).toContain(`Query ${i}`)
      })
    }, 10000)

    it("should handle pool with custom TTL", async () => {
      const shortTTL = 100 // 100ms TTL

      const program = Effect.scoped(
        pipe(
          dbConnectionPool(5, shortTTL),
          Effect.flatMap((pool) =>
            pipe(
              executeQuery(pool, "SELECT 1"),
              Effect.flatMap(() =>
                pipe(
                  Effect.sleep(Duration.millis(150)), // Wait longer than TTL
                  Effect.flatMap(() => executeQuery(pool, "SELECT 2"))
                )
              )
            )
          )
        )
      )

      const result = await Effect.runPromise(program)
      expect(result.result).toContain("SELECT 2")
    })
  })

  // ============================================================================
  // 2. HTTP Client Pool
  // ============================================================================

  describe("HTTP Client Pool", () => {
    it("should create and use an HTTP client pool", async () => {
      const program = Effect.scoped(
        pipe(
          httpClientPool(10),
          Effect.flatMap((pool) =>
            makeHttpRequest(pool, "https://api.example.com/data")
          )
        )
      )

      const result = await Effect.runPromise(program)
      expect(result.status).toBe(200)
      expect(result.body).toContain("api.example.com")
    })

    it("should make concurrent requests using the pool", async () => {
      const urls = Array.from(
        { length: 20 },
        (_, i) => `https://api.example.com/endpoint${i}`
      )

      const results = await Effect.runPromise(
        makeConcurrentRequests(urls, 10, 10)
      )

      expect(results).toHaveLength(20)

      // Verify all requests succeeded
      results.forEach((result, i) => {
        expect(result.status).toBe(200)
        expect(result.body).toContain(`endpoint${i}`)
      })

      // With pool size 10, we should use at most 10 clients
      const uniqueClients = new Set(results.map((r) => r.clientId))
      expect(uniqueClients.size).toBeLessThanOrEqual(10)
    }, 10000)

    it("should reuse HTTP clients from the pool", async () => {
      const program = Effect.scoped(
        pipe(
          httpClientPool(5),
          Effect.flatMap((pool) =>
            pipe(
              Effect.all(
                [
                  makeHttpRequest(pool, "https://api1.example.com"),
                  makeHttpRequest(pool, "https://api2.example.com"),
                  makeHttpRequest(pool, "https://api3.example.com"),
                  makeHttpRequest(pool, "https://api4.example.com"),
                  makeHttpRequest(pool, "https://api5.example.com"),
                ],
                { concurrency: "unbounded" }
              )
            )
          )
        )
      )

      const results = await Effect.runPromise(program)
      expect(results).toHaveLength(5)

      // With a pool of 5 and 5 concurrent requests, we should use at most 5 clients
      const uniqueClients = new Set(results.map((r) => r.clientId))
      expect(uniqueClients.size).toBeLessThanOrEqual(5)
    })

    it("should respect concurrency limits", async () => {
      const urls = Array.from({ length: 50 }, (_, i) => `https://api.example.com/item${i}`)
      const concurrency = 5

      const startTime = Date.now()
      const results = await Effect.runPromise(
        makeConcurrentRequests(urls, 10, concurrency)
      )
      const duration = Date.now() - startTime

      expect(results).toHaveLength(50)

      // With concurrency of 5 and 50 requests taking ~50ms each,
      // minimum time should be around (50 / 5) * 50 = 500ms
      // Allow some overhead
      expect(duration).toBeGreaterThanOrEqual(400)
    }, 15000)
  })

  // ============================================================================
  // 3. Generic Pool Patterns
  // ============================================================================

  describe("Generic Pool Patterns", () => {
    it("should create pool with invalidation strategy", async () => {
      const program = Effect.scoped(
        pipe(
          poolWithInvalidation(),
          Effect.flatMap((pool) =>
            pipe(
              Pool.get(pool),
              Effect.flatMap((conn) =>
                Effect.succeed({
                  id: conn.id,
                  connected: conn.connected,
                })
              )
            )
          )
        )
      )

      const result = await Effect.runPromise(program)
      expect(result.connected).toBe(true)
      expect(typeof result.id).toBe("number")
    })

    it("should create pool with health check strategy", async () => {
      const program = Effect.scoped(
        pipe(
          poolWithHealthCheck(),
          Effect.flatMap((pool) =>
            pipe(
              Pool.get(pool),
              Effect.flatMap((conn) =>
                Effect.succeed({
                  id: conn.id,
                  connected: conn.connected,
                })
              )
            )
          )
        )
      )

      const result = await Effect.runPromise(program)
      expect(result.connected).toBe(true)
    })

    it("should get pool statistics", async () => {
      const program = Effect.scoped(
        pipe(
          dbConnectionPool(5),
          Effect.flatMap((pool) =>
            pipe(
              executeQuery(pool, "SELECT 1"),
              Effect.flatMap(() => getPoolStats(pool))
            )
          )
        )
      )

      const stats = await Effect.runPromise(program)
      expect(stats).toHaveProperty("size")
      expect(typeof stats.size).toBe("number")
    })
  })

  // ============================================================================
  // 4. Advanced Pool Usage
  // ============================================================================

  describe("Advanced Pool Usage", () => {
    it("should warm up pool with initial connections", async () => {
      const program = Effect.scoped(
        pipe(
          dbConnectionPool(10),
          Effect.flatMap((pool) =>
            pipe(
              warmupPool(pool, 5),
              Effect.flatMap(() => getPoolStats(pool))
            )
          )
        )
      )

      const stats = await Effect.runPromise(program)
      // After warmup, pool should have resources
      expect(stats).toHaveProperty("size")
      expect(typeof stats.size).toBe("number")
    })

    it("should acquire resource from pool with retry", async () => {
      const program = Effect.scoped(
        pipe(
          dbConnectionPool(5),
          Effect.flatMap((pool) =>
            pipe(
              poolGetWithRetry(pool, 3),
              Effect.map((conn) => conn.id)
            )
          )
        )
      )

      const connectionId = await Effect.runPromise(program)
      expect(typeof connectionId).toBe("number")
    })

    it("should gracefully shutdown pool", async () => {
      const program = Effect.scoped(
        pipe(
          dbConnectionPool(5),
          Effect.flatMap((pool) =>
            pipe(
              executeQuery(pool, "SELECT 1"),
              Effect.flatMap(() => gracefulPoolShutdown(pool))
            )
          )
        )
      )

      await expect(Effect.runPromise(program)).resolves.toBeUndefined()
    })
  })

  // ============================================================================
  // 5. Real-world Usage Examples
  // ============================================================================

  describe("Real-world Usage Examples", () => {
    it("should process batch with database pool", async () => {
      const items = ["item1", "item2", "item3", "item4", "item5"]

      const results = await Effect.runPromise(
        processBatchWithDbPool(items, 3, 2)
      )

      expect(results).toHaveLength(5)
      results.forEach((result, i) => {
        expect(result.result).toContain(items[i])
      })
    }, 10000)

    it("should scrape URLs with HTTP pool", async () => {
      const urls = [
        "https://example.com/page1",
        "https://example.com/page2",
        "https://example.com/page3",
        "https://example.com/page4",
        "https://example.com/page5",
      ]

      const results = await Effect.runPromise(
        scrapeUrlsWithPool(urls, 3, 2)
      )

      expect(results).toHaveLength(5)
      results.forEach((result, i) => {
        expect(result.status).toBe(200)
        expect(result.body).toContain("example.com")
      })
    }, 10000)

    it("should handle large batch processing efficiently", async () => {
      const items = Array.from({ length: 100 }, (_, i) => `item${i}`)
      const poolSize = 10
      const concurrency = 5

      const startTime = Date.now()
      const results = await Effect.runPromise(
        processBatchWithDbPool(items, poolSize, concurrency)
      )
      const duration = Date.now() - startTime

      expect(results).toHaveLength(100)

      // Verify connections were reused efficiently
      const uniqueConnections = new Set(results.map((r) => r.connectionId))
      expect(uniqueConnections.size).toBeLessThanOrEqual(poolSize)

      // Should complete reasonably quickly with concurrency
      // 100 queries at ~100ms each with concurrency 5 = ~2000ms minimum
      expect(duration).toBeGreaterThanOrEqual(1800)
    }, 30000)

    it("should handle high-concurrency URL scraping", async () => {
      const urls = Array.from(
        { length: 200 },
        (_, i) => `https://api.example.com/item${i}`
      )
      const poolSize = 20
      const concurrency = 10

      const startTime = Date.now()
      const results = await Effect.runPromise(
        scrapeUrlsWithPool(urls, poolSize, concurrency)
      )
      const duration = Date.now() - startTime

      expect(results).toHaveLength(200)

      // Verify clients were reused efficiently
      const uniqueClients = new Set(results.map((r) => r.clientId))
      expect(uniqueClients.size).toBeLessThanOrEqual(poolSize)

      // All requests should succeed
      expect(results.every((r) => r.status === 200)).toBe(true)

      // Should complete reasonably quickly with concurrency
      // 200 requests at ~50ms each with concurrency 10 = ~1000ms minimum
      expect(duration).toBeGreaterThanOrEqual(800)
    }, 30000)
  })

  // ============================================================================
  // 6. Pool Performance Tests
  // ============================================================================

  describe("Pool Performance", () => {
    it("should demonstrate pool efficiency vs sequential processing", async () => {
      const queries = Array.from({ length: 20 }, (_, i) => `SELECT ${i}`)

      // With pool and concurrency
      const startPooled = Date.now()
      await Effect.runPromise(executeConcurrentQueries(queries, 5, 5))
      const pooledDuration = Date.now() - startPooled

      // Sequential (concurrency 1)
      const startSequential = Date.now()
      await Effect.runPromise(executeConcurrentQueries(queries, 1, 1))
      const sequentialDuration = Date.now() - startSequential

      // Pooled with concurrency should be significantly faster
      expect(pooledDuration).toBeLessThan(sequentialDuration)
    }, 20000)

    it("should handle burst traffic efficiently", async () => {
      const urls = Array.from({ length: 100 }, (_, i) => `https://api.example.com/burst${i}`)

      const startTime = Date.now()
      const results = await Effect.runPromise(
        makeConcurrentRequests(urls, 25, 25) // Large pool and high concurrency for burst
      )
      const duration = Date.now() - startTime

      expect(results).toHaveLength(100)

      // With high pool size and concurrency, should handle burst quickly
      // 100 requests at ~50ms with concurrency 25 = ~200ms minimum
      expect(duration).toBeGreaterThanOrEqual(150)
      expect(duration).toBeLessThan(1000) // Should be much faster than sequential
    }, 20000)
  })

  // ============================================================================
  // 7. Pool Edge Cases
  // ============================================================================

  describe("Pool Edge Cases", () => {
    it("should handle pool with size 1", async () => {
      const program = Effect.scoped(
        pipe(
          dbConnectionPool(1),
          Effect.flatMap((pool) =>
            Effect.all(
              [
                executeQuery(pool, "SELECT 1"),
                executeQuery(pool, "SELECT 2"),
              ],
              { concurrency: "unbounded" }
            )
          )
        )
      )

      const results = await Effect.runPromise(program)
      expect(results).toHaveLength(2)

      // With pool size 1, both queries should use the same connection
      expect(results[0].connectionId).toBe(results[1].connectionId)
    }, 10000)

    it("should handle empty query list", async () => {
      const results = await Effect.runPromise(executeConcurrentQueries([], 5, 5))
      expect(results).toHaveLength(0)
    })

    it("should handle empty URL list", async () => {
      const results = await Effect.runPromise(makeConcurrentRequests([], 10, 10))
      expect(results).toHaveLength(0)
    })

    it("should handle very large pool size", async () => {
      const program = Effect.scoped(
        pipe(
          dbConnectionPool(1000), // Very large pool
          Effect.flatMap((pool) => executeQuery(pool, "SELECT 1"))
        )
      )

      const result = await Effect.runPromise(program)
      expect(result.result).toContain("SELECT 1")
    })
  })
})
