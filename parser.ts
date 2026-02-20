import { Lexer } from "./lexer.js"
import * as Tokens from "./tokens.js"

export const parse = (input: string): Tokens.Token => {
	const nums: Tokens.ValueToken[] = []
	const ops: Tokens.OperatorToken[] = []
	const lexer = new Lexer(input)

	let last_was_value = false

	function last_of<T extends Tokens.ValueToken | Tokens.OperatorToken>(list: T[]): T | undefined {
		return list.at(-1)
	}

	function collapse_once(at_index: number): void {
		if (ops.length === 0) {
			throw new EvalError(`Parsing error at ${at_index}: operator stack empty when trying to collapse`)
		}
		if (nums.length < 2) {
			throw new SyntaxError(`Syntax error at ${at_index}: too few operands for operator '${last_of(ops)!.raw}'`)
		}
		const op = ops.pop()!
		if (op.kind === "l_paren" || op.kind === "r_paren") {
			throw Tokens.parens_operated
		}
		const right = nums.pop()!
		const left = nums.pop()!
		if (op.kind === "div" && right.value === 0) {
			throw new EvalError(`Cannot divide by 0: '${left.value} ${op.raw} ${right.value}'`)
		}
		const resulting_kind = Tokens.binary_op_table[left.kind][op.kind][right.kind]
		if (!resulting_kind) throw new Error(`Unsupported operation: '${left.kind} ${op.raw} ${right.kind}'`)
		nums.push(new Tokens.val_kind_to_ctor[resulting_kind](op.operate(left.value, right.value)))
		last_was_value = true
	}

	for (let [index, token] of lexer.lexinate()) {
		if (token instanceof Tokens.ValueToken) {
			if (last_was_value) throw new SyntaxError(`Syntax error at ${index}: unexpected value '${token.value}'`)
			nums.push(token)
			last_was_value = true
			continue
		}

		if (token instanceof Tokens.OperatorToken) {
			if (token.kind === "l_paren") {
				if (last_was_value) {
					throw new SyntaxError(`Syntax error at ${index}: unexpected '(' after a value`)
				}
				ops.push(token)
				last_was_value = false
				continue
			}

			if (token.kind === "r_paren") {
				if (!last_was_value) {
					throw new SyntaxError(
						`Syntax error at ${index}: empty parentheses or operator immediately before ')'`,
					)
				}
				while (ops.length > 0 && last_of(ops)!.kind !== "l_paren") {
					collapse_once(index)
				}
				if (ops.length === 0) throw new SyntaxError(`Syntax error at ${index}: unmatched ')'`)
				ops.pop()
				last_was_value = true
				continue
			}

			const is_unary = !last_was_value && (token.kind === "plus" || token.kind === "sub")
			if (!is_unary && !last_was_value) {
				throw new SyntaxError(`Syntax error at ${index}: unexpected operator '${token.raw}'`)
			}
			if (is_unary) {
				nums.push(new Tokens.NumToken(0))
				token.unary = true
			}

			while (
				ops.length > 0
				&& last_of(ops)!.kind !== "l_paren"
				&& (token.unary
					? last_of(ops)!.precedence > token.precedence
					: last_of(ops)!.precedence >= token.precedence
				)
			) {
				collapse_once(index)
			}

			ops.push(token)
			last_was_value = false
			continue
		}
	}

	if (!last_was_value) {
		throw new SyntaxError("Syntax error at end of input: expression cannot end with an operator")
	}

	while (ops.length > 0) {
		if (last_of(ops)!.kind === "l_paren") {
			throw new SyntaxError("Syntax error: unmatched '('")
		}
		collapse_once(input.length)
	}

	if (nums.length !== 1) {
		throw new SyntaxError(`Syntax error: malformed expression (expected single result, got ${nums.length} values)`)
	}

	return nums[0]!
}
