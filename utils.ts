type CharSpec = {
	pattern: RegExp | string,
	min?: number,
	max?: number,
}

export function parse_chars<const S extends readonly CharSpec[]>(
	input: string,
	index: number,
	...specs: S
): { parts: { [K in keyof S]: string }, new_index: number } | null {
	const start_index = index
	const parts: string[] = []

	for (const spec of specs) {
		const min = spec.min ?? 1
		const max = spec.max ?? 1
		const spec_start = index

		// Regex patterns: match against the remaining string in one go,
		// using a quantifier so {pattern}+ will consume repeated units (e.g. digits).
		if (spec.pattern instanceof RegExp) {
			const flags = spec.pattern.flags
			const source = spec.pattern.source
			const quant = max === Infinity ? (min === 0 ? "*" : "+") : `{${min},${max}}`
			// anchor to start of remaining string
			const re = new RegExp("^(" + source + ")" + quant, flags)
			const remaining = input.slice(index)
			const m = remaining.match(re)
			if (!m) return null
			index += m[0].length
			parts.push(input.slice(spec_start, index))
			continue
		}

		// String patterns: original char-by-char behaviour
		let count = 0
		while (index < input.length && (max === Infinity || count < max)) {
			const char = input[index]!
			if (char !== spec.pattern) break
			count += 1
			index += 1
		}
		if (count < min) return null
		parts.push(input.slice(spec_start, index))
	}

	if (index <= start_index) return null
	return {
		parts: parts as any,
		new_index: index,
	}
}

export const finite_or_throw = (input: any, error_message?: string): number => {
	const value = Number(input)
	if (!Number.isFinite(value)) throw new EvalError(error_message || `Invalid number '${input}'`)
	return value
}

export type DurationUnit = "WEEK" | "DAY" | "HOUR" | "MINUTE" | "SECOND" | "MILLISECOND"

export const duration_suffix_to_mult: { [Unit in DurationUnit]: number } = {
	WEEK: 7 * 24 * 60 * 60 * 1000,
	DAY: 24 * 60 * 60 * 1000,
	HOUR: 60 * 60 * 1000,
	MINUTE: 60 * 1000,
	SECOND: 1000,
	MILLISECOND: 1,
}

export const duration_suffixes_to_unit: Record<string, DurationUnit> = {
	w: "WEEK",
	week: "WEEK",
	d: "DAY",
	day: "DAY",
	h: "HOUR",
	hour: "HOUR",
	m: "MINUTE",
	min: "MINUTE",
	minute: "MINUTE",
	s: "SECOND",
	sec: "SECOND",
	second: "SECOND",
	ms: "MILLISECOND",
	millis: "MILLISECOND",
	millisec: "MILLISECOND",
	millisecond: "MILLISECOND",
} as const
