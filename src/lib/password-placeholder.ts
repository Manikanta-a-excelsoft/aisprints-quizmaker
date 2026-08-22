/**
 * TEMPORARY. Phase 3 needs something to put in `password_hash` so the auth routes can be
 * built and tested end to end, but real hashing is Phase 4 work.
 *
 * This is an unsalted single-round SHA-256. It is one-way, so no plaintext password is
 * ever written to the database, but it is NOT acceptable password storage: identical
 * passwords produce identical hashes and it is cheap to attack with a rainbow table.
 *
 * Phase 4 replaces this file with `src/lib/password.ts` using Web Crypto PBKDF2-SHA256
 * with a random per-user salt. Any account created before that point has to be recreated;
 * see the PRD note on Phase 3.
 */
const PREFIX = "sha256-placeholder$";

export async function hashPasswordPlaceholder(password: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(password),
	);

	const hex = Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");

	return `${PREFIX}${hex}`;
}

export async function verifyPasswordPlaceholder(
	password: string,
	storedHash: string,
): Promise<boolean> {
	return storedHash === (await hashPasswordPlaceholder(password));
}
