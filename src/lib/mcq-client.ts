/**
 * The MCQ pages all talk to /api/mcq the same way: send JSON, then split the answer into
 * per-field messages (shown next to the input) and one form-level message (shown above the
 * form). This mirrors auth-client.ts so the two halves of the app report failures
 * identically, and keeps every URL and request shape in one place.
 */
export const GENERIC_ERROR = "Something went wrong. Please try again.";

const JSON_HEADERS = { "content-type": "application/json" };

/** `isCorrect` is absent unless the caller asked for `?include=answers`. */
export type ChoiceView = {
	id: string;
	text: string;
	position: number;
	isCorrect?: boolean;
};

export type QuestionView = {
	id: string;
	name: string;
	questionText: string;
	createdBy: string | null;
	createdAt: string;
	updatedAt: string;
	choices: ChoiceView[];
};

export type QuestionSummaryView = {
	id: string;
	name: string;
	questionText: string;
	choiceCount: number;
	createdAt: string;
	updatedAt: string;
};

export type AttemptView = {
	attempt: {
		id: string;
		questionId: string;
		userId: string | null;
		choiceId: string | null;
		isCorrect: boolean;
		createdAt: string;
	};
	correctChoiceId: string | null;
};

/** What the form collects. Choices carry no id: an edit replaces the whole set. */
export type QuestionFormValues = {
	name: string;
	questionText: string;
	choices: { text: string; isCorrect: boolean }[];
};

export type ApiResult<T> =
	| { ok: true; data: T }
	| {
			ok: false;
			status: number | null;
			fields: Record<string, string>;
			message: string | null;
	  };

type Body = Record<string, unknown>;

function readFields(body: Body): Record<string, string> {
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

async function request<T>(
	path: string,
	init: RequestInit,
	read: (body: Body) => T,
): Promise<ApiResult<T>> {
	let response: Response;
	try {
		response = await fetch(path, init);
	} catch {
		// No status to report: the request never reached the server.
		return { ok: false, status: null, fields: {}, message: GENERIC_ERROR };
	}

	let parsed: Body;
	try {
		parsed = (await response.json()) as Body;
	} catch {
		return {
			ok: false,
			status: response.status,
			fields: {},
			message: GENERIC_ERROR,
		};
	}

	if (response.ok) {
		return { ok: true, data: read(parsed) };
	}

	const fields = readFields(parsed);
	if (Object.keys(fields).length > 0) {
		// The inputs carry the detail, so a form-level message would only repeat it.
		return { ok: false, status: response.status, fields, message: null };
	}

	return {
		ok: false,
		status: response.status,
		fields: {},
		message: typeof parsed.error === "string" ? parsed.error : GENERIC_ERROR,
	};
}

export function fetchQuestions(): Promise<ApiResult<QuestionSummaryView[]>> {
	return request(
		"/api/mcq",
		{ method: "GET" },
		(body) => (body.questions ?? []) as QuestionSummaryView[],
	);
}

export function fetchQuestion(
	id: string,
	options?: { includeAnswers?: boolean },
): Promise<ApiResult<QuestionView>> {
	const base = `/api/mcq/${encodeURIComponent(id)}`;
	return request(
		options?.includeAnswers ? `${base}?include=answers` : base,
		{ method: "GET" },
		(body) => body.question as QuestionView,
	);
}

export function createQuestion(
	values: QuestionFormValues,
): Promise<ApiResult<QuestionView>> {
	return request(
		"/api/mcq",
		{ method: "POST", headers: JSON_HEADERS, body: JSON.stringify(values) },
		(body) => body.question as QuestionView,
	);
}

export function updateQuestion(
	id: string,
	values: QuestionFormValues,
): Promise<ApiResult<QuestionView>> {
	return request(
		`/api/mcq/${encodeURIComponent(id)}`,
		{ method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(values) },
		(body) => body.question as QuestionView,
	);
}

export function deleteQuestion(id: string): Promise<ApiResult<null>> {
	return request(
		`/api/mcq/${encodeURIComponent(id)}`,
		{ method: "DELETE" },
		() => null,
	);
}

export function submitAttempt(
	id: string,
	choiceId: string,
): Promise<ApiResult<AttemptView>> {
	return request(
		`/api/mcq/${encodeURIComponent(id)}/attempts`,
		{
			method: "POST",
			headers: JSON_HEADERS,
			// Only the choice is sent. The verdict is the server's to decide.
			body: JSON.stringify({ choiceId }),
		},
		(body) => body as unknown as AttemptView,
	);
}
