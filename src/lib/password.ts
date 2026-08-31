/**
 * Password storage using Web Crypto PBKDF2-SHA256 with a random per-user salt.
 *
 * Stored format: `pbkdf2-sha256$<iterations>$<base64 salt>$<base64 derived key>`
 *
 * The salt and iteration count travel with the hash so the cost can be raised later
 * without invalidating existing accounts. Web Crypto is used rather than a native
 * module because this runs on the Cloudflare Workers runtime, which has no Node crypto.
 */
const ALGORITHM = "pbkdf2-sha256";
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

function toBase64(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

async function deriveKey(
	password: string,
	salt: Uint8Array,
	iterations: number,
): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(password),
		"PBKDF2",
		false,
		["deriveBits"],
	);

	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
		key,
		KEY_BITS,
	);

	return new Uint8Array(bits);
}

/** Compares byte arrays without leaking how many leading bytes matched. */
function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
	if (left.length !== right.length) {
		return false;
	}

	let difference = 0;
	for (let index = 0; index < left.length; index += 1) {
		difference |= left[index] ^ right[index];
	}
	return difference === 0;
}

export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const derived = await deriveKey(password, salt, ITERATIONS);

	return [ALGORITHM, ITERATIONS, toBase64(salt), toBase64(derived)].join("$");
}

/**
 * Returns false for anything that is not a valid hash of `password`, including the
 * Phase 3 `sha256-placeholder$` values and malformed input. Those accounts cannot log
 * in and have to register again.
 */
export async function verifyPassword(
	password: string,
	storedHash: string,
): Promise<boolean> {
	const parts = storedHash.split("$");
	if (parts.length !== 4) {
		return false;
	}

	const [algorithm, rawIterations, rawSalt, rawHash] = parts;
	if (algorithm !== ALGORITHM) {
		return false;
	}

	const iterations = Number(rawIterations);
	if (!Number.isInteger(iterations) || iterations < 1) {
		return false;
	}

	try {
		const salt = fromBase64(rawSalt);
		const expected = fromBase64(rawHash);
		if (salt.length === 0 || expected.length === 0) {
			return false;
		}

		const derived = await deriveKey(password, salt, iterations);
		return timingSafeEqual(derived, expected);
	} catch {
		return false;
	}
}
