import {
	parse_chars,
	finite_or_throw,
	duration_suffix_to_mult,
	duration_suffixes_to_unit,
	duration_unit_to_display,
	trim_float,
	is_leap_year,
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

	readonly #nominalinator = Symbol("unique token symbold")
}

export abstract class ValueToken extends Token {
	abstract readonly kind: ValueKind
	readonly value: number

	constructor(value: number) {
		super()
		this.value = value
	}

	abstract format(): string
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

	override format(): string {
		return trim_float(this.value)
	}
}

// TODO: Handle leap years!!!!!!!!!!!
const month_max_days = {
	yes_leap_year: [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
	not_leap_year: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
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
		const max_days = is_leap_year(year) ? month_max_days.yes_leap_year : month_max_days.not_leap_year

		if (month < 1 || month > 12) throw new RangeError(`Invalid month number '${month}'`)
		if (day < 1 || day > max_days[month - 1]!) {
			throw new RangeError(`Invalid day number '${day}' for month '${month}'`)
		}

		const ms = Date.UTC(year, month - 1, day)
		return { token: new DateToken(ms, true), new_index: matches.new_index }
	}

	override readonly kind = "date"

	override format(): string {
		const DAY = duration_suffix_to_mult["DAY"]
		const day_remainder = ((this.value % DAY) + DAY) % DAY
		const time_string = day_remainder === 0 ? "" : new TimeToken(day_remainder).format()

		const date = new Date(this.value)
		const year = date.getUTCFullYear()
		const month = (date.getUTCMonth() + 1).toString().padStart(2, "0")
		const day = date.getUTCDate().toString().padStart(2, "0")

		return `${year}_${month}_${day} ${time_string}`
	}

	readonly from_literal: boolean

	constructor(value: number, from_literal?: boolean) {
		super(value)
		this.from_literal = from_literal ?? false
	}
}

type TimeSuffixes = "AM" | "PM"

class TimeToken extends ValueToken {
	static readonly suffixes: Record<string, TimeSuffixes> = {
		a: "AM",
		am: "AM",
		p: "PM",
		pm: "PM",
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
		let hours_value = finite_or_throw(hours, `Invalid hour number '${hours}'`)
		const minutes_value = finite_or_throw(minutes, `Invalid minute number '${minutes}'`)
		if (minutes_value < 0 || minutes_value > 59) throw new RangeError(`Invalid minutes value '${minutes_value}'`)
		const suffix_str = matches.parts[3].toLowerCase()
		if (suffix_str) {
			const suffix = this.suffixes[suffix_str]
			if (!suffix) throw new SyntaxError(`Invalid time suffix '${suffix_str}'`)
			if (hours_value < 1 || hours_value > 12) {
				throw new RangeError(`Invalid hour '${hours_value}' for 12-hour clock`)
			}
			if (suffix === "AM" && hours_value === 12) {
				hours_value = 0
			} else if (suffix === "PM" && hours_value !== 12) {
				hours_value += 12
			}
		} else if (hours_value < 0 || hours_value > 23) {
			throw new RangeError(`Invalid hour '${hours_value}' for 24-hour clock`)
		}
		const hours_millis = hours_value * duration_suffix_to_mult["HOUR"]
		const minute_millis = minutes_value * duration_suffix_to_mult["MINUTE"]
		return { token: new TimeToken(hours_millis + minute_millis), new_index: matches.new_index }
	}

	override readonly kind = "time"

	override format(): string {
		const DAY = duration_suffix_to_mult["DAY"]
		const HOUR = duration_suffix_to_mult["HOUR"]
		const MINUTE = duration_suffix_to_mult["MINUTE"]
		const SECOND = duration_suffix_to_mult["SECOND"]

		const day_offset = Math.floor(this.value / DAY)
		const remainder = ((this.value % DAY) + DAY) % DAY
		const hours = Math.floor(remainder / HOUR)
		const minutes = Math.floor((remainder % HOUR) / MINUTE)
		const seconds = Math.floor((remainder % MINUTE) / SECOND)
		const millis = remainder % SECOND

		const fraction = millis > 0 ? `.${Math.trunc(millis)}` : ""
		const time_string = (
			`${hours.toString().padStart(2, "0")}:`
			+ `${minutes.toString().padStart(2, "0")}:`
			+ `${seconds.toString().padStart(2, "0")}${fraction}`
		)

		if (day_offset === 0) {
			return time_string
		}

		const abs_days = Math.abs(day_offset)
		const day_label = abs_days === 1 ? "day" : "days"
		const sign = day_offset > 0 ? "+" : "-"
		return `${time_string} (${sign}${abs_days} ${day_label})`
	}
}

class DurationToken extends ValueToken {
	static readonly #regex_suffixes = new RegExp(
		Object.keys(duration_suffixes_to_unit)
		.sort((a, b) => b.length - a.length)
		.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) // escape regex chars
		.join("|"),
		"i", // case insensitive
	)

	static readonly sorted_duration_units = Object.entries(duration_suffix_to_mult)
	.sort(([, val_a], [, val_b]) => val_b - val_a)

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
			token: new DurationToken(num_token_match.token.value * multiplier, unit),
			new_index: suffix_match.new_index,
		}
	}

	override readonly kind = "duration"
	readonly from_suffix: DurationUnit | ""

	constructor(value: number, suffix?: DurationUnit) {
		super(value)
		this.from_suffix = suffix ?? ""
	}

	override format(): string {
		let remaining = this.value
		if (remaining === 0) return "0ms"
		const sign = remaining < 0 ? "-" : ""
		remaining = Math.abs(remaining)
		const parts: string[] = []
		let i = 0
		for (const [unit, mult] of DurationToken.sorted_duration_units) {
			const is_last = i === DurationToken.sorted_duration_units.length - 1
			i += 1
			if (remaining < mult && !is_last) continue
			if (is_last) {
				const amount = remaining / mult
				if (amount !== 0) {
					parts.push(`${trim_float(amount)}${duration_unit_to_display[unit]}`)
				}
				break
			}
			const whole = Math.floor(remaining / mult)
			if (whole > 0) {
				parts.push(`${whole}${duration_unit_to_display[unit]}`)
				remaining -= whole * mult
			}
		}
		return sign + parts.join(" ")
	}
}

export const keywords: Record<string, ()=> Token> = {
	now: (): DateToken => new DateToken(Date.now()),
	noon: (): TimeToken => new TimeToken(43200000 /* midday in MS */),
	midday: (): TimeToken => new TimeToken(43200000 /* midday in MS */),
	midnight: (): TimeToken => new TimeToken(0),
}

const keyword_regex = new RegExp(
	Object.keys(keywords)
	.sort((a, b) => b.length - a.length)
	.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) // escape regex chars
	.join("|"),
	"i", // case insensitive
)

const keyword_try_lex = (input: string, index: number): (LexResult<Token> | null) => {
	const matches = parse_chars(
		input,
		index,
		{ pattern: keyword_regex },
	)
	if (!matches) return null
	const word: string = matches.parts[0]
	const token_fn = keywords[word]
	if (!token_fn) throw new SyntaxError(`Unrecognized keyword: '${word}'`)
	return { token: token_fn(), new_index: matches.new_index }
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
				token: new OperatorToken(kind as OpKind),
				new_index: index + 1,
			}
		}
		return null
	}

	readonly kind: OpKind
	readonly raw: string
	readonly operate: (left: number, right: number)=> number
	precedence: number
	unary = false

	constructor(kind: OpKind) {
		super()
		this.kind = kind
		this.raw = operator_specs[kind].raw
		this.precedence = operator_specs[kind].precedence
		this.operate = operator_specs[kind].operate
	}
}

export const tryers: ((input: string, index: number)=> (LexResult<Token> | null))[] = [
	DateToken.try_lex.bind(DateToken),
	TimeToken.try_lex.bind(TimeToken),
	DurationToken.try_lex.bind(DurationToken),
	NumToken.try_lex.bind(NumToken),
	OperatorToken.try_lex.bind(OperatorToken),
	keyword_try_lex,
] as const

type BinaryOpTable = {
	[Left in ValueKind]: {
		[Op in Exclude<OpKind, "l_paren" | "r_paren">]: {
			[Right in ValueKind]: ValueKind | null
		}
	}
}

/* eslint-disable */
export const binary_op_table: BinaryOpTable = {
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

type UnaryOpTable = {
	[Op in Exclude<OpKind, "l_paren" | "r_paren">]: {
		[Right in ValueKind]?: (token: ValueToken)=> ValueToken
	}
}

export const unary_op_table: UnaryOpTable = {
	plus: {
		num: (token) => token,
		duration: (token) => token,
	},
	sub: {
		num: (token) => new val_kind_to_ctor["num"](-token.value),
		duration: (token) => new val_kind_to_ctor["duration"](-token.value),
	},
	mult: {},
	div: {},
} as const

type ImplicitOpTable = {
	[Left in ValueKind]: {
		[Right in ValueKind]?: (
			left: InstanceType<typeof val_kind_to_ctor[Left]>,
			right: InstanceType<typeof val_kind_to_ctor[Right]>,
		)=> ValueToken
	}
}

const implicit_op_table: ImplicitOpTable = {
	num: {},
	date: {
		time: (left, right) => {
			if (!left.from_literal) {
				throw new SyntaxError("Implicit addition not supported for non-literal dates")
			}
			return new DateToken(left.value + right.value)
		},
	},
	time: {},
	duration: {
		duration: (left, right) => {
			if (!left.from_suffix || !right.from_suffix) {
				throw new SyntaxError("Implicit addition not supported for non-literal durations")
			}
			const left_mult = duration_suffix_to_mult[left.from_suffix]
			const right_mult = duration_suffix_to_mult[right.from_suffix]
			if (left_mult <= right_mult) {
				throw new SyntaxError("Implicit addition of durations must decrease in unit")
			}
			return new DurationToken(left.value + right.value, right.from_suffix)
		},
	},
} as const

export const apply_implicit_op = (left: ValueToken, right: ValueToken): ValueToken | undefined => {
	const implicit_func = implicit_op_table[left.kind][right.kind]
	return implicit_func?.(left as any, right as any)
}

export const val_kind_to_ctor = {
	num: NumToken,
	date: DateToken,
	time: TimeToken,
	duration: DurationToken,
} as const satisfies { [Kind in ValueKind]: new (...args: any[])=> ValueToken }
