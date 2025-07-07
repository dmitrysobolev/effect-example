# Effect Library Examples

A TypeScript project demonstrating practical usage patterns of the [Effect](https://effect.website/) library for functional programming with typed errors and resource management.

## Overview

This project showcases various Effect library patterns including:
- Error handling with typed errors
- Effect composition using pipe
- Generator syntax for Effects
- Resource management with acquire/use/release pattern
- Combining multiple effects

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

## Project Structure

```
├── src/
│   ├── index.ts          # Main examples and implementations
│   └── __tests__/        # Test files
├── dist/                 # Compiled output
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