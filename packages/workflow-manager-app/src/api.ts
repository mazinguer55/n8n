import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { randomUUID } from 'crypto';

export interface WorkflowSummary {
	id: string;
	name: string;
	active: boolean;
	updatedAt?: string;
	createdAt?: string;
}

export interface AuthenticatedUser {
	id: string;
	email: string;
	firstName?: string;
	lastName?: string;
}

export interface ClientOptions {
	baseUrl: string;
	restPath: string;
}

export class N8nClient {
	private readonly restPath: string;

	private readonly http: AxiosInstance;

	private readonly browserId = randomUUID();

	private cookies: Record<string, string> = {};

	constructor(options: ClientOptions) {
		const baseURL = normalizeBaseUrl(options.baseUrl);
		this.http = axios.create({
			baseURL,
			withCredentials: true,
			headers: {
				'content-type': 'application/json',
			},
		});
		this.restPath = normalizeRestPath(options.restPath);

		this.http.interceptors.request.use((config) => {
			config.headers = config.headers ?? {};
			const headerBag = config.headers as Record<string, string>;
			headerBag['browser-id'] = this.browserId;
			const cookieHeader = this.getCookieHeader();
			if (cookieHeader) {
				headerBag['Cookie'] = cookieHeader;
			}
			return config;
		});

		this.http.interceptors.response.use((response) => {
			const setCookie = response.headers['set-cookie'];
			if (setCookie) {
				this.storeCookies(Array.isArray(setCookie) ? setCookie : [setCookie]);
			}
			return response;
		});
	}

	async login(email: string, password: string) {
		const response = await this.http.post(
			this.endpoint('/login'),
			{ email, password },
			this.requestConfig(),
		);
		return unwrapResponse<AuthenticatedUser>(response.data);
	}

	async logout() {
		await this.http.post(this.endpoint('/logout'), undefined, this.requestConfig());
	}

	async getWorkflows() {
		const response = await this.http.get(this.endpoint('/workflows'), {
			...this.requestConfig(),
			params: { includeScopes: false },
		});
		const payload = unwrapResponse<{ workflows: WorkflowSummary[] }>(response.data);
		return payload.workflows;
	}

	async getActiveWorkflowIds() {
		const response = await this.http.get(this.endpoint('/active-workflows'), this.requestConfig());
		return unwrapResponse<string[]>(response.data);
	}

	async setWorkflowActive(workflowId: string, active: boolean) {
		const response = await this.http.patch(
			this.endpoint(`/workflows/${workflowId}`),
			{ active },
			this.requestConfig(),
		);
		return unwrapResponse<WorkflowSummary>(response.data);
	}

	private endpoint(path: string) {
		const normalized = path.startsWith('/') ? path : `/${path}`;
		return `/${this.restPath}${normalized}`;
	}

	private requestConfig(): AxiosRequestConfig {
		const headers: Record<string, string> = { 'browser-id': this.browserId };
		const cookieHeader = this.getCookieHeader();
		if (cookieHeader) {
			headers['Cookie'] = cookieHeader;
		}
		return { headers };
	}

	private getCookieHeader() {
		const entries = Object.entries(this.cookies);
		if (!entries.length) return undefined;
		return entries.map(([name, value]) => `${name}=${value}`).join('; ');
	}

	private storeCookies(cookies: string[]) {
		cookies.forEach((cookie) => {
			const [pair] = cookie.split(';');
			const [name, value] = pair.split('=');
			if (name && value !== undefined) {
				this.cookies[name.trim()] = value.trim();
			}
		});
	}
}

function normalizeBaseUrl(baseUrl: string) {
	if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
		return `http://${baseUrl.replace(/\/$/, '')}`;
	}
	return baseUrl.replace(/\/$/, '');
}

function normalizeRestPath(restPath: string) {
	return restPath.replace(/^\/+|\/+$/g, '') || 'rest';
}

function unwrapResponse<T>(payload: unknown): T {
	if (payload && typeof payload === 'object' && 'data' in payload) {
		const data = (payload as { data: T }).data;
		return data;
	}
	return payload as T;
}
