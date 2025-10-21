# Effect Library Examples

A TypeScript project demonstrating practical usage patterns of the [Effect](https://effect.website/) library for functional programming with typed errors and resource management.

## Overview

This project showcases various Effect library patterns including:
- Error handling with typed errors
- Effect composition using pipe
- Generator syntax for Effects
- Resource management with acquire/use/release pattern
- Combining multiple effects
- **Concurrency patterns** (racing, parallel processing, fiber management, interruption)
- **Scheduling & Jittered delays** (retry with backoff, recurring tasks, anti-thundering herd)
- **Stream processing** (transformations, chunking, backpressure, data pipelines)

## Installation

```bash
npm install
```

## Development

```bash
# Build the project
npm run build

# Build in watch mode
npm run dev

# Run tests
npm test

# Run tests with UI
npm run test:ui
```

## Examples

The project includes several Effect patterns:

### 1. Basic Error Handling
```typescript
const processUser = (id: number) => pipe(
  fetchUser(id),
  Effect.flatMap(validateUser),
  Effect.tap(user => Console.log(`Processing user: ${user.name}`))
)
```

### 2. Generator Syntax
```typescript
const generatorExample = Effect.gen(function* (_) {
  const user = yield* _(fetchUser(2))
  const validated = yield* _(validateUser(user))
  return validated
})
```

### 3. Resource Management
```typescript
const withDatabaseConnection = <A, E>(operation: (db: DatabaseConnection) => Fx<A, E>) =>
  Effect.acquireUseRelease(
    acquire,    // Open connection
    operation,  // Use connection
    release     // Close connection (always runs)
  )
```

### 4. Concurrency Patterns

The `src/concurrency.ts` file demonstrates advanced concurrency patterns:

#### Racing Effects
```typescript
// Returns result of fastest effect, interrupts losers
Effect.race(
  simulateApiCall("Slow API", 1000, "slow result"),
  simulateApiCall("Fast API", 100, "fast result")
)
```

#### Parallel Processing
```typescript
// Run all effects in parallel
Effect.all([effect1, effect2, effect3], { concurrency: "unbounded" })

// Limit concurrent operations
Effect.all(effects, { concurrency: 2 })

// Sequential processing
Effect.all(effects, { concurrency: 1 })
```

#### Concurrent Iteration
```typescript
// Process array items concurrently
Effect.forEach(
  items,
  (item) => processItem(item),
  { concurrency: 5 }
)
```

#### Fiber Management
```typescript
// Fork background tasks and join later
Effect.gen(function* (_) {
  const fiber = yield* _(Effect.fork(longRunningTask))
  // Do other work...
  const result = yield* _(Fiber.join(fiber))
  return result
})
```

#### Interruption Handling
```typescript
// Handle graceful cancellation
const task = pipe(
  longRunningOperation,
  Effect.onInterrupt(() => Console.log("Task was cancelled"))
)

// Guarantee completion even if interrupted
Effect.uninterruptible(criticalOperation)
```

#### Timeout Patterns
```typescript
// Fail if operation takes too long
Effect.race(
  operation,
  pipe(
    Effect.sleep(Duration.millis(5000)),
    Effect.flatMap(() => Effect.fail(new TimeoutError()))
  )
)

// Use fallback value on timeout
withTimeoutFallback(operation, 1000, defaultValue)
```

### 5. Scheduling & Jittered Delays

The `src/scheduling.ts` file demonstrates scheduling patterns with jittered delays to prevent thundering herd problems:

#### Exponential Backoff with Jitter
```typescript
// Full jitter - random delay between 0 and exponential backoff value
const fullJitterSchedule = pipe(
  Schedule.exponential(Duration.millis(100)),
  Schedule.jittered()
)

// Retry with jittered exponential backoff
Effect.retry(operation, fullJitterSchedule)
```

#### Jitter Strategies
```typescript
// Full jitter (0% to 100% of delay)
Schedule.jittered()

// Proportional jitter (custom range)
Schedule.jittered({ min: 0.8, max: 1.2 }) // ±20% variation

// Equal jitter (50% to 100% of delay)
Schedule.jittered({ min: 0.5, max: 1.0 })
```

#### Capped Backoff
```typescript
// Cap maximum delay and limit retries
const cappedSchedule = pipe(
  Schedule.exponential(Duration.millis(100)),
  Schedule.jittered(),
  Schedule.either(Schedule.spaced(Duration.millis(5000))), // Max 5s
  Schedule.compose(Schedule.recurs(10)) // Max 10 retries
)
```

#### Fibonacci & Linear Backoff
```typescript
// Fibonacci: 100ms, 100ms, 200ms, 300ms, 500ms...
const fibonacciSchedule = pipe(
  Schedule.fibonacci(Duration.millis(100)),
  Schedule.jittered()
)

// Linear: 100ms, 200ms, 300ms, 400ms...
const linearSchedule = pipe(
  Schedule.linear(Duration.millis(100)),
  Schedule.jittered()
)
```

#### Practical Retry Examples
```typescript
// Database connection with retry
const connectToDatabase = pipe(
  attemptConnection,
  Effect.retry(
    pipe(
      Schedule.exponential(Duration.millis(50)),
      Schedule.jittered(),
      Schedule.compose(Schedule.recurs(5))
    )
  )
)

// HTTP request with capped retry
const fetchWithRetry = pipe(
  httpRequest,
  Effect.retry(cappedJitterSchedule(100, 5000, 3))
)
```

#### Elapsed Time Limits
```typescript
// Stop retrying after total elapsed time
const timedSchedule = pipe(
  Schedule.exponential(Duration.millis(100)),
  Schedule.jittered(),
  Schedule.whileOutput(elapsed =>
    Duration.lessThan(elapsed, Duration.seconds(30))
  )
)
```

#### Why Jitter?
Jitter prevents the **thundering herd problem** where many clients retry simultaneously:
- Without jitter: All clients retry at exactly 100ms, 200ms, 400ms...
- With jitter: Clients retry at random intervals, spreading the load
- Critical for distributed systems and high-scale applications

### 6. Stream Processing

The `src/streaming.ts` file demonstrates Effect.Stream for processing large datasets efficiently:

#### Basic Stream Operations
```typescript
// Create streams
const numbers = Stream.range(1, 100)
const fromData = Stream.fromIterable([1, 2, 3, 4, 5])

// Transform streams
pipe(
  numbers,
  Stream.map(n => n * 2),
  Stream.filter(n => n % 2 === 0),
  Stream.take(10),
  Stream.runCollect
)
```

#### Chunking and Batching
```typescript
// Process in batches
pipe(
  Stream.range(1, 1000),
  Stream.grouped(50), // Chunks of 50
  Stream.mapEffect(batch => processBatch(batch)),
  Stream.runCollect
)

// Time-based windowing
Stream.groupedWithin(stream, 100, Duration.seconds(5))
```

#### Stream Aggregations
```typescript
// Fold entire stream
Stream.runFold(stream, 0, (acc, n) => acc + n)

// Scan with intermediate results
Stream.scan(stream, 0, (acc, n) => acc + n)

// Collect all elements
Stream.runCollect(stream)
```

#### Concurrent Stream Processing
```typescript
// Process items concurrently
pipe(
  Stream.fromIterable(items),
  Stream.mapEffect(processItem, { concurrency: 5 }),
  Stream.runCollect
)

// Merge multiple streams
Stream.mergeAll([stream1, stream2, stream3], {
  concurrency: "unbounded"
})
```

#### Backpressure and Flow Control
```typescript
// Buffer elements
Stream.buffer(stream, { capacity: 100 })

// Throttle emissions
Stream.throttleShape(stream, 1, Duration.seconds(1))

// Debounce
Stream.debounce(stream, Duration.millis(500))
```

#### Data Pipelines
```typescript
// Complex data transformation pipeline
pipe(
  Stream.range(1, 1000),
  Stream.filter(n => n % 2 === 0),
  Stream.map(n => n * 2),
  Stream.grouped(10),
  Stream.mapEffect(chunk => analyzeChunk(chunk)),
  Stream.tap(result => Console.log(result)),
  Stream.runCollect
)
```

#### Practical Stream Examples
```typescript
// Paginated API fetching
const fetchAllPages = pipe(
  Stream.range(1, totalPages),
  Stream.mapEffect(page => fetchPage(page)),
  Stream.runCollect
)

// Real-time event processing
const processEvents = pipe(
  eventStream,
  Stream.groupedWithin(100, Duration.seconds(1)),
  Stream.map(chunk => aggregateEvents(chunk)),
  Stream.runCollect
)

// Sliding window analysis
pipe(
  dataStream,
  Stream.sliding(5), // Window of 5 elements
  Stream.map(window => calculateMovingAverage(window)),
  Stream.runCollect
)
```

#### Why Streams?
- **Memory efficient**: Process large datasets without loading everything into memory
- **Lazy evaluation**: Elements are processed on-demand
- **Composable**: Chain transformations declaratively
- **Backpressure**: Handle fast producers and slow consumers
- **Concurrent**: Process elements in parallel when needed

## Pattern Decision Guide

This section helps you choose the right pattern for your use case.

### When to Use Each Concurrency Pattern

#### Use `Effect.race` When:
- You need the **first successful result** and don't care about others
- Multiple sources can provide the same data (cache vs database vs API)
- You want a timeout mechanism (race operation vs delay)
- Examples:
  - Fetching from multiple redundant endpoints
  - Implementing timeouts
  - User cancellable operations

#### Use `Effect.all` with Parallel Concurrency When:
- You need **all results** and they're independent
- Operations can run simultaneously without conflicts
- Order of execution doesn't matter
- Examples:
  - Fetching user profile + settings + preferences simultaneously
  - Parallel validation of multiple fields
  - Batch processing independent items

#### Use `Effect.all` with Sequential Concurrency When:
- Operations must run **in order**
- Later operations depend on earlier results
- Resource constraints require serialization
- Examples:
  - Database migrations that must run in sequence
  - Pipeline processing where each stage depends on previous
  - Rate-limited API calls that must be sequential

#### Use `Effect.forEach` When:
- Processing **collections** with controlled concurrency
- You want to limit parallel operations (e.g., max 5 concurrent requests)
- Each item needs the same transformation
- Examples:
  - Processing user uploads with concurrency limit
  - Bulk data transformation
  - Paginated API fetching with rate limits

#### Use Fiber Management When:
- You need **fine-grained control** over background tasks
- Tasks should run independently but may need coordination
- You want to explicitly join/interrupt/await fibers
- Examples:
  - Background data synchronization
  - Long-running workers that can be cancelled
  - Parallel computations where you need partial results

### Decision Flowchart: Race vs Parallel vs Sequential

```
Do you need results from all operations?
│
├─ NO → Do you want the fastest result?
│       │
│       ├─ YES → Use Effect.race()
│       │         - First successful result wins
│       │         - Losers are interrupted
│       │         - Good for timeouts & redundancy
│       │
│       └─ NO → Use Fiber Management
│                 - Fork independent tasks
│                 - Join when needed
│                 - Manual control over lifecycle
│
└─ YES → Are operations independent?
         │
         ├─ YES → Do you have resource constraints?
         │        │
         │        ├─ YES → Use Effect.forEach with limited concurrency
         │        │         - Control max parallel operations
         │        │         - Prevent resource exhaustion
         │        │         - Example: { concurrency: 5 }
         │        │
         │        └─ NO → Use Effect.all({ concurrency: "unbounded" })
         │                  - Maximum parallelism
         │                  - All operations run simultaneously
         │                  - Fastest total execution time
         │
         └─ NO (dependent) → Use Effect.all({ concurrency: 1 })
                             - Sequential execution
                             - Guaranteed order
                             - Later operations can use earlier results
```

### Timing Comparison Table

This table shows the execution time benefits of different concurrency patterns when processing 5 tasks that each take 100ms:

| Pattern | Configuration | Total Time | Use Case |
|---------|--------------|------------|----------|
| Sequential | `{ concurrency: 1 }` | ~500ms | Operations must run in order |
| Limited Parallel | `{ concurrency: 2 }` | ~300ms | Limited resources (DB connections, API rate limits) |
| Limited Parallel | `{ concurrency: 3 }` | ~200ms | Balance between speed and resource usage |
| Full Parallel | `{ concurrency: "unbounded" }` | ~100ms | Independent operations, no resource constraints |
| Race | `Effect.race(...)` | ~100ms | Only need first result, not all results |

**Key Insight**: Full parallelism provides 5x speedup for independent tasks, but limited concurrency is often necessary for resource management.

**Real Example**:
```typescript
// Sequential: 500ms total
await Effect.all([
  fetchUser(1),    // 100ms
  fetchUser(2),    // 100ms  (starts after #1 completes)
  fetchUser(3),    // 100ms  (starts after #2 completes)
  fetchUser(4),    // 100ms  (starts after #3 completes)
  fetchUser(5),    // 100ms  (starts after #4 completes)
], { concurrency: 1 })

// Full Parallel: 100ms total
await Effect.all([
  fetchUser(1),    // 100ms \
  fetchUser(2),    // 100ms  |
  fetchUser(3),    // 100ms  ├─ All run simultaneously
  fetchUser(4),    // 100ms  |
  fetchUser(5),    // 100ms /
], { concurrency: "unbounded" })
```

### Jitter Strategy Trade-offs

Different jitter strategies offer different benefits for retry scenarios:

| Strategy | Configuration | Delay Range | Best For | Trade-offs |
|----------|--------------|-------------|----------|-----------|
| **Full Jitter** | `Schedule.jittered()` | 0% - 100% of base delay | High load scenarios, thundering herd prevention | Maximum spread, but can retry very quickly |
| **Equal Jitter** | `Schedule.jittered({ min: 0.5, max: 1.0 })` | 50% - 100% of base delay | Balanced retry timing | Good compromise between speed and spread |
| **Decorrelated Jitter** | Custom implementation | Variable based on previous | AWS recommended approach | More complex, better distribution |
| **No Jitter** | No jitter applied | Exactly base delay | Testing, predictable timing | Thundering herd risk |
| **Small Jitter** | `Schedule.jittered({ min: 0.9, max: 1.1 })` | ±10% variation | Slight randomization | Minimal spread, less effective |
| **Custom Range** | `Schedule.jittered({ min: 0.8, max: 1.5 })` | Custom range | Specific use cases | Flexible but requires tuning |

**When to Use Each**:

1. **Full Jitter** (`Schedule.jittered()`)
   - **Use**: Distributed systems with many clients
   - **Scenario**: 1000 users hitting your API, service goes down, all retry
   - **Why**: Maximum spread prevents all clients from retrying simultaneously
   - **Example**: Public APIs, cloud services, high-scale applications

2. **Equal Jitter** (`min: 0.5, max: 1.0`)
   - **Use**: Moderate load systems
   - **Scenario**: Internal microservices with 10-100 clients
   - **Why**: Balances retry speed with spread
   - **Example**: Microservice communication, database retries

3. **No Jitter**
   - **Use**: Development, testing, or single-client scenarios
   - **Scenario**: Local development, unit tests, debugging
   - **Why**: Predictable timing helps with debugging
   - **Example**: Test suites, local scripts

**Real-World Impact**:
```typescript
// Without jitter - Thundering Herd Problem:
// Time: 0ms   - All 100 clients try request → Service overload
// Time: 100ms - All 100 clients retry → Service overload again
// Time: 200ms - All 100 clients retry → Service overload again

// With full jitter:
// Time: 0ms   - All 100 clients try request → Service overload
// Time: 0-100ms - Clients retry at random times → Load spread out
// Time: 0-200ms - Clients retry at random times → Load spread out
```

### Common Pitfalls

#### 1. Using Sequential When Parallel Would Work
```typescript
// BAD: Sequential execution (500ms total)
const results = await Effect.all([
  fetchUserProfile(userId),
  fetchUserSettings(userId),
  fetchUserPreferences(userId)
], { concurrency: 1 })  // Unnecessarily slow!

// GOOD: Parallel execution (100ms total)
const results = await Effect.all([
  fetchUserProfile(userId),
  fetchUserSettings(userId),
  fetchUserPreferences(userId)
], { concurrency: "unbounded" })
```

#### 2. Unlimited Concurrency with Limited Resources
```typescript
// BAD: Might exhaust database connections
await Effect.forEach(
  thousandsOfItems,
  item => saveToDatabase(item),
  { concurrency: "unbounded" }  // Could open 1000s of DB connections!
)

// GOOD: Limit concurrent database operations
await Effect.forEach(
  thousandsOfItems,
  item => saveToDatabase(item),
  { concurrency: 10 }  // Respects DB connection pool limit
)
```

#### 3. Forgetting to Handle Race Losers
```typescript
// BAD: Resources might not clean up properly
Effect.race(
  fetchFromCache(),      // If this loses, does it clean up?
  fetchFromDatabase()    // If this loses, is DB connection closed?
)

// GOOD: Use Effect.ensuring or Effect.acquireUseRelease
Effect.race(
  pipe(fetchFromCache(), Effect.ensuring(cleanupCache)),
  pipe(fetchFromDatabase(), Effect.ensuring(closeConnection))
)
```

#### 4. Not Using Jitter in Distributed Systems
```typescript
// BAD: All clients retry at same time
const retrySchedule = Schedule.exponential(Duration.millis(100))
// 100ms, 200ms, 400ms, 800ms... (all clients synchronized!)

// GOOD: Clients retry at random times
const retrySchedule = pipe(
  Schedule.exponential(Duration.millis(100)),
  Schedule.jittered()  // Prevents thundering herd
)
```

#### 5. Using Effect.race for Operations with Side Effects
```typescript
// PROBLEMATIC: Both operations write to database
Effect.race(
  updateUserInDatabase(userId, newData),
  updateUserInDatabase(userId, otherData)
)
// Race winner writes, loser is interrupted - but both might partially write!

// BETTER: Use Effect.race only for read operations or idempotent writes
Effect.race(
  fetchUserFromCache(userId),
  fetchUserFromDatabase(userId)
)
```

#### 6. Ignoring Interruption in Long-Running Tasks
```typescript
// BAD: Task ignores interruption signals
const longTask = Effect.gen(function* (_) {
  for (let i = 0; i < 1000000; i++) {
    yield* _(processItem(i))  // No interruption checkpoints
  }
})

// GOOD: Make tasks interruptible
const longTask = Effect.gen(function* (_) {
  for (let i = 0; i < 1000000; i++) {
    yield* _(Effect.yieldNow())  // Allow interruption
    yield* _(processItem(i))
  }
})
```

#### 7. Not Capping Retry Delays
```typescript
// BAD: Exponential backoff without cap
const retrySchedule = Schedule.exponential(Duration.millis(100))
// 100ms, 200ms, 400ms, 800ms, 1.6s, 3.2s, 6.4s, 12.8s, 25.6s...
// After 10 retries: waiting over 1 minute between attempts!

// GOOD: Cap maximum delay
const retrySchedule = pipe(
  Schedule.exponential(Duration.millis(100)),
  Schedule.jittered(),
  Schedule.either(Schedule.spaced(Duration.seconds(5))),  // Max 5s delay
  Schedule.compose(Schedule.recurs(10))  // Max 10 retries
)
```

### Real-World Scenario Mappings

#### Scenario: User Dashboard Loading
**Challenge**: Load user profile, settings, notifications, and recent activity.

**Solution**: Parallel execution with `Effect.all`
```typescript
const loadDashboard = (userId: string) => Effect.all([
  fetchUserProfile(userId),      // Independent
  fetchUserSettings(userId),     // Independent
  fetchNotifications(userId),    // Independent
  fetchRecentActivity(userId)    // Independent
], { concurrency: "unbounded" })

// Result: 4x faster than sequential loading
```

#### Scenario: API with Cache Fallback
**Challenge**: Try cache first, fallback to API if cache miss.

**Solution**: `Effect.race` with timeout
```typescript
const getUserData = (userId: string) =>
  Effect.race(
    fetchFromCache(userId),
    pipe(
      Effect.sleep(Duration.millis(50)),  // Give cache 50ms head start
      Effect.flatMap(() => fetchFromAPI(userId))
    )
  )

// Result: Ultra-fast for cache hits, graceful fallback for misses
```

#### Scenario: Bulk Data Import
**Challenge**: Import 10,000 records into database without overwhelming it.

**Solution**: `Effect.forEach` with limited concurrency
```typescript
const importRecords = (records: Record[]) =>
  Effect.forEach(
    records,
    record => insertIntoDatabase(record),
    { concurrency: 5 }  // Respect DB connection pool
  )

// Result: Efficient processing without resource exhaustion
```

#### Scenario: Microservice Health Check
**Challenge**: Check if service is healthy, retry with backoff if down.

**Solution**: Retry with jittered exponential backoff
```typescript
const healthCheck = pipe(
  checkServiceHealth(),
  Effect.retry(
    pipe(
      Schedule.exponential(Duration.millis(100)),
      Schedule.jittered(),  // Prevent thundering herd if many instances checking
      Schedule.compose(Schedule.recurs(5))
    )
  )
)

// Result: Resilient health checking without overloading recovering services
```

#### Scenario: File Upload with Timeout
**Challenge**: Upload file but fail if takes more than 30 seconds.

**Solution**: `Effect.race` with timeout
```typescript
const uploadWithTimeout = (file: File) =>
  Effect.race(
    uploadFile(file),
    pipe(
      Effect.sleep(Duration.seconds(30)),
      Effect.flatMap(() => Effect.fail(new TimeoutError("Upload timeout")))
    )
  )

// Result: User gets feedback if upload is stuck
```

#### Scenario: Multi-Step Wizard
**Challenge**: User registration wizard: validate email → create account → send welcome email.

**Solution**: Sequential execution with `Effect.all`
```typescript
const registerUser = (email: string, password: string) => Effect.all([
  validateEmail(email),
  Effect.flatMap(() => createAccount(email, password)),
  Effect.flatMap(account => sendWelcomeEmail(account.email))
], { concurrency: 1 })

// Alternative: Use Effect.gen for clearer step-by-step flow
const registerUser = (email: string, password: string) => Effect.gen(function* (_) {
  yield* _(validateEmail(email))
  const account = yield* _(createAccount(email, password))
  yield* _(sendWelcomeEmail(account.email))
  return account
})

// Result: Clear ordered flow, each step depends on previous
```

#### Scenario: Aggregating Data from Multiple APIs
**Challenge**: Fetch weather, news, and stock data from different APIs.

**Solution**: `Effect.all` with timeouts for each
```typescript
const aggregateDashboard = Effect.all([
  Effect.race(fetchWeather(), timeout(5000)),
  Effect.race(fetchNews(), timeout(5000)),
  Effect.race(fetchStocks(), timeout(5000))
], { concurrency: "unbounded" })

// Result: Fast parallel fetching, no single slow API blocks others
```

#### Scenario: Background Job with Cancellation
**Challenge**: Start data sync job, allow user to cancel it.

**Solution**: Fiber management with interruption
```typescript
const startSyncJob = Effect.gen(function* (_) {
  const fiber = yield* _(Effect.fork(syncLargeDataset()))

  // User can cancel
  yield* _(waitForCancelSignal())
  yield* _(Fiber.interrupt(fiber))

  // Or wait for completion
  const result = yield* _(Fiber.join(fiber))
  return result
})

// Result: User has control over long-running operations
```

## Project Structure

```
├── src/
│   ├── index.ts             # Main examples and implementations
│   ├── schemas.ts           # Effect Schema definitions
│   ├── concurrency.ts       # Concurrency patterns examples
│   ├── scheduling.ts        # Scheduling and jittered delays
│   ├── streaming.ts         # Stream processing patterns
│   ├── index.test.ts        # Tests for basic examples
│   ├── concurrency.test.ts  # Tests for concurrency patterns
│   ├── scheduling.test.ts   # Tests for scheduling patterns
│   └── streaming.test.ts    # Tests for stream processing
├── dist/                    # Compiled output
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Running Examples

To see the examples in action:

```bash
# Build and run
npm run build
node dist/index.js
```

## Testing

The project includes comprehensive tests for all functions and error scenarios:

```bash
npm test
```

## License

MIT