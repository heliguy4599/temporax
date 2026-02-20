import {
	parse_chars,
	finite_or_throw,
	duration_suffix_to_mult,
	duration_suffixes_to_unit,
	type DurationUnit,
} from "utils.js"

export type LexResult<T extends Token> = {
	token: T,
	new_index: number,
}

export type ValueKind = (
	| "num"
	| "date"
	| "time"
	| "duration"
)

export type OpKind = (
	| "plus"
	| "sub"
	| "mult"
	| "div"
	| "l_paren"
	| "r_paren"
)

export type OperatorSpec = {
	raw: string,
	precedence: number,
	operate(left: number, right: number): number,
}

export abstract class Token {
	static try_lex(input: string, index: number): LexResult<Token> | null {
		void input, index
		throw new Error(`${this.name} did not implement static 'try_lex'!`)
	}
}

export abstract class ValueToken extends Token {
	abstract readonly kind: ValueKind
	readonly value: number
	constructor(value: number) {
		super()
		this.value = value
	}
}

export class NumToken extends ValueToken {
	static override try_lex(input: string, index: number): LexResult<NumToken> | null {
		const matches = parse_chars(
			input,
			index,
			{ pattern: /\d/, min: 0, max: Infinity },
			{ pattern: ".", min: 0 },
			{ pattern: /\d/, min: 0, max: Infinity },
		)
		if (!matches) return null
		const int_part = matches.parts[0]
		const dot = matches.parts[1]
		const frac_part = matches.parts[2]
		if (dot && !frac_part) return null
		const value = finite_or_throw(`${int_part || "0"}.${frac_part || "0"}`)
		return { token: new NumToken(value), new_index: matches.new_index }
	}

	override readonly kind = "num"
}

const month_max_days = {
	yes_leap_year: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
	// not_leap_year: [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
} as const

class DateToken extends ValueToken {
	static override try_lex(input: string, index: number): LexResult<DateToken> | null {
		const matches = parse_chars(
			input,
			index,
			{ pattern: /\d/, min: 4, max: 4 },
			{ pattern: "_" },
			{ pattern: /\d/, min: 1, max: 2 },
			{ pattern: "_" },
			{ pattern: /\d/, min: 1, max: 2 },
		)
		if (!matches) return null
		const year = finite_or_throw(matches.parts[0], `Invalid date number '${matches.parts[0]}`)
		const month = finite_or_throw(matches.parts[2], `Invalid month number '${matches.parts[2]}`)
		const day = finite_or_throw(matches.parts[4], `Invalud day number '${matches.parts[4]}`)

		if (month < 1 || month > 12) throw new RangeError(`Invalid month number '${month}'`)
		if (day < 1 || day > month_max_days.yes_leap_year[month - 1]!) {
			throw new RangeError(`Invalid day number '${day}' for month '${month}'`)
		}

		const ms = Date.UTC(year, month - 1, day)
		return { token: new DateToken(ms), new_index: matches.new_index }
	}

	override readonly kind = "date"
}

type TimeSuffixes = "AM" | "PM"

class TimeToken extends ValueToken {
	static readonly suffixes: Record<string, TimeSuffixes> = {
		a: "AM",
		am: "AM",
		p: "PM",
		pm: "PM",
	}

	static readonly suffix_to_hours_add: { [Suffix in TimeSuffixes]: number } = {
		AM: 0,
		PM: 12,
	}

	static readonly #regex_suffixes = new RegExp(
		Object.keys(this.suffixes)
		.sort((a, b) => b.length - a.length)
		.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) // escape regex chars
		.join("|"),
		"i", // case insensitive
	)

	static override try_lex(input: string, index: number): LexResult<TimeToken> | null {
		const matches = parse_chars(
			input,
			index,
			{ pattern: /\d/, max: 2 },
			{ pattern: ":" },
			{ pattern: /\d/, min: 2, max: 2 },
			{ pattern: this.#regex_suffixes, min: 0 },
		)
		if (!matches) return null
		const hours = matches.parts[0]
		const minutes = matches.parts[2]
		const hours_value = finite_or_throw(hours, `Invalid hour number '${hours}'`)
		const minutes_value = finite_or_throw(minutes, `Invalid minute number '${minutes}'`)
		if (hours_value < 0) throw new RangeError(`Inavlid hour value '${hours_value}'`)
		if (minutes_value < 0) throw new RangeError(`Invalid minutes value '${minutes_value}'`)
		const suffix_str = matches.parts[3].toLowerCase()
		let to_add = 0
		if (suffix_str) {
			const suffix = this.suffixes[suffix_str]
			if (!suffix) throw new SyntaxError(`Invalid time suffix '${suffix_str}'`)
			to_add = this.suffix_to_hours_add[suffix]
			// TODO: validate hours when using suffixes.
			//   Disallow 0:00a when a suffix is present, instead require 12:00a
		}
		const hours_millis = (hours_value + to_add) * duration_suffix_to_mult["HOUR"]
		const minute_millis = minutes_value * duration_suffix_to_mult["MINUTE"]
		return { token: new TimeToken(hours_millis + minute_millis), new_index: matches.new_index }
	}

	override readonly kind = "time"
}

class DurationToken extends ValueToken {
	static readonly #regex_suffixes = new RegExp(
		Object.keys(duration_suffixes_to_unit)
		.sort((a, b) => b.length - a.length)
		.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) // escape regex chars
		.join("|"),
		"i", // case insensitive
	)

	static override try_lex(input: string, index: number): LexResult<DurationToken> | null {
		const num_token_match = NumToken.try_lex(input, index)
		if (!num_token_match) return null
		const suffix_match = parse_chars(
			input,
			num_token_match.new_index,
			{ pattern: this.#regex_suffixes },
		)
		if (!suffix_match) return null
		const suffix = suffix_match.parts[0]
		const unit = duration_suffixes_to_unit[suffix]
		if (!unit) throw new SyntaxError(`Invalid duration suffix '${suffix}'`)
		const multiplier = duration_suffix_to_mult[unit]
		return {
			token: new DurationToken(num_token_match.token.value * multiplier),
			new_index: suffix_match.new_index,
		}
	}

	override readonly kind = "duration"

	constructor(value: number) {
		super(value)
	}
}

function parse_digits(input: string, index: number, { min_digits, max_digits } = { min_digits: 1, max_digits: 2 }): {
	readonly value: number,
	readonly raw: string,
	readonly new_index: number,
} | null {
	const length = input.length
	let raw = ""
	while (index < length && raw.length <= max_digits && /\d/.test(input[index]!)) {
		raw += input[index]!
		index += 1
	}
	if (raw.length < min_digits) return null
	return { value: Number(raw), raw, new_index: index }
}

export const parens_operated = new SyntaxError("Parenthesis cannot be operated upon")

const operator_specs: { [K in OpKind]: OperatorSpec } = {
	l_paren: { raw: "(", precedence: 0, operate: () => { throw parens_operated } },
	r_paren: { raw: ")", precedence: 0, operate: () => { throw parens_operated } },
	plus: { raw: "+", precedence: 1, operate: (left, right) => left + right },
	sub: { raw: "-", precedence: 1, operate: (left, right) => left - right },
	mult: { raw: "*", precedence: 2, operate: (left, right) => left * right },
	div: { raw: "/", precedence: 2, operate: (left, right) => left / right },
} as const

export class OperatorToken extends Token {
	static override try_lex(input: string, index: number): LexResult<OperatorToken> | null {
		const char: string | undefined = input[index]
		if (index >= input.length || !char) return null
		for (const [kind, spec] of Object.entries(operator_specs)) {
			if (char !== spec.raw) continue
			return {
				token: new OperatorToken(kind as OpKind, spec.operate),
				new_index: index + 1,
			}
		}
		return null
	}

	readonly kind: OpKind
	readonly raw: string
	readonly precedence: number
	readonly operate: (left: number, right: number)=> number
	unary = false

	constructor(kind: OpKind, operate: (left: number, right: number)=> number) {
		super()
		this.kind = kind
		this.raw = operator_specs[kind].raw
		this.precedence = operator_specs[kind].precedence
		this.operate = operate
	}
}

export const tryers: ((input: string, index: number)=> (LexResult<Token> | null))[] = [
	DateToken.try_lex.bind(DateToken),
	TimeToken.try_lex.bind(TimeToken),
	DurationToken.try_lex.bind(DurationToken),
	NumToken.try_lex.bind(NumToken),
	OperatorToken.try_lex.bind(OperatorToken),
] as const

type AlgebraTable = {
	[Left in ValueKind]: {
		[Op in Exclude<OpKind, "l_paren" | "r_paren">]: {
			[Right in ValueKind]: ValueKind | null
		}
	}
}

/* eslint-disable */
export const algebra_table: AlgebraTable = {
	num: {
		plus: { num: "num",      date: null,       time: null,       duration: null       },
		sub:  { num: "num",      date: null,       time: null,       duration: null       },
		mult: { num: "num",      date: null,       time: null,       duration: "duration" },
		div:  { num: "num",      date: null,       time: null,       duration: null },
	},
	date: {
		plus: { num: null,       date: null,       time: null,       duration: "date"     },
		sub:  { num: null,       date: "duration", time: null,       duration: "date"     },
		mult: { num: null,       date: null,       time: null,       duration: null       },
		div:  { num: null,       date: null,       time: null,       duration: null       },
	},
	time: {
		plus: { num: null,       date: null,       time: null,       duration: "time"     },
		sub:  { num: null,       date: null,       time: "duration", duration: "time"     },
		mult: { num: null,       date: null,       time: null,       duration: null       },
		div:  { num: null,       date: null,       time: null,       duration: null       },
	},
	duration: {
		plus: { num: null,       date: "date",     time: "time",     duration: "duration" },
		sub:  { num: null,       date: null,       time: null,       duration: "duration" },
		mult: { num: "duration", date: null,       time: null,       duration: null       },
		div:  { num: "duration", date: null,       time: null,       duration: "num"      },
	},
} as const
/* eslint-enable */

export const val_kind_to_ctor = {
	num: NumToken,
	date: DateToken,
	time: TimeToken,
	duration: DurationToken,
} as const satisfies { [Kind in ValueKind]: new (...args: any[])=> ValueToken }
