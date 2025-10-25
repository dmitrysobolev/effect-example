import { describe, it, expect } from "vitest"
import { Effect, Metric, pipe } from "effect"
import {
  requestCounter,
  errorCounter,
  activeConnectionsGauge,
  memoryUsageGauge,
  requestDurationHistogram,
  labeledRequestCounter,
  serviceHealthGauge,
  withDurationTracking,
  withCountTracking,
  withGaugeTracking,
  handleHttpRequest,
  dbActiveConnections,
  executeQuery,
  cacheHits,
  cacheMisses,
  trackCacheLookup,
  queueSize,
  enqueueItem,
  dequeueAndProcess,
  recordOrder,
  trackRateLimit,
  recordSystemMetrics,
  successRate,
  calculateThroughput,
  getMetricValue,
  trackApiCall,
  conditionalMetric,
  handleCompleteRequest,
} from "./metrics"

describe("Metrics Collection", () => {
  // ============================================================================
  // Basic Metrics
  // ============================================================================

  describe("Basic Metrics", () => {
    it("should increment counter", async () => {
      const program = Effect.gen(function* () {
        yield* Metric.increment(requestCounter)
        yield* Metric.increment(requestCounter)
        yield* Metric.increment(requestCounter)

        const value = yield* Metric.value(requestCounter)
        expect(value.count).toBe(3)
      })

      await Effect.runPromise(program)
    })

    it("should update gauge", async () => {
      const program = Effect.gen(function* () {
        yield* Metric.set(activeConnectionsGauge, 10)
        const value1 = yield* Metric.value(activeConnectionsGauge)
        expect(value1.value).toBe(10)

        yield* Metric.update(activeConnectionsGauge, 5)
        const value2 = yield* Metric.value(activeConnectionsGauge)
        expect(value2.value).toBe(15)

        yield* Metric.update(activeConnectionsGauge, -3)
        const value3 = yield* Metric.value(activeConnectionsGauge)
        expect(value3.value).toBe(12)
      })

      await Effect.runPromise(program)
    })

    it("should track histogram values", async () => {
      const program = Effect.gen(function* () {
        yield* Metric.update(requestDurationHistogram, 0.05)
        yield* Metric.update(requestDurationHistogram, 0.15)
        yield* Metric.update(requestDurationHistogram, 0.25)
        yield* Metric.update(requestDurationHistogram, 0.35)

        const value = yield* Metric.value(requestDurationHistogram)
        expect(value.count).toBe(4)
        expect(value.sum).toBeCloseTo(0.8, 2)
      })

      await Effect.runPromise(program)
    })
  })

  // ============================================================================
  // Tagged Metrics
  // ============================================================================

  describe("Tagged Metrics", () => {
    it("should track metrics with labels", async () => {
      const program = Effect.gen(function* () {
        yield* Metric.increment(labeledRequestCounter("GET", 200))
        yield* Metric.increment(labeledRequestCounter("GET", 200))
        yield* Metric.increment(labeledRequestCounter("POST", 201))

        const getRequests = yield* Metric.value(
          labeledRequestCounter("GET", 200)
        )
        expect(getRequests.count).toBe(2)

        const postRequests = yield* Metric.value(
          labeledRequestCounter("POST", 201)
        )
        expect(postRequests.count).toBe(1)
      })

      await Effect.runPromise(program)
    })

    it("should track service health with labels", async () => {
      const program = Effect.gen(function* () {
        yield* Metric.set(serviceHealthGauge("database"), 1)
        yield* Metric.set(serviceHealthGauge("cache"), 0)

        const dbHealth = yield* Metric.value(serviceHealthGauge("database"))
        expect(dbHealth.value).toBe(1)

        const cacheHealth = yield* Metric.value(serviceHealthGauge("cache"))
        expect(cacheHealth.value).toBe(0)
      })

      await Effect.runPromise(program)
    })
  })

  // ============================================================================
  // Metric Tracking Utilities
  // ============================================================================

  describe("Metric Tracking Utilities", () => {
    it("should track operation duration", async () => {
      const program = Effect.gen(function* () {
        const operation = Effect.sleep("10 millis")
        yield* withDurationTracking(requestDurationHistogram, operation)

        const value = yield* Metric.value(requestDurationHistogram)
        expect(value.count).toBe(1)
        expect(value.sum).toBeGreaterThanOrEqual(0.01) // At least 10ms
      })

      await Effect.runPromise(program)
    })

    it("should track success and error counts", async () => {
      const program = Effect.gen(function* () {
        const successOp = Effect.succeed(42)
        const errorOp = Effect.fail(new Error("test error"))

        yield* withCountTracking(requestCounter, errorCounter, successOp)
        yield* withCountTracking(
          requestCounter,
          errorCounter,
          errorOp
        ).pipe(Effect.catchAll(() => Effect.void))

        const successCount = yield* Metric.value(requestCounter)
        expect(successCount.count).toBe(1)

        const errorCount = yield* Metric.value(errorCounter)
        expect(errorCount.count).toBe(1)
      })

      await Effect.runPromise(program)
    })

    it("should track gauge during operation", async () => {
      const program = Effect.gen(function* () {
        yield* Metric.set(activeConnectionsGauge, 0)

        const operation = Effect.sleep("10 millis")
        yield* withGaugeTracking(activeConnectionsGauge, 1, operation)

        const value = yield* Metric.value(activeConnectionsGauge)
        expect(value.value).toBe(0) // Should be back to 0 after operation
      })

      await Effect.runPromise(program)
    })
  })

  // ============================================================================
  // HTTP Request Tracking
  // ============================================================================

  describe("HTTP Request Tracking", () => {
    it("should track successful HTTP request", async () => {
      const program = Effect.gen(function* () {
        const handler = Effect.succeed("OK")
        yield* handleHttpRequest("GET", "/api/users", handler)

        const value = yield* Metric.value(labeledRequestCounter("GET", 200))
        expect(value.count).toBe(1)
      })

      await Effect.runPromise(program)
    })

    it("should track failed HTTP request", async () => {
      const program = Effect.gen(function* () {
        const handler = Effect.fail(new Error("Internal error"))
        yield* handleHttpRequest("POST", "/api/orders", handler).pipe(
          Effect.catchAll(() => Effect.void)
        )

        const value = yield* Metric.value(labeledRequestCounter("POST", 500))
        expect(value.count).toBe(1)
      })

      await Effect.runPromise(program)
    })
  })

  // ============================================================================
  // Database Metrics
  // ============================================================================

  describe("Database Metrics", () => {
    it("should track database query execution", async () => {
      const program = Effect.gen(function* () {
        yield* Metric.set(dbActiveConnections, 0)

        const query = Effect.sleep("20 millis")
        yield* executeQuery("SELECT * FROM users", query)

        const connections = yield* Metric.value(dbActiveConnections)
        expect(connections.value).toBe(0) // Should be back to 0
      })

      await Effect.runPromise(program)
    })
  })

  // ============================================================================
  // Cache Metrics
  // ============================================================================

  describe("Cache Metrics", () => {
    it("should track cache hits", async () => {
      const program = Effect.gen(function* () {
        const cacheHit = Effect.succeed("cached value")
        yield* trackCacheLookup("key1", cacheHit)

        const hits = yield* Metric.value(cacheHits)
        expect(hits.count).toBe(1)
      })

      await Effect.runPromise(program)
    })

    it("should track cache misses", async () => {
      const program = Effect.gen(function* () {
        const cacheMiss = Effect.succeed(null)
        yield* trackCacheLookup("key2", cacheMiss)

        const misses = yield* Metric.value(cacheMisses)
        expect(misses.count).toBe(1)
      })

      await Effect.runPromise(program)
    })
  })

  // ============================================================================
  // Queue Metrics
  // ============================================================================

  describe("Queue Metrics", () => {
    it("should track queue operations", async () => {
      const program = Effect.gen(function* () {
        yield* Metric.set(queueSize, 0)

        // Enqueue items
        yield* enqueueItem("item1", Effect.void)
        yield* enqueueItem("item2", Effect.void)

        const sizeAfterEnqueue = yield* Metric.value(queueSize)
        expect(sizeAfterEnqueue.value).toBe(2)

        // Dequeue and process
        yield* dequeueAndProcess(Effect.sleep("10 millis"))

        const sizeAfterDequeue = yield* Metric.value(queueSize)
        expect(sizeAfterDequeue.value).toBe(1)
      })

      await Effect.runPromise(program)
    })
  })

  // ============================================================================
  // Business Metrics
  // ============================================================================

  describe("Business Metrics", () => {
    it("should record order metrics", async () => {
      const program = Effect.gen(function* () {
        yield* recordOrder(99.99, "user-123")
        yield* recordOrder(149.99, "user-456")

        const orders = yield* Metric.value(Metric.counter("orders_total"))
        expect(orders.count).toBe(2)
      })

      await Effect.runPromise(program)
    })

    it("should track rate limiting", async () => {
      const program = Effect.gen(function* () {
        yield* trackRateLimit("client-1", true)
        yield* trackRateLimit("client-1", false)

        const violations = yield* Metric.value(
          Metric.counter("rate_limit_exceeded_total")
        )
        expect(violations.count).toBe(1)
      })

      await Effect.runPromise(program)
    })
  })

  // ============================================================================
  // System Metrics
  // ============================================================================

  describe("System Metrics", () => {
    it("should record system metrics", async () => {
      const program = Effect.gen(function* () {
        yield* recordSystemMetrics()

        const heap = yield* Metric.value(
          Metric.gauge("heap_memory_used_bytes")
        )
        expect(heap.value).toBeGreaterThan(0)
      })

      await Effect.runPromise(program)
    })
  })

  // ============================================================================
  // Aggregations
  // ============================================================================

  describe("Metric Aggregations", () => {
    it("should calculate success rate", () => {
      expect(successRate(95, 100)).toBe(95)
      expect(successRate(0, 100)).toBe(0)
      expect(successRate(50, 0)).toBe(0)
    })

    it("should calculate throughput", () => {
      expect(calculateThroughput(100, 10)).toBe(10)
      expect(calculateThroughput(50, 5)).toBe(10)
      expect(calculateThroughput(100, 0)).toBe(0)
    })
  })

  // ============================================================================
  // Advanced Patterns
  // ============================================================================

  describe("Advanced Patterns", () => {
    it("should track composite API call metrics", async () => {
      const program = Effect.gen(function* () {
        const operation = Effect.sleep("15 millis")
        yield* trackApiCall("/api/users", "GET", operation)

        const requests = yield* Metric.value(labeledRequestCounter("GET", 200))
        expect(requests.count).toBe(1)
      })

      await Effect.runPromise(program)
    })

    it("should conditionally track metrics", async () => {
      const program = Effect.gen(function* () {
        const operation = Effect.succeed(42)

        yield* conditionalMetric(true, requestCounter, operation)
        yield* conditionalMetric(false, requestCounter, operation)

        const value = yield* Metric.value(requestCounter)
        expect(value.count).toBe(1) // Only incremented when condition is true
      })

      await Effect.runPromise(program)
    })

    it("should handle complete request with all metrics", async () => {
      const program = Effect.gen(function* () {
        yield* Metric.set(activeConnectionsGauge, 0)

        const result = yield* handleCompleteRequest(
          "POST",
          "/api/orders",
          "user-789"
        )

        expect(result.status).toBe(200)
        expect(result.size).toBe(1024)
        expect(result.duration).toBeGreaterThan(0)

        const connections = yield* Metric.value(activeConnectionsGauge)
        expect(connections.value).toBe(0) // Should be back to 0
      })

      await Effect.runPromise(program)
    })
  })

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe("Integration Tests", () => {
    it("should track metrics across multiple operations", async () => {
      const program = Effect.gen(function* () {
        // Simulate multiple HTTP requests
        yield* handleHttpRequest("GET", "/api/users", Effect.succeed("OK"))
        yield* handleHttpRequest("POST", "/api/orders", Effect.succeed("Created"))
        yield* handleHttpRequest(
          "GET",
          "/api/products",
          Effect.fail(new Error("Not found"))
        ).pipe(Effect.catchAll(() => Effect.void))

        // Verify counters
        const getRequests = yield* Metric.value(labeledRequestCounter("GET", 200))
        expect(getRequests.count).toBe(2)

        const postRequests = yield* Metric.value(labeledRequestCounter("POST", 200))
        expect(postRequests.count).toBe(1)

        const errors = yield* Metric.value(labeledRequestCounter("GET", 500))
        expect(errors.count).toBe(1)
      })

      await Effect.runPromise(program)
    })

    it("should track database and cache metrics together", async () => {
      const program = Effect.gen(function* () {
        // Cache miss -> database query
        yield* trackCacheLookup("user:123", Effect.succeed(null))
        yield* executeQuery("SELECT * FROM users WHERE id = 123", Effect.succeed({}))

        // Cache hit
        yield* trackCacheLookup("user:456", Effect.succeed({ id: 456 }))

        const misses = yield* Metric.value(cacheMisses)
        expect(misses.count).toBe(1)

        const hits = yield* Metric.value(cacheHits)
        expect(hits.count).toBe(1)
      })

      await Effect.runPromise(program)
    })
  })
})
