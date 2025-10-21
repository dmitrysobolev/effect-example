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

## Project Structure

```
├── src/
│   ├── index.ts             # Main examples and implementations
│   ├── schemas.ts           # Effect Schema definitions
│   ├── concurrency.ts       # Concurrency patterns examples
│   ├── index.test.ts        # Tests for basic examples
│   └── concurrency.test.ts  # Tests for concurrency patterns
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