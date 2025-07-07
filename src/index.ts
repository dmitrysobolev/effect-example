import { Effect, Console, pipe } from "effect"

// Type aliases to reduce duplication
type Fx<A, E = never> = Effect.Effect<A, E>
type AsyncFx<A, E = Error> = Effect.Effect<A, E>

// Error classes
class NetworkError {
  readonly _tag = "NetworkError"
  constructor(readonly message: string) {}
}

class ValidationError {
  readonly _tag = "ValidationError" 
  constructor(readonly message: string) {}
}

interface User {
  id: number
  name: string
  email: string
}

// Example functions
const fetchUser = (id: number): Fx<User, NetworkError> => {
  if (id <= 0) {
    return Effect.fail(new NetworkError("Invalid user ID"))
  }
  
  return Effect.succeed({
    id,
    name: `User ${id}`,
    email: `user${id}@example.com`
  })
}

const validateUser = (user: User): Fx<User, ValidationError> => {
  if (!user.email.includes("@")) {
    return Effect.fail(new ValidationError("Invalid email format"))
  }
  return Effect.succeed(user)
}

const processUser = (id: number) => pipe(
  fetchUser(id),
  Effect.flatMap(validateUser),
  Effect.tap(user => Console.log(`Processing user: ${user.name}`))
)

const safeProcessUser = (id: number) => pipe(
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

    // Example 5: Resource management simulation
    console.log("5. Resource management:")
    const withResource = <A>(operation: Fx<A>) =>
      Effect.acquireUseRelease(
        Effect.sync(() => {
          console.log("  📂 Opening resource")
          return { connected: true }
        }),
        _ => operation,
        _ => Effect.sync(() => {
          console.log("  📁 Closing resource")
        })
      )

    const resourceOperation = pipe(
      Effect.succeed("Resource operation completed"),
      Effect.tap(msg => Console.log(`  ⚡ ${msg}`))
    )

    await Effect.runPromise(withResource(resourceOperation))
    console.log()

  } catch (error) {
    console.error("Unexpected error:", error)
  }
}

// Run the examples
main().catch(console.error)