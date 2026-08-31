import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * All database access for questions, choices and attempts lives here, so route handlers
 * never touch `env.DB` directly.
 *
 * This application has no session management, so nothing downstream can know who is
 * acting. `createdBy` is therefore always null, and `userId` is null unless a caller
 * explicitly supplies one. This module never invents a user.
 */
export type Choice = {
	id: string;
	questionId: string;
	text: string;
	isCorrect: boolean;
	position: number;
	createdAt: string;
};

/** A choice with the answer stripped: what the attempt page is allowed to see. */
export type PublicChoice = Omit<Choice, "isCorrect">;

export type Question = {
	id: string;
	name: string;
	questionText: string;
	createdBy: string | null;
	createdAt: string;
	updatedAt: string;
	choices: Choice[];
};

/** The shape safe to send to someone who is about to answer the question. */
export type PublicQuestion = Omit<Question, "choices"> & {
	choices: PublicChoice[];
};

/** One row of the list page: how many choices there are, not what they say. */
export type QuestionSummary = {
	id: string;
	name: string;
	questionText: string;
	choiceCount: number;
	createdAt: string;
	updatedAt: string;
};

export type ChoiceInput = {
	text: string;
	isCorrect: boolean;
};

export type QuestionInput = {
	name: string;
	questionText: string;
	choices: ChoiceInput[];
};

export type Attempt = {
	id: string;
	questionId: string;
	userId: string | null;
	choiceId: string | null;
	isCorrect: boolean;
	createdAt: string;
};

export type AttemptResult = {
	attempt: Attempt;
	/** So the page can show which answer was right. Null only if the data is inconsistent. */
	correctChoiceId: string | null;
};

type QuestionRow = {
	id: string;
	name: string;
	question_text: string;
	created_by: string | null;
	created_at: string;
	updated_at: string;
};

type ChoiceRow = {
	id: string;
	question_id: string;
	choice_text: string;
	is_correct: number;
	position: number;
	created_at: string;
};

type AttemptRow = {
	id: string;
	question_id: string;
	user_id: string | null;
	choice_id: string | null;
	is_correct: number;
	created_at: string;
};

type SummaryRow = {
	id: string;
	name: string;
	question_text: string;
	created_at: string;
	updated_at: string;
	choice_count: number;
};

/** Raised when an attempt names a choice that is not one of the question's own. */
export class ChoiceNotInQuestionError extends Error {
	constructor() {
		super("That choice does not belong to this question");
		this.name = "ChoiceNotInQuestionError";
	}
}

const QUESTION_COLUMNS =
	"id, name, question_text, created_by, created_at, updated_at";
const CHOICE_COLUMNS =
	"id, question_id, choice_text, is_correct, position, created_at";
const ATTEMPT_COLUMNS =
	"id, question_id, user_id, choice_id, is_correct, created_at";

async function database() {
	const { env } = await getCloudflareContext();
	return env.DB;
}

type Database = Awaited<ReturnType<typeof database>>;

/**
 * Produces the same shape as the column default `lower(hex(randomblob(16)))`.
 *
 * The id is generated here rather than by the database because `db.batch()` prepares every
 * statement before any of them runs, so a choice row cannot reference an id that the
 * question's INSERT has not produced yet. The column default stays in the migration as a
 * fallback for anything inserting without an explicit id.
 */
function newId(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));

	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toQuestionFields(row: QuestionRow): Omit<Question, "choices"> {
	return {
		id: row.id,
		name: row.name,
		questionText: row.question_text,
		createdBy: row.created_by,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toChoice(row: ChoiceRow): Choice {
	return {
		id: row.id,
		questionId: row.question_id,
		text: row.choice_text,
		// SQLite has no boolean type, so the integer is mapped at the edge of the service.
		isCorrect: row.is_correct === 1,
		position: Number(row.position),
		createdAt: row.created_at,
	};
}

function toAttempt(row: AttemptRow): Attempt {
	return {
		id: row.id,
		questionId: row.question_id,
		userId: row.user_id,
		choiceId: row.choice_id,
		isCorrect: row.is_correct === 1,
		createdAt: row.created_at,
	};
}

export function toPublicQuestion(question: Question): PublicQuestion {
	return {
		id: question.id,
		name: question.name,
		questionText: question.questionText,
		createdBy: question.createdBy,
		createdAt: question.createdAt,
		updatedAt: question.updatedAt,
		choices: question.choices.map((choice) => ({
			id: choice.id,
			questionId: choice.questionId,
			text: choice.text,
			position: choice.position,
			createdAt: choice.createdAt,
		})),
	};
}

/** Builds the INSERT for one choice. Shared by create and by the replace inside update. */
function insertChoice(
	db: Database,
	questionId: string,
	choice: ChoiceInput,
	position: number,
) {
	return db
		.prepare(
			`INSERT INTO mcq_choices (question_id, choice_text, is_correct, position) VALUES (?1, ?2, ?3, ?4) RETURNING ${CHOICE_COLUMNS}`,
		)
		.bind(questionId, choice.text, choice.isCorrect ? 1 : 0, position);
}

function choicesFrom(batchResults: D1Result[], skip: number): Choice[] {
	return batchResults
		.slice(skip)
		.flatMap((result) => result.results as unknown as ChoiceRow[])
		.map(toChoice)
		.sort((a, b) => a.position - b.position);
}

/**
 * The question and all of its choices go in one `db.batch()`, which D1 runs as a single
 * transaction. A question can therefore never be stored without its choices: if any choice
 * insert fails, the question insert rolls back with it.
 */
export async function createQuestion(input: QuestionInput): Promise<Question> {
	const db = await database();
	const id = newId();

	const results = await db.batch([
		db
			.prepare(
				`INSERT INTO mcq_questions (id, name, question_text, created_by) VALUES (?1, ?2, ?3, ?4) RETURNING ${QUESTION_COLUMNS}`,
			)
			// created_by is null: there is no session, so nothing can know who is acting.
			.bind(id, input.name, input.questionText, null),
		...input.choices.map((choice, position) =>
			insertChoice(db, id, choice, position),
		),
	]);

	const row = results[0]?.results[0] as QuestionRow | undefined;
	if (!row) {
		throw new Error("Question could not be created: the insert returned no row");
	}

	return { ...toQuestionFields(row), choices: choicesFrom(results, 1) };
}

export async function listQuestions(): Promise<QuestionSummary[]> {
	const db = await database();

	// One query rather than one per row, and a LEFT JOIN so a question with no choices is
	// still listed, with a count of 0. rowid breaks ties because CURRENT_TIMESTAMP only has
	// second precision, so two questions created in the same second would otherwise order
	// unpredictably.
	const { results } = await db
		.prepare(
			`SELECT q.id, q.name, q.question_text, q.created_at, q.updated_at, COUNT(c.id) AS choice_count
			 FROM mcq_questions q
			 LEFT JOIN mcq_choices c ON c.question_id = q.id
			 GROUP BY q.id
			 ORDER BY q.created_at DESC, q.rowid DESC`,
		)
		.all<SummaryRow>();

	return results.map((row) => ({
		id: row.id,
		name: row.name,
		questionText: row.question_text,
		choiceCount: Number(row.choice_count),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}));
}

async function findChoices(db: Database, questionId: string): Promise<Choice[]> {
	const { results } = await db
		.prepare(
			`SELECT ${CHOICE_COLUMNS} FROM mcq_choices WHERE question_id = ?1 ORDER BY position, id`,
		)
		.bind(questionId)
		.all<ChoiceRow>();

	return results.map(toChoice);
}

export async function findQuestionById(id: string): Promise<Question | null> {
	const db = await database();

	const { results } = await db
		.prepare(`SELECT ${QUESTION_COLUMNS} FROM mcq_questions WHERE id = ?1`)
		.bind(id)
		.all<QuestionRow>();

	const row = results[0];
	if (!row) {
		return null;
	}

	return { ...toQuestionFields(row), choices: await findChoices(db, id) };
}

/**
 * Replaces the question's fields and its whole choice set. The delete and the inserts share
 * the batch with the update, so a failure part-way cannot leave the question with its old
 * choices removed and no new ones in place.
 *
 * Replacing rather than diffing means choice ids change on every edit. Attempts pointing at
 * a replaced choice keep their row and their `is_correct`, but their `choice_id` becomes
 * null, because the column is ON DELETE SET NULL. That trade-off is recorded in the PRD.
 */
export async function updateQuestion(
	id: string,
	input: QuestionInput,
): Promise<Question | null> {
	const db = await database();

	// Checked before the batch so a missing id answers null, rather than failing on the
	// foreign key when the replacement choices are inserted.
	const { results: existing } = await db
		.prepare("SELECT id FROM mcq_questions WHERE id = ?1")
		.bind(id)
		.all<{ id: string }>();

	if (!existing[0]) {
		return null;
	}

	const results = await db.batch([
		db
			.prepare(
				`UPDATE mcq_questions SET name = ?1, question_text = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?3 RETURNING ${QUESTION_COLUMNS}`,
			)
			.bind(input.name, input.questionText, id),
		db.prepare("DELETE FROM mcq_choices WHERE question_id = ?1").bind(id),
		...input.choices.map((choice, position) =>
			insertChoice(db, id, choice, position),
		),
	]);

	const row = results[0]?.results[0] as QuestionRow | undefined;
	if (!row) {
		return null;
	}

	return { ...toQuestionFields(row), choices: choicesFrom(results, 2) };
}

export async function deleteQuestion(id: string): Promise<boolean> {
	const db = await database();

	// The choices and attempts go with it through ON DELETE CASCADE.
	const { meta } = await db
		.prepare("DELETE FROM mcq_questions WHERE id = ?1")
		.bind(id)
		.run();

	return meta.changes > 0;
}

/**
 * Records one attempt and reports whether it was right.
 *
 * Correctness is read from the stored choice, never taken from the caller, so nothing the
 * browser sends can decide it. Returns null when the question does not exist, so a route can
 * answer 404; throws `ChoiceNotInQuestionError` when the choice is not one of that
 * question's, so a route can answer 400.
 */
export async function recordAttempt(
	questionId: string,
	choiceId: string,
	userId: string | null = null,
): Promise<AttemptResult | null> {
	const db = await database();

	const { results: questionRows } = await db
		.prepare("SELECT id FROM mcq_questions WHERE id = ?1")
		.bind(questionId)
		.all<{ id: string }>();

	if (!questionRows[0]) {
		return null;
	}

	const { results: chosenRows } = await db
		.prepare(
			"SELECT id, is_correct FROM mcq_choices WHERE id = ?1 AND question_id = ?2",
		)
		.bind(choiceId, questionId)
		.all<{ id: string; is_correct: number }>();

	const chosen = chosenRows[0];
	if (!chosen) {
		throw new ChoiceNotInQuestionError();
	}

	const { results: correctRows } = await db
		.prepare(
			"SELECT id FROM mcq_choices WHERE question_id = ?1 AND is_correct = ?2 ORDER BY position, id",
		)
		.bind(questionId, 1)
		.all<{ id: string }>();

	const { results } = await db
		.prepare(
			`INSERT INTO mcq_attempts (question_id, user_id, choice_id, is_correct) VALUES (?1, ?2, ?3, ?4) RETURNING ${ATTEMPT_COLUMNS}`,
		)
		.bind(questionId, userId, choiceId, chosen.is_correct)
		.all<AttemptRow>();

	const row = results[0];
	if (!row) {
		throw new Error("Attempt could not be recorded: the insert returned no row");
	}

	return {
		attempt: toAttempt(row),
		correctChoiceId: correctRows[0]?.id ?? null,
	};
}
