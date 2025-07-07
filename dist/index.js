"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const effect_1 = require("effect");
// Error classes
class NetworkError {
    message;
    _tag = "NetworkError";
    constructor(message) {
        this.message = message;
    }
}
class ValidationError {
    message;
    _tag = "ValidationError";
    constructor(message) {
        this.message = message;
    }
}
// Example functions
const fetchUser = (id) => {
    if (id <= 0) {
        return effect_1.Effect.fail(new NetworkError("Invalid user ID"));
    }
    return effect_1.Effect.succeed({
        id,
        name: `User ${id}`,
        email: `user${id}@example.com`
    });
};
const validateUser = (user) => {
    if (!user.email.includes("@")) {
        return effect_1.Effect.fail(new ValidationError("Invalid email format"));
    }
    return effect_1.Effect.succeed(user);
};
const processUser = (id) => (0, effect_1.pipe)(fetchUser(id), effect_1.Effect.flatMap(validateUser), effect_1.Effect.tap(user => effect_1.Console.log(`Processing user: ${user.name}`)));
const safeProcessUser = (id) => (0, effect_1.pipe)(processUser(id), effect_1.Effect.catchAll(error => {
    switch (error._tag) {
        case "NetworkError":
            return effect_1.Effect.succeed({ error: "Network issue occurred" });
        case "ValidationError":
            return effect_1.Effect.succeed({ error: "Validation failed" });
    }
}));
// Main runner function
async function main() {
    console.log("=== Effect Library Examples ===\n");
    try {
        // Example 1: Basic success case
        console.log("1. Processing valid user:");
        const result1 = await effect_1.Effect.runPromise(safeProcessUser(1));
        console.log("Result:", result1);
        console.log();
        // Example 2: Error case (invalid ID)
        console.log("2. Processing invalid user ID:");
        const result2 = await effect_1.Effect.runPromise(safeProcessUser(-1));
        console.log("Result:", result2);
        console.log();
        // Example 3: Generator syntax
        console.log("3. Using generator syntax:");
        const generatorExample = effect_1.Effect.gen(function* (_) {
            const user = yield* _(fetchUser(2));
            const validated = yield* _(validateUser(user));
            yield* _(effect_1.Console.log(`Generator processed: ${validated.name}`));
            return validated;
        });
        const result3 = await effect_1.Effect.runPromise(generatorExample);
        console.log("Generator result:", result3);
        console.log();
        // Example 4: Combining multiple effects
        console.log("4. Combining multiple effects:");
        const combineEffects = (0, effect_1.pipe)(effect_1.Effect.all([
            effect_1.Effect.succeed(10),
            effect_1.Effect.succeed(20),
            effect_1.Effect.succeed(30)
        ]), effect_1.Effect.map(numbers => numbers.reduce((a, b) => a + b, 0)), effect_1.Effect.tap(sum => effect_1.Console.log(`Sum: ${sum}`)));
        const result4 = await effect_1.Effect.runPromise(combineEffects);
        console.log("Combined result:", result4);
        console.log();
        // Example 5: Resource management simulation
        console.log("5. Resource management:");
        const withResource = (operation) => effect_1.Effect.acquireUseRelease(effect_1.Effect.sync(() => {
            console.log("  📂 Opening resource");
            return { connected: true };
        }), _ => operation, _ => effect_1.Effect.sync(() => {
            console.log("  📁 Closing resource");
        }));
        const resourceOperation = (0, effect_1.pipe)(effect_1.Effect.succeed("Resource operation completed"), effect_1.Effect.tap(msg => effect_1.Console.log(`  ⚡ ${msg}`)));
        await effect_1.Effect.runPromise(withResource(resourceOperation));
        console.log();
    }
    catch (error) {
        console.error("Unexpected error:", error);
    }
}
// Run the examples
main().catch(console.error);
//# sourceMappingURL=index.js.map