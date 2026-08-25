// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RegisterForm } from "./register-form";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

function jsonResponse(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function stubFetch(status: number, body: unknown) {
	const fetchMock = vi.fn().mockResolvedValue(jsonResponse(status, body));
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
	await user.type(screen.getByRole("textbox", { name: "First name" }), "Ada");
	await user.type(screen.getByRole("textbox", { name: "Last name" }), "Lovelace");
	await user.type(screen.getByRole("textbox", { name: "Username" }), "ada");
	await user.type(screen.getByRole("textbox", { name: "Email" }), "ada@example.com");
	await user.type(screen.getByLabelText("Password"), "correct horse battery");
}

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("RegisterForm", () => {
	it("shows a heading, every registration field and a submit button", () => {
		render(<RegisterForm />);

		expect(screen.getByRole("heading", { name: "Create your account" })).toBeTruthy();
		expect(screen.getByRole("textbox", { name: "First name" })).toBeTruthy();
		expect(screen.getByRole("textbox", { name: "Last name" })).toBeTruthy();
		expect(screen.getByRole("textbox", { name: "Username" })).toBeTruthy();
		expect(screen.getByRole("textbox", { name: "Email" })).toBeTruthy();
		expect(screen.getByLabelText("Password")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Create account" })).toBeTruthy();
	});

	it("masks the password field", () => {
		render(<RegisterForm />);

		expect(screen.getByLabelText("Password").getAttribute("type")).toBe("password");
	});

	it("offers a link back to sign in", () => {
		render(<RegisterForm />);

		expect(
			screen.getByRole("link", { name: "Sign in" }).getAttribute("href"),
		).toBe("/login");
	});

	it("reports every empty required field without calling the API", async () => {
		const user = userEvent.setup();
		const fetchMock = stubFetch(201, {});
		render(<RegisterForm />);

		await user.click(screen.getByRole("button", { name: "Create account" }));

		expect(await screen.findByText("First name is required")).toBeTruthy();
		expect(screen.getByText("Last name is required")).toBeTruthy();
		expect(screen.getByText("Username must be at least 3 characters")).toBeTruthy();
		expect(screen.getByText("Must be a valid email address")).toBeTruthy();
		expect(screen.getByText("Password must be at least 8 characters")).toBeTruthy();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("applies the same username, email and password rules as the API", async () => {
		const user = userEvent.setup();
		const fetchMock = stubFetch(201, {});
		render(<RegisterForm />);

		await user.type(screen.getByRole("textbox", { name: "First name" }), "Ada");
		await user.type(screen.getByRole("textbox", { name: "Last name" }), "Lovelace");
		await user.type(screen.getByRole("textbox", { name: "Username" }), "ab");
		await user.type(screen.getByRole("textbox", { name: "Email" }), "not-an-email");
		await user.type(screen.getByLabelText("Password"), "short");
		await user.click(screen.getByRole("button", { name: "Create account" }));

		expect(
			await screen.findByText("Username must be at least 3 characters"),
		).toBeTruthy();
		expect(screen.getByText("Must be a valid email address")).toBeTruthy();
		expect(screen.getByText("Password must be at least 8 characters")).toBeTruthy();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("posts the trimmed values to the register endpoint", async () => {
		const user = userEvent.setup();
		const fetchMock = stubFetch(201, { user: { username: "ada" } });
		render(<RegisterForm />);

		await user.type(screen.getByRole("textbox", { name: "First name" }), "  Ada  ");
		await user.type(screen.getByRole("textbox", { name: "Last name" }), "Lovelace");
		await user.type(screen.getByRole("textbox", { name: "Username" }), "  ada  ");
		await user.type(screen.getByRole("textbox", { name: "Email" }), "ada@example.com");
		await user.type(screen.getByLabelText("Password"), "correct horse battery");
		await user.click(screen.getByRole("button", { name: "Create account" }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		const [path, init] = fetchMock.mock.calls[0];
		expect(path).toBe("/api/auth/register");
		expect(JSON.parse(init.body)).toEqual({
			firstName: "Ada",
			lastName: "Lovelace",
			username: "ada",
			email: "ada@example.com",
			password: "correct horse battery",
		});
	});

	it("sends the user to the quiz page after a successful registration", async () => {
		const user = userEvent.setup();
		stubFetch(201, { user: { username: "ada" } });
		render(<RegisterForm />);

		await fillValidForm(user);
		await user.click(screen.getByRole("button", { name: "Create account" }));

		await waitFor(() => expect(push).toHaveBeenCalledWith("/mcq"));
	});

	it("shows the duplicate username message from the server", async () => {
		const user = userEvent.setup();
		stubFetch(400, { error: "Username already taken" });
		render(<RegisterForm />);

		await fillValidForm(user);
		await user.click(screen.getByRole("button", { name: "Create account" }));

		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toContain("Username already taken");
		expect(push).not.toHaveBeenCalled();
	});

	it("shows a server field error against the matching field", async () => {
		const user = userEvent.setup();
		stubFetch(400, {
			error: "Validation failed",
			fields: { email: "Must be a valid email address" },
		});
		render(<RegisterForm />);

		await fillValidForm(user);
		await user.click(screen.getByRole("button", { name: "Create account" }));

		expect(await screen.findByText("Must be a valid email address")).toBeTruthy();
		expect(push).not.toHaveBeenCalled();
	});

	it("never echoes the submitted password back into the page text", async () => {
		const user = userEvent.setup();
		stubFetch(400, { error: "Username already taken" });
		render(<RegisterForm />);

		await user.type(screen.getByRole("textbox", { name: "First name" }), "Ada");
		await user.type(screen.getByRole("textbox", { name: "Last name" }), "Lovelace");
		await user.type(screen.getByRole("textbox", { name: "Username" }), "ada");
		await user.type(screen.getByRole("textbox", { name: "Email" }), "ada@example.com");
		await user.type(screen.getByLabelText("Password"), "hunter2secret");
		await user.click(screen.getByRole("button", { name: "Create account" }));

		await screen.findByRole("alert");
		expect(document.body.textContent).not.toContain("hunter2secret");
	});
});
