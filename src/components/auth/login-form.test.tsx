// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "./login-form";

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

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("LoginForm", () => {
	it("shows a heading, both credential fields and a submit button", () => {
		render(<LoginForm />);

		expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
		expect(screen.getByRole("textbox", { name: "Username" })).toBeTruthy();
		expect(screen.getByLabelText("Password")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
	});

	it("masks the password field", () => {
		render(<LoginForm />);

		expect(screen.getByLabelText("Password").getAttribute("type")).toBe("password");
	});

	it("offers a link to registration", () => {
		render(<LoginForm />);

		const link = screen.getByRole("link", { name: "Create an account" });
		expect(link.getAttribute("href")).toBe("/register");
	});

	it("reports both missing fields without calling the API", async () => {
		const user = userEvent.setup();
		const fetchMock = stubFetch(200, {});
		render(<LoginForm />);

		await user.click(screen.getByRole("button", { name: "Sign in" }));

		expect(await screen.findByText("Username is required")).toBeTruthy();
		expect(screen.getByText("Password is required")).toBeTruthy();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("sends the credentials to the login endpoint", async () => {
		const user = userEvent.setup();
		const fetchMock = stubFetch(200, { user: { username: "ada" } });
		render(<LoginForm />);

		await user.type(screen.getByRole("textbox", { name: "Username" }), "ada");
		await user.type(screen.getByLabelText("Password"), "correct horse");
		await user.click(screen.getByRole("button", { name: "Sign in" }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		const [path, init] = fetchMock.mock.calls[0];
		expect(path).toBe("/api/auth/login");
		expect(JSON.parse(init.body)).toEqual({
			username: "ada",
			password: "correct horse",
		});
	});

	it("navigates to the quiz page after a successful sign in", async () => {
		const user = userEvent.setup();
		stubFetch(200, { user: { username: "ada" } });
		render(<LoginForm />);

		await user.type(screen.getByRole("textbox", { name: "Username" }), "ada");
		await user.type(screen.getByLabelText("Password"), "correct horse");
		await user.click(screen.getByRole("button", { name: "Sign in" }));

		await waitFor(() => expect(push).toHaveBeenCalledWith("/mcq"));
	});

	it("shows the credential error and stays put when the server returns 401", async () => {
		const user = userEvent.setup();
		stubFetch(401, { error: "Invalid credentials" });
		render(<LoginForm />);

		await user.type(screen.getByRole("textbox", { name: "Username" }), "ada");
		await user.type(screen.getByLabelText("Password"), "wrong password");
		await user.click(screen.getByRole("button", { name: "Sign in" }));

		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toContain("Invalid credentials");
		expect(push).not.toHaveBeenCalled();
	});

	it("never echoes the submitted password back into the page text", async () => {
		const user = userEvent.setup();
		stubFetch(401, { error: "Invalid credentials" });
		render(<LoginForm />);

		await user.type(screen.getByRole("textbox", { name: "Username" }), "ada");
		await user.type(screen.getByLabelText("Password"), "hunter2secret");
		await user.click(screen.getByRole("button", { name: "Sign in" }));

		await screen.findByRole("alert");
		expect(document.body.textContent).not.toContain("hunter2secret");
	});

	it("disables the submit button while the request is in flight", async () => {
		const user = userEvent.setup();
		let release: (value: Response) => void = () => {};
		vi.stubGlobal(
			"fetch",
			vi.fn(
				() =>
					new Promise<Response>((resolve) => {
						release = resolve;
					}),
			),
		);
		render(<LoginForm />);

		await user.type(screen.getByRole("textbox", { name: "Username" }), "ada");
		await user.type(screen.getByLabelText("Password"), "correct horse");
		await user.click(screen.getByRole("button", { name: "Sign in" }));

		const pending = await screen.findByRole("button", { name: "Signing in…" });
		expect(pending.hasAttribute("disabled")).toBe(true);

		release(jsonResponse(200, { user: {} }));
		await waitFor(() => expect(push).toHaveBeenCalledWith("/mcq"));
	});
});
