import { Effect, Console, pipe } from "effect"
import { User, parseUser } from "./schemas"

// Type aliases to reduce duplication
type Fx<A, E = never> = Effect.Effect<A, E>
type AsyncFx<A, E = Error> = Effect.Effect<A, E>

// Error classes
export class NetworkError {
  readonly _tag = "NetworkError"
  constructor(readonly message: string) {}
}

export class ValidationError {
  readonly _tag = "ValidationError" 
  constructor(readonly message: string) {}
}

// Example functions
export const fetchUser = (id: number): Fx<User, NetworkError> => {
  if (id <= 0) {
    return Effect.fail(new NetworkError("Invalid user ID"))
  }
  
  return Effect.succeed({
    id,
    name: `User ${id}`,
    email: `user${id}@example.com`
  })
}

// Validates untrusted data and returns a validated User
export const validateUser = (user: User): Fx<User, ValidationError> => {
  return pipe(
    parseUser(user),
    Effect.mapError(error => new ValidationError(
      `User validation failed: ${error.message}`
    ))
  )
}

export const processUser = (id: number) => pipe(
  fetchUser(id),
  Effect.flatMap(validateUser),
  Effect.tap(user => Console.log(`Processing user: ${user.name}`))
)

export const safeProcessUser = (id: number) => pipe(
  processUser(id),
  Effect.catchAll(error => {
    switch (error._tag) {
      case "NetworkError":
        return Effect.succeed({ error: "Network issue occurred" })
      case "ValidationError":
        return Effect.succeed({ error: "Validation failed" })
    }
  })
)

// Database connection simulator
export interface DatabaseConnection {
  query: (sql: string) => Promise<any[]>
  close: () => void
}

// Resource management helper for database connections
export const createWithDatabaseConnection = (logger: (msg: string) => void = console.log) => 
  <A, E>(operation: (db: DatabaseConnection) => Fx<A, E>) =>
    Effect.acquireUseRelease(
      // Acquire: Open database connection
      Effect.sync(() => {
        logger("  📂 Opening database connection")
        const connection: DatabaseConnection = {
          query: async (sql) => {
            logger(`  🔍 Executing query: ${sql}`)
            // Simulate database query
            return [{ id: 1, name: "Sample Result" }]
          },
          close: () => logger("  ✅ Connection closed")
        }
        return connection
      }),
      // Use: Execute the operation with the connection
      connection => operation(connection),
      // Release: Close the connection (always runs, even on error)
      connection => Effect.sync(() => {
        logger("  📁 Closing database connection")
        connection.close()
      })
    )

// Default withDatabaseConnection using console.log
export const withDatabaseConnection = createWithDatabaseConnection()

// Main runner function
async function main() {
  console.log("=== Effect Library Examples ===\n")

  try {
    // Example 1: Basic success case
    console.log("1. Processing valid user:")
    const result1 = await Effect.runPromise(safeProcessUser(1))
    console.log("Result:", result1)
    console.log()

    // Example 2: Error case (invalid ID)
    console.log("2. Processing invalid user ID:")
    const result2 = await Effect.runPromise(safeProcessUser(-1))
    console.log("Result:", result2)
    console.log()

    // Example 3: Generator syntax
    console.log("3. Using generator syntax:")
    const generatorExample = Effect.gen(function* (_) {
      const user = yield* _(fetchUser(2))
      const validated = yield* _(validateUser(user))
      yield* _(Console.log(`Generator processed: ${validated.name}`))
      return validated
    })
    
    const result3 = await Effect.runPromise(generatorExample)
    console.log("Generator result:", result3)
    console.log()

    // Example 4: Combining multiple effects
    console.log("4. Combining multiple effects:")
    const combineEffects = pipe(
      Effect.all([
        Effect.succeed(10),
        Effect.succeed(20),
        Effect.succeed(30)
      ]),
      Effect.map(numbers => numbers.reduce((a, b) => a + b, 0)),
      Effect.tap(sum => Console.log(`Sum: ${sum}`))
    )
    
    const result4 = await Effect.runPromise(combineEffects)
    console.log("Combined result:", result4)
    console.log()

    // Example 5: Resource management with database connection
    console.log("5. Resource management (Database Connection):")
    
    // Define the database operation
    const databaseOperation = (db: DatabaseConnection) => pipe(
      Effect.promise(() => db.query("SELECT * FROM users")),
      Effect.tap(results => Console.log(`  ⚡ Query returned ${results.length} results`)),
      Effect.map(results => results[0])
    )

    const result5 = await Effect.runPromise(withDatabaseConnection(databaseOperation))
    console.log("  Query result:", result5)
    console.log()

  } catch (error) {
    console.error("Unexpected error:", error)
  }
}

// Run the examples only when not testing
if (process.env.NODE_ENV !== 'test' && require.main === module) {
  main().catch(console.error)
}