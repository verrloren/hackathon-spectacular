class ApiError extends Error {
	constructor(public response: Response) {
		super("API error" + response.statusText);
	}
}

const backendUrl = "https://pobeda.loca.lt";

export const jsonApiInstance = async <T>(
	url: string,
	init?: RequestInit & { json: unknown }) => {

	let headers = init?.headers ?? {};
	if (init?.json) {
		headers = {
			'Content-Type': 'application/json',
			...headers
		};
		init.body = JSON.stringify(init.json);
}
	const result = await fetch(`${backendUrl}${url}`, {
		...init,
		headers
	})

	if (result.status === 401 || result.status === 422) {
		return null as T;
	}


	if (!result.ok) {
		throw new ApiError(result);
	}
	const data = (await result.json()) as Promise<T>;
	return data;
}