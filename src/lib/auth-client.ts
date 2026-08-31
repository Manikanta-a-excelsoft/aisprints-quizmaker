/**
 * The auth forms all talk to the API the same way: post JSON, then split the answer into
 * per-field messages (shown next to the input) and one form-level message (shown above
 * the form). Keeping that here stops the two forms from disagreeing about it.
 */
export const GENERIC_ERROR = "Something went wrong. Please try again.";

export type AuthResult =
	| { ok: true }
	| { ok: false; fields: Record<string, string>; message: string | null };

type ErrorBody = {
	error?: unknown;
	fields?: unknown;
};

function readFields(body: ErrorBody): Record<string, string> {
	if (!body.fields || typeof body.fields !== "object") {
		return {};
	}

	const fields: Record<string, string> = {};
	for (const [key, value] of Object.entries(body.fields)) {
		if (typeof value === "string") {
			fields[key] = value;
		}
	}
	return fields;
}

export async function postAuth(path: string, body: unknown): Promise<AuthResult> {
	let response: Response;
	try {
		response = await fetch(path, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
	} catch {
		return { ok: false, fields: {}, message: GENERIC_ERROR };
	}

	if (response.ok) {
		return { ok: true };
	}

	let parsed: ErrorBody = {};
	try {
		parsed = (await response.json()) as ErrorBody;
	} catch {
		return { ok: false, fields: {}, message: GENERIC_ERROR };
	}

	const fields = readFields(parsed);
	if (Object.keys(fields).length > 0) {
		// The inputs carry the detail, so a form-level message would only repeat it.
		return { ok: false, fields, message: null };
	}

	return {
		ok: false,
		fields: {},
		message: typeof parsed.error === "string" ? parsed.error : GENERIC_ERROR,
	};
}
