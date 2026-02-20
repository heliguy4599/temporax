import { Lexer } from "./lexer.js"
import {
	ValueToken,
	OperatorToken,
	NumToken,
	parens_operated,
	binary_op_table,
	val_kind_to_ctor,
	unary_op_table,
} from "./tokens.js"

class TokenStack<T extends ValueToken | OperatorToken> {
	#items: T[] = []

	get length(): number {
		return this.#items.length
	}

	push(item: T): void {
		this.#items.push(item)
	}

	pop(): T {
		const to_ret: T | undefined = this.#items.pop()
		if (to_ret === undefined) throw new Error("Stack underflow from pop")
		return to_ret
	}

	peek(): T {
		const to_ret: T | undefined = this.#items.at(-1)
		if (to_ret === undefined) throw new Error("Stack underflow from peek")
		return to_ret
	}
}

export class Parser2 {
	readonly #input: string
	// readonly #length: number
	readonly #lexer
	readonly #operators = new TokenStack<OperatorToken>()
	readonly #values = new TokenStack<ValueToken>()
	#last_was_value = false

	constructor(input: string) {
		this.#input = input
		// this.#length = input.length
		this.#lexer = new Lexer(this.#input)
	}

	collapse(): void {
		const right: ValueToken = this.#values.pop()
		const op: OperatorToken = this.#operators.pop()
		let value: ValueToken
		if (op.kind === "l_paren" || op.kind === "r_paren") {
			throw parens_operated
		}
		if (op.unary) {
			const val_func = unary_op_table[op.kind]?.[right.kind]
			if (!val_func) {
				throw new EvalError(`Unsupported unary operation: '${op.raw} ${right.value}'`)
			}
			value = val_func(right)
		} else {
			const left: ValueToken = this.#values.pop()
			if (op.kind === "div" && right.value === 0) {
				throw new EvalError(`Cannot divide by 0: '${left.value} ${op.raw} ${right.value}'`)
			}
			const resulting_kind = binary_op_table[left.kind][op.kind][right.kind]
			if (!resulting_kind) {
				throw new EvalError(`Unsupported operation: '${left.kind} ${op.raw} ${right.kind}'`)
			}
			value = new val_kind_to_ctor[resulting_kind](op.operate(left.value, right.value))
		}
		this.#values.push(value)
	}

	evaluate(): ValueToken {
		for (const [, token] of this.#lexer.lexinate()) {
			if (token instanceof ValueToken) {
				this.#values.push(token)
				this.#last_was_value = true
				continue
			} else if (!(token instanceof OperatorToken)) {
				// throw new Error(`Unrecognized Token type: ${token}`)
				continue
			} // 'token' IS OperatorToken now!

			if (token.kind === "l_paren") {
				if (this.#last_was_value) {
					throw new SyntaxError(`Unexpected '(' after value: '${this.#values.peek().value}'`)
				}
				this.#operators.push(token)
				this.#last_was_value = false
				continue
			}

			if (token.kind === "r_paren") {
				while (this.#operators.length > 0 && this.#operators.peek().kind !== "l_paren") {
					this.collapse()
				}
				if (this.#operators.length === 0) {
					throw new SyntaxError("Unmatched ')'")
				}
				this.#operators.pop() // pop the r_paren
				this.#last_was_value = true
				continue
			}

			const is_unary: boolean = !this.#last_was_value && (token.kind === "plus" || token.kind === "sub")
			if (!is_unary && !this.#last_was_value) {
				throw new SyntaxError(`Unexpected operator: '${token.raw}'`)
			}
			if (is_unary) {
				token.unary = true
				token.precedence = 3
			}

			while (
				this.#operators.length > 0
				&& this.#operators.peek().kind !== "l_paren"
				&& (token.unary
					? this.#operators.peek().precedence > token.precedence
					: this.#operators.peek().precedence >= token.precedence
				)
			) {
				this.collapse()
			}

			this.#operators.push(token)
			this.#last_was_value = false
		}

		if (!this.#last_was_value) {
			throw new SyntaxError("Expression cannot end with an operator")
		}

		while (this.#operators.length > 0) {
			if (this.#operators.peek().kind === "l_paren") {
				throw new SyntaxError("Unmatched '('")
			}
			this.collapse()
		}

		if (this.#values.length !== 1) {
			throw new SyntaxError(
				`Syntax error: malformed expression (expected single result, got ${this.#values.length} values)`,
			)
		}

		return this.#values.pop()
	}
}
