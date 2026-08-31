/**
 * There is no session to destroy this sprint, so this endpoint acknowledges the request
 * and nothing more. It exists so the UI has a real endpoint to call and so the logout
 * flow is complete and testable.
 */
export async function POST(): Promise<Response> {
	return Response.json({ success: true }, { status: 200 });
}
