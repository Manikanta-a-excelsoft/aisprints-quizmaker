import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password";

const PASSWORD = "correct horse battery staple";

describe("hashPassword", () => {
	it("produces a string that identifies the algorithm and carries four parts", async () => {
		const stored = await hashPassword(PASSWORD);
		const parts = stored.split("$");

		expect(parts).toHaveLength(4);
		expect(parts[0]).toBe("pbkdf2-sha256");
		expect(Number(parts[1])).toBeGreaterThanOrEqual(100_000);
		expect(parts[2]).not.toBe("");
		expect(parts[3]).not.toBe("");
	});

	it("produces a different stored value each time for the same password", async () => {
		const [first, second, third] = await Promise.all([
			hashPassword(PASSWORD),
			hashPassword(PASSWORD),
			hashPassword(PASSWORD),
		]);

		expect(new Set([first, second, third]).size).toBe(3);
	});

	it("uses a different salt each time", async () => {
		const saltOf = (stored: string) => stored.split("$")[2];

		expect(saltOf(await hashPassword(PASSWORD))).not.toBe(
			saltOf(await hashPassword(PASSWORD)),
		);
	});

	it("never includes the plaintext password in the stored value", async () => {
		const stored = await hashPassword(PASSWORD);

		expect(stored).not.toContain(PASSWORD);
		expect(stored).not.toContain("correct");
		expect(stored).not.toContain(btoa(PASSWORD));
		expect(stored.toLowerCase()).not.toContain("horse");
	});

	it("handles a password with unicode and whitespace", async () => {
		const password = "  pässwörd with spaces 🔐  ";
		const stored = await hashPassword(password);

		await expect(verifyPassword(password, stored)).resolves.toBe(true);
	});
});

describe("verifyPassword", () => {
	it("accepts the correct password", async () => {
		const stored = await hashPassword(PASSWORD);

		await expect(verifyPassword(PASSWORD, stored)).resolves.toBe(true);
	});

	it("rejects a wrong password", async () => {
		const stored = await hashPassword(PASSWORD);

		await expect(verifyPassword("not the password", stored)).resolves.toBe(false);
	});

	it("rejects a password differing only in case", async () => {
		const stored = await hashPassword(PASSWORD);

		await expect(verifyPassword(PASSWORD.toUpperCase(), stored)).resolves.toBe(false);
	});

	it("rejects an empty password against a real hash", async () => {
		const stored = await hashPassword(PASSWORD);

		await expect(verifyPassword("", stored)).resolves.toBe(false);
	});

	it("works against a hash it did not generate in the same call", async () => {
		const storedElsewhere = await hashPassword(PASSWORD);

		await expect(verifyPassword(PASSWORD, storedElsewhere)).resolves.toBe(true);
	});

	it("rejects a Phase 3 sha256-placeholder value instead of throwing", async () => {
		const legacy =
			"sha256-placeholder$c4bbcb1fbec99d65bf59d85c8cb62ee2db963f0fe106f483d9afa73bd4e39a8a";

		await expect(verifyPassword(PASSWORD, legacy)).resolves.toBe(false);
	});

	it.each([
		["an empty string", ""],
		["a bare word", "nonsense"],
		["a wrong algorithm", "bcrypt$10$salt$hash"],
		["too few parts", "pbkdf2-sha256$100000$onlysalt"],
		["non-numeric iterations", "pbkdf2-sha256$abc$c2FsdA==$aGFzaA=="],
		["zero iterations", "pbkdf2-sha256$0$c2FsdA==$aGFzaA=="],
		["invalid base64", "pbkdf2-sha256$100000$!!!$###"],
	])("rejects %s without throwing", async (_label, stored) => {
		await expect(verifyPassword(PASSWORD, stored)).resolves.toBe(false);
	});

	it("rejects a value whose hash has been tampered with", async () => {
		const stored = await hashPassword(PASSWORD);
		const [algorithm, iterations, salt, hash] = stored.split("$");
		const tampered = [
			algorithm,
			iterations,
			salt,
			`${hash.slice(0, -2)}${hash.slice(-2) === "AA" ? "BB" : "AA"}`,
		].join("$");

		await expect(verifyPassword(PASSWORD, tampered)).resolves.toBe(false);
	});

	it("rejects when the salt has been swapped for another", async () => {
		const first = await hashPassword(PASSWORD);
		const second = await hashPassword(PASSWORD);
		const swapped = [
			first.split("$")[0],
			first.split("$")[1],
			second.split("$")[2],
			first.split("$")[3],
		].join("$");

		await expect(verifyPassword(PASSWORD, swapped)).resolves.toBe(false);
	});
});
