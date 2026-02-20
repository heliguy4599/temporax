import readline from "readline"
// import { parse } from "./parser.js"
import { Parser2 } from "./parser2.js"

async function main(): Promise<void> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		terminal: true,
	})

	const question = (prompt: string): Promise<string> => new Promise((resolve) => rl.question(prompt, resolve))

	console.log("===[ Algebraic Calculator | Type an expression, or type 'quit' or 'exit' to exit ]===")

	while (true) {
		const input = await question("> ")
		const trimmed = input.trim()
		if (!trimmed) continue

		if (["quit", "exit"].includes(trimmed.toLowerCase())) {
			console.log("Exit.")
			break
		}

		try {
			const result = new Parser2(input).evaluate()
			console.log("=", result)
		} catch (err) {
			console.log("!", err instanceof Error ? err.message : err)
		}
	}

	rl.close()
}

main().catch((err) => {
	console.error("Fatal error:", err instanceof Error ? err.message : err)
	process.exit(1)
})
