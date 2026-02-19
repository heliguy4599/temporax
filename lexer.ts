import * as Tokens from "tokens.js"

export class Lexer {
	readonly input: string
	readonly length: number
	index = 0

	constructor(input: Lexer["input"]) {
		this.input = input
		this.length = input.length
	}

	*lexinate(): Generator<[index: number, token: Tokens.Token]> {
		while (true) {
			this.#skip_whitespace()
			if (this.index >= this.length) break

			let found = false
			for (const tryer of Tokens.tryers) {
				const result = tryer(this.input, this.index)
				if (!result) continue
				if (result.new_index <= this.index) {
					throw new Error(`Lexer error at char: ${this.index}: token '${
						result.token.constructor.name
					}' did not consume input`)
				}
				yield [this.index, result.token]
				this.index = result.new_index
				found = true
				break
			}

			if (!found) {
				throw new Error(`Unrecognized symbol '${this.input[this.index]}'... at char-index ${this.index}`)
			}
		}
	}

	#skip_whitespace(): void {
		while (true) {
			const ch: string | undefined = this.input[this.index]
			if (ch === undefined || !/\s/.test(ch)) break
			this.index += 1
		}
	}
}
