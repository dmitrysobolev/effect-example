import { describe, it, expect } from "vitest"
import { Effect, Stream, Chunk, pipe } from "effect"
import {
  rangeStream,
  fromArray,
  singleValue,
  repeatStream,
  mapStream,
  filterStream,
  takeN,
  dropN,
  foldStream,
  scanStream,
  collectAll,
  countStream,
  sumStream,
  chunkBySize,
  concatStreams,
  zipStreams,
  dataPipeline,
  processLargeDataset,
  concurrentStreamProcessing,
  enrichAndFilter,
  deduplicateStream,
  takeWhileCondition,
  dropWhileCondition,
  paginateStream,
  slidingWindow,
} from "./streaming"

describe("Stream Processing", () => {
  // ============================================================================
  // 1. Basic Stream Creation
  // ============================================================================

  describe("Stream Creation", () => {
    it("should create stream from range", async () => {
      const result = await Effect.runPromise(
        pipe(rangeStream(1, 5), Stream.runCollect)
      )
      expect(Chunk.toReadonlyArray(result)).toEqual([1, 2, 3, 4, 5])
    })

    it("should create stream from array", async () => {
      const result = await Effect.runPromise(
        pipe(fromArray([10, 20, 30]), Stream.runCollect)
      )
      expect(Chunk.toReadonlyArray(result)).toEqual([10, 20, 30])
    })

    it("should create stream with single value", async () => {
      const result = await Effect.runPromise(
        pipe(singleValue(42), Stream.runCollect)
      )
      expect(Chunk.toReadonlyArray(result)).toEqual([42])
    })

    it("should repeat value in stream", async () => {
      const result = await Effect.runPromise(
        pipe(repeatStream("A", 3), Stream.runCollect)
      )
      expect(Chunk.toReadonlyArray(result)).toEqual(["A", "A", "A"])
    })
  })

  // ============================================================================
  // 2. Stream Transformations
  // ============================================================================

  describe("Stream Transformations", () => {
    it("should map over stream", async () => {
      const stream = rangeStream(1, 3)
      const result = await Effect.runPromise(
        pipe(mapStream(stream, (n) => n * 2), Stream.runCollect)
      )
      expect(Chunk.toReadonlyArray(result)).toEqual([2, 4, 6])
    })

    it("should filter stream", async () => {
      const stream = rangeStream(1, 10)
      const result = await Effect.runPromise(
        pipe(filterStream(stream, (n) => n % 2 === 0), Stream.runCollect)
      )
      expect(Chunk.toReadonlyArray(result)).toEqual([2, 4, 6, 8, 10])
    })

    it("should take first N elements", async () => {
      const stream = rangeStream(1, 100)
      const result = await Effect.runPromise(
        pipe(takeN(stream, 5), Stream.runCollect)
      )
      expect(Chunk.toReadonlyArray(result)).toEqual([1, 2, 3, 4, 5])
    })

    it("should drop first N elements", async () => {
      const stream = rangeStream(1, 5)
      const result = await Effect.runPromise(
        pipe(dropN(stream, 2), Stream.runCollect)
      )
      expect(Chunk.toReadonlyArray(result)).toEqual([3, 4, 5])
    })
  })

  // ============================================================================
  // 3. Stream Aggregations
  // ============================================================================

  describe("Stream Aggregations", () => {
    it("should fold stream to single value", async () => {
      const stream = rangeStream(1, 5)
      const result = await Effect.runPromise(
        foldStream(stream, 0, (acc, n) => acc + n)
      )
      expect(result).toBe(15)
    })

    it("should scan stream with intermediate results", async () => {
      const stream = rangeStream(1, 4)
      const result = await Effect.runPromise(
        pipe(scanStream(stream, 0, (acc, n) => acc + n), Stream.runCollect)
      )
      expect(Chunk.toReadonlyArray(result)).toEqual([0, 1, 3, 6, 10])
    })

    it("should collect all elements", async () => {
      const stream = fromArray(["a", "b", "c"])
      const result = await Effect.runPromise(collectAll(stream))
      expect(Chunk.toReadonlyArray(result)).toEqual(["a", "b", "c"])
    })

    it("should count stream elements", async () => {
      const stream = rangeStream(1, 100)
      const result = await Effect.runPromise(countStream(stream))
      expect(result).toBe(100)
    })

    it("should sum numeric stream", async () => {
      const stream = rangeStream(1, 10)
      const result = await Effect.runPromise(sumStream(stream))
      expect(result).toBe(55)
    })
  })

  // ============================================================================
  // 4. Chunking and Batching
  // ============================================================================

  describe("Chunking", () => {
    it("should chunk stream by size", async () => {
      const stream = rangeStream(1, 10)
      const result = await Effect.runPromise(
        pipe(chunkBySize(stream, 3), Stream.runCollect)
      )

      const chunks = Chunk.toReadonlyArray(result).map((chunk) =>
        Chunk.toReadonlyArray(chunk)
      )
      expect(chunks).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10]])
    })
  })

  // ============================================================================
  // 5. Stream Concatenation
  // ============================================================================

  describe("Stream Concatenation", () => {
    it("should concatenate streams", async () => {
      const stream1 = fromArray([1, 2, 3])
      const stream2 = fromArray([4, 5, 6])
      const result = await Effect.runPromise(
        pipe(concatStreams(stream1, stream2), Stream.runCollect)
      )
      expect(Chunk.toReadonlyArray(result)).toEqual([1, 2, 3, 4, 5, 6])
    })

    it("should zip two streams", async () => {
      const stream1 = fromArray([1, 2, 3])
      const stream2 = fromArray(["a", "b", "c"])
      const result = await Effect.runPromise(
        pipe(zipStreams(stream1, stream2), Stream.runCollect)
      )
      expect(Chunk.toReadonlyArray(result)).toEqual([
        [1, "a"],
        [2, "b"],
        [3, "c"],
      ])
    })
  })

  // ============================================================================
  // 6. Practical Examples
  // ============================================================================

  describe("Practical Examples", () => {
    it("should process data pipeline", async () => {
      const result = await Effect.runPromise(dataPipeline([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))
      expect(Chunk.toReadonlyArray(result)).toEqual([4, 8, 12, 16, 20])
    })

    it("should process large dataset in chunks", async () => {
      const result = await Effect.runPromise(processLargeDataset(20, 5))
      const chunks = Chunk.toReadonlyArray(result)

      expect(chunks).toHaveLength(4)
      chunks.forEach((chunk) => {
        expect(chunk.chunkSize).toBeLessThanOrEqual(5)
        expect(chunk.sum).toBeGreaterThan(0)
      })
    })

    it("should process items concurrently", async () => {
      const items = [1, 2, 3, 4, 5]
      const processItem = (n: number) =>
        Effect.succeed(n * 2)

      const result = await Effect.runPromise(
        concurrentStreamProcessing(items, processItem, 2)
      )
      expect(Chunk.toReadonlyArray(result)).toEqual([2, 4, 6, 8, 10])
    })

    it("should enrich and filter stream", async () => {
      const result = await Effect.runPromise(enrichAndFilter([1, 2, 3, 4, 5]))
      const users = Chunk.toReadonlyArray(result)

      expect(users).toHaveLength(2)
      users.forEach((user) => {
        expect(user.active).toBe(true)
        expect(user.id % 2).toBe(0)
      })
    })
  })

  // ============================================================================
  // 7. Advanced Patterns
  // ============================================================================

  describe("Advanced Patterns", () => {
    it("should deduplicate consecutive elements", async () => {
      const stream = fromArray([1, 1, 2, 2, 2, 3, 1, 1])
      const result = await Effect.runPromise(
        pipe(deduplicateStream(stream), Stream.runCollect)
      )
      expect(Chunk.toReadonlyArray(result)).toEqual([1, 2, 3, 1])
    })

    it("should take while condition is true", async () => {
      const stream = rangeStream(1, 10)
      const result = await Effect.runPromise(
        pipe(takeWhileCondition(stream, (n) => n < 5), Stream.runCollect)
      )
      expect(Chunk.toReadonlyArray(result)).toEqual([1, 2, 3, 4])
    })

    it("should drop while condition is true", async () => {
      const stream = rangeStream(1, 10)
      const result = await Effect.runPromise(
        pipe(dropWhileCondition(stream, (n) => n < 5), Stream.runCollect)
      )
      expect(Chunk.toReadonlyArray(result)).toEqual([5, 6, 7, 8, 9, 10])
    })

    it("should paginate stream", async () => {
      const items = Array.from({ length: 25 }, (_, i) => i + 1)
      const result = await Effect.runPromise(
        pipe(paginateStream(items, 10), Stream.runCollect)
      )

      const pages = Chunk.toReadonlyArray(result)
      expect(pages).toHaveLength(3)
      expect(pages[0].items).toHaveLength(10)
      expect(pages[1].items).toHaveLength(10)
      expect(pages[2].items).toHaveLength(5)
      // Check all pages have page numbers
      pages.forEach(page => {
        expect(page.page).toBeGreaterThan(0)
        expect(page.size).toBe(page.items.length)
      })
    })

    it("should create sliding windows", async () => {
      const stream = rangeStream(1, 5)
      const result = await Effect.runPromise(
        pipe(slidingWindow(stream, 3), Stream.runCollect)
      )

      const windows = Chunk.toReadonlyArray(result).map((chunk) =>
        Chunk.toReadonlyArray(chunk)
      )
      expect(windows).toEqual([[1, 2, 3], [2, 3, 4], [3, 4, 5]])
    })
  })

  // ============================================================================
  // 8. Performance and Memory Tests
  // ============================================================================

  describe("Performance", () => {
    it("should handle large streams efficiently", async () => {
      const startTime = Date.now()
      const result = await Effect.runPromise(
        pipe(
          rangeStream(1, 10000),
          Stream.filter((n) => n % 2 === 0),
          Stream.map((n) => n * 2),
          Stream.take(100),
          Stream.runCollect
        )
      )
      const duration = Date.now() - startTime

      expect(Chunk.size(result)).toBe(100)
      expect(duration).toBeLessThan(1000) // Should be fast
    })

    it("should take only needed elements from stream", async () => {
      const result = await Effect.runPromise(
        pipe(
          rangeStream(1, 1000),
          Stream.map((n) => n * 2),
          Stream.take(5),
          Stream.runCollect
        )
      )

      expect(Chunk.size(result)).toBe(5)
      expect(Chunk.toReadonlyArray(result)).toEqual([2, 4, 6, 8, 10])
    })
  })

  // ============================================================================
  // 9. Integration Tests
  // ============================================================================

  describe("Integration", () => {
    it("should combine multiple stream operations", async () => {
      const result = await Effect.runPromise(
        pipe(
          rangeStream(1, 100),
          Stream.filter((n) => n % 2 === 0),
          Stream.map((n) => n * 2),
          Stream.grouped(5),
          Stream.map((chunk) => Chunk.reduce(chunk, 0, (a, b) => a + b)),
          Stream.take(3),
          Stream.runCollect
        )
      )

      const sums = Chunk.toReadonlyArray(result)
      expect(sums).toHaveLength(3)
      sums.forEach((sum) => expect(sum).toBeGreaterThan(0))
    })
  })
})
