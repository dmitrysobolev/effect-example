import { Effect, Stream, Console, pipe, Chunk, Schedule, Duration } from "effect"

// Type aliases
type Fx<A, E = never> = Effect.Effect<A, E>

// ============================================================================
// 1. Basic Stream Creation
// ============================================================================

/**
 * Create a stream from a range of numbers
 */
export const rangeStream = (start: number, end: number) =>
  Stream.range(start, end)

/**
 * Create a stream from an array
 */
export const fromArray = <A>(items: A[]) =>
  Stream.fromIterable(items)

/**
 * Create a stream from a single value
 */
export const singleValue = <A>(value: A) =>
  Stream.make(value)

/**
 * Create an infinite stream that repeats a value
 */
export const repeatStream = <A>(value: A, times: number) =>
  pipe(
    Stream.make(value),
    Stream.repeat(Schedule.recurs(times - 1))
  )

/**
 * Create a stream from an effect
 */
export const fromEffect = <A, E>(effect: Fx<A, E>) =>
  Stream.fromEffect(effect)

/**
 * Empty stream
 */
export const emptyStream = Stream.empty

// ============================================================================
// 2. Stream Transformations
// ============================================================================

/**
 * Map over stream elements
 */
export const mapStream = <A, B>(stream: Stream.Stream<A>, f: (a: A) => B) =>
  Stream.map(stream, f)

/**
 * Filter stream elements
 */
export const filterStream = <A>(stream: Stream.Stream<A>, predicate: (a: A) => boolean) =>
  Stream.filter(stream, predicate)

/**
 * Take first N elements from a stream
 */
export const takeN = <A>(stream: Stream.Stream<A>, n: number) =>
  Stream.take(stream, n)

/**
 * Drop first N elements from a stream
 */
export const dropN = <A>(stream: Stream.Stream<A>, n: number) =>
  Stream.drop(stream, n)

/**
 * FlatMap (chain) streams
 */
export const flatMapStream = <A, B>(
  stream: Stream.Stream<A>,
  f: (a: A) => Stream.Stream<B>
) =>
  Stream.flatMap(stream, f)

/**
 * Tap - perform side effect for each element
 */
export const tapStream = <A>(
  stream: Stream.Stream<A>,
  f: (a: A) => Fx<void>
) =>
  Stream.tap(stream, f)

// ============================================================================
// 3. Stream Aggregations
// ============================================================================

/**
 * Fold (reduce) a stream to a single value
 */
export const foldStream = <A, B>(
  stream: Stream.Stream<A>,
  initial: B,
  f: (acc: B, a: A) => B
) =>
  Stream.runFold(stream, initial, f)

/**
 * Scan - like fold but emits intermediate results
 */
export const scanStream = <A, B>(
  stream: Stream.Stream<A>,
  initial: B,
  f: (acc: B, a: A) => B
) =>
  Stream.scan(stream, initial, f)

/**
 * Collect all stream elements into an array
 */
export const collectAll = <A>(stream: Stream.Stream<A>) =>
  Stream.runCollect(stream)

/**
 * Count elements in a stream
 */
export const countStream = <A>(stream: Stream.Stream<A>) =>
  pipe(
    stream,
    Stream.runFold(0, (count, _) => count + 1)
  )

/**
 * Sum numeric stream
 */
export const sumStream = (stream: Stream.Stream<number>) =>
  Stream.runSum(stream)

// ============================================================================
// 4. Chunking and Batching
// ============================================================================

/**
 * Group stream elements into chunks of specified size
 */
export const chunkBySize = <A>(stream: Stream.Stream<A>, size: number) =>
  Stream.grouped(stream, size)

/**
 * Process stream in batches
 */
export const processBatches = <A, B>(
  stream: Stream.Stream<A>,
  batchSize: number,
  processBatch: (batch: Chunk.Chunk<A>) => Fx<B>
) =>
  pipe(
    stream,
    Stream.grouped(batchSize),
    Stream.mapEffect(processBatch)
  )

/**
 * Rechunk stream by time window
 */
export const chunkByTime = <A>(stream: Stream.Stream<A>, durationMs: number) =>
  Stream.groupedWithin(stream, Number.MAX_SAFE_INTEGER, Duration.millis(durationMs))

// ============================================================================
// 5. Stream Concatenation and Merging
// ============================================================================

/**
 * Concatenate two streams sequentially
 */
export const concatStreams = <A>(
  stream1: Stream.Stream<A>,
  stream2: Stream.Stream<A>
) =>
  Stream.concat(stream1, stream2)

/**
 * Merge multiple streams concurrently
 */
export const mergeStreams = <A>(streams: Stream.Stream<A>[]) =>
  Stream.mergeAll(streams, { concurrency: "unbounded" })

/**
 * Interleave two streams
 */
export const interleaveStreams = <A>(
  stream1: Stream.Stream<A>,
  stream2: Stream.Stream<A>
) =>
  Stream.interleave(stream1, stream2)

/**
 * Zip two streams together
 */
export const zipStreams = <A, B>(
  stream1: Stream.Stream<A>,
  stream2: Stream.Stream<B>
) =>
  Stream.zip(stream1, stream2)

// ============================================================================
// 6. Backpressure and Flow Control
// ============================================================================

/**
 * Buffer stream elements
 */
export const bufferStream = <A>(stream: Stream.Stream<A>, capacity: number) =>
  Stream.buffer(stream, { capacity })

/**
 * Throttle stream - emit at most one element per time period
 */
export const throttleStream = <A>(stream: Stream.Stream<A>, durationMs: number) =>
  Stream.throttleShape(stream, 1, Duration.millis(durationMs))

/**
 * Debounce stream - emit only after quiet period
 */
export const debounceStream = <A>(stream: Stream.Stream<A>, durationMs: number) =>
  Stream.debounce(stream, Duration.millis(durationMs))

// ============================================================================
// 7. Error Handling
// ============================================================================

/**
 * Catch errors in a stream
 */
export const catchStreamError = <A, E, E2>(
  stream: Stream.Stream<A, E>,
  f: (e: E) => Stream.Stream<A, E2>
) =>
  Stream.catchAll(stream, f)

/**
 * Retry stream on failure
 */
export const retryStream = <A, E>(
  stream: Stream.Stream<A, E>,
  schedule: Schedule.Schedule<any, E>
) =>
  Stream.retry(stream, schedule)

/**
 * Provide a fallback stream on error
 */
export const orElseStream = <A, E, E2>(
  stream: Stream.Stream<A, E>,
  fallback: Stream.Stream<A, E2>
) =>
  Stream.orElse(stream, () => fallback)

// ============================================================================
// 8. Practical Examples
// ============================================================================

/**
 * Process a data pipeline with transformations
 */
export const dataPipeline = (numbers: number[]) =>
  pipe(
    Stream.fromIterable(numbers),
    Stream.filter((n) => n % 2 === 0), // Keep only even numbers
    Stream.map((n) => n * 2), // Double them
    Stream.take(5), // Take first 5
    Stream.tap((n) => Console.log(`Processed: ${n}`)),
    Stream.runCollect
  )

/**
 * Simulate processing a large dataset in chunks
 */
export const processLargeDataset = (totalItems: number, chunkSize: number) =>
  pipe(
    Stream.range(1, totalItems),
    Stream.grouped(chunkSize),
    Stream.mapEffect((chunk) =>
      pipe(
        Console.log(`Processing chunk of ${Chunk.size(chunk)} items`),
        Effect.map(() => ({
          chunkSize: Chunk.size(chunk),
          sum: Chunk.reduce(chunk, 0, (a, b) => a + b),
        }))
      )
    ),
    Stream.runCollect
  )

/**
 * Stream with concurrent processing
 */
export const concurrentStreamProcessing = <A, B>(
  items: A[],
  processItem: (item: A) => Fx<B>,
  concurrency: number
) =>
  pipe(
    Stream.fromIterable(items),
    Stream.mapEffect(processItem, { concurrency }),
    Stream.runCollect
  )

/**
 * Paginated API fetching pattern
 */
export const paginatedFetch = (totalPages: number) =>
  pipe(
    Stream.range(1, totalPages),
    Stream.mapEffect((page) =>
      pipe(
        Effect.sleep(Duration.millis(100)), // Simulate API call
        Effect.flatMap(() =>
          Console.log(`Fetching page ${page}`)
        ),
        Effect.map(() => ({
          page,
          data: `Page ${page} data`,
          items: Array.from({ length: 10 }, (_, i) => `Item ${page}-${i + 1}`),
        }))
      )
    ),
    Stream.tap((result) =>
      Console.log(`Received ${result.items.length} items from page ${result.page}`)
    ),
    Stream.runCollect
  )

/**
 * Real-time event processing with windowing
 */
export const windowedAggregation = (events: number[]) =>
  pipe(
    Stream.fromIterable(events),
    Stream.groupedWithin(5, Duration.millis(1000)), // Batch up to 5 items or every 1 second
    Stream.map((chunk) => ({
      count: Chunk.size(chunk),
      sum: Chunk.reduce(chunk, 0, (a, b) => a + b),
      avg: Chunk.reduce(chunk, 0, (a, b) => a + b) / Chunk.size(chunk),
    })),
    Stream.tap((stats) =>
      Console.log(
        `Window: count=${stats.count}, sum=${stats.sum}, avg=${stats.avg.toFixed(2)}`
      )
    ),
    Stream.runCollect
  )

/**
 * Transform and filter stream with effects
 */
export const enrichAndFilter = (ids: number[]) =>
  pipe(
    Stream.fromIterable(ids),
    Stream.mapEffect((id) =>
      Effect.succeed({
        id,
        name: `User-${id}`,
        active: id % 2 === 0,
      })
    ),
    Stream.filter((user) => user.active),
    Stream.tap((user) => Console.log(`Active user: ${user.name}`)),
    Stream.runCollect
  )

/**
 * Stream deduplication
 */
export const deduplicateStream = <A>(stream: Stream.Stream<A>) =>
  pipe(
    stream,
    Stream.changes // Removes consecutive duplicates
  )

/**
 * Take elements while condition is true
 */
export const takeWhileCondition = <A>(
  stream: Stream.Stream<A>,
  predicate: (a: A) => boolean
) =>
  Stream.takeWhile(stream, predicate)

/**
 * Drop elements while condition is true
 */
export const dropWhileCondition = <A>(
  stream: Stream.Stream<A>,
  predicate: (a: A) => boolean
) =>
  Stream.dropWhile(stream, predicate)

// ============================================================================
// 9. Advanced Patterns
// ============================================================================

/**
 * Broadcast stream to multiple consumers
 */
export const broadcastStream = <A>(stream: Stream.Stream<A>, consumers: number) =>
  pipe(
    stream,
    Stream.broadcast(consumers),
    Effect.flatMap((streams) =>
      Effect.all(
        streams.map((s, i) =>
          pipe(
            s,
            Stream.tap((value) =>
              Console.log(`Consumer ${i + 1} received: ${value}`)
            ),
            Stream.runCollect
          )
        ),
        { concurrency: "unbounded" }
      )
    )
  )

/**
 * Partition stream into two streams based on predicate
 */
export const partitionStream = <A>(
  stream: Stream.Stream<A>,
  predicate: (a: A) => boolean
) =>
  pipe(
    stream,
    Stream.partition(predicate, { bufferSize: 16 }),
    Effect.flatMap(([left, right]) =>
      Effect.all([
        pipe(left, Stream.runCollect),
        pipe(right, Stream.runCollect),
      ])
    )
  )

/**
 * Stream pagination helper
 */
export const paginateStream = <A>(
  items: A[],
  pageSize: number
) =>
  pipe(
    Stream.fromIterable(items),
    Stream.grouped(pageSize),
    Stream.map((chunk, index) => ({
      page: index + 1,
      items: Chunk.toReadonlyArray(chunk),
      size: Chunk.size(chunk),
    }))
  )

/**
 * Merge streams with priority
 */
export const mergePrioritized = <A>(
  highPriority: Stream.Stream<A>,
  lowPriority: Stream.Stream<A>
) =>
  pipe(
    Stream.mergeAll([highPriority, lowPriority], { concurrency: 2 })
  )

/**
 * Sample stream at intervals
 */
export const sampleStream = <A>(stream: Stream.Stream<A>, intervalMs: number) =>
  Stream.throttleShape(stream, 1, Duration.millis(intervalMs))

/**
 * Sliding window over stream
 */
export const slidingWindow = <A>(stream: Stream.Stream<A>, windowSize: number) =>
  Stream.sliding(stream, windowSize)
