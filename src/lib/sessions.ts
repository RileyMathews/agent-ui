import type { SessionInfo, SessionStatus, VcsInfo, VcsStatusOutput } from '@opencode/client';
import type { Project, Server } from '$lib/config';
import { getOpencode } from '$lib/opencode';

const pageLimit = 5000;

export async function listSessions(server: string, directory?: string) {
	const sessions: SessionInfo[] = [];
	const opencode = getOpencode(server);
	let cursor: string | undefined;

	for (;;) {
		const page = await opencode.session.list({
			limit: pageLimit,
			order: 'desc',
			directory,
			cursor
		});
		sessions.push(...page.data);

		if (page.data.length < pageLimit || !page.cursor.next) return sessions;
		cursor = page.cursor.next;
	}
}

export type ProjectServerState = {
	server: Server;
	available: boolean;
	sessions: SessionInfo[];
	statuses: Record<string, SessionStatus>;
	git?: {
		branch?: string;
		defaultBranch?: string;
		dirty: boolean;
		changedFiles: number;
	};
	error?: string;
	sessionError?: string;
	gitError?: string;
};

export type ProjectAvailability = Pick<ProjectServerState, 'server' | 'available' | 'error'>;

function normalizePath(path: string) {
	return path.replace(/\/+$/, '') || '/';
}

export async function checkProject(project: Project, server: Server): Promise<ProjectAvailability> {
	const client = getOpencode(server.url);
	let current: { directory: string; project: { canonical: string } };
	try {
		current = await client.location.get({ location: { directory: project.directory } });
	} catch (cause) {
		return {
			server,
			available: false,
			error: cause instanceof Error ? cause.message : 'Unable to reach server.'
		};
	}

	if (normalizePath(current.project.canonical) !== normalizePath(project.worktree)) {
		return { server, available: false };
	}

	try {
		await client.file.list({ location: { directory: project.directory }, path: '.' });
		return { server, available: true };
	} catch {
		return { server, available: false };
	}
}

export async function loadProjectServer(project: Project, server: Server): Promise<ProjectServerState> {
	const availability = await checkProject(project, server);
	if (!availability.available) return { ...availability, sessions: [], statuses: {} };

	const client = getOpencode(server.url);
	const [sessionResult, gitResult] = await Promise.allSettled([
		Promise.all([
			listSessions(server.url, project.directory),
			getSessionStatuses(server.url, project.directory).catch(() => ({}))
		]),
		Promise.all([
			client.vcs.get({ location: { directory: project.directory } }),
			client.vcs.status({ location: { directory: project.directory } }) as Promise<VcsStatusOutput>
		])
	]);

	return {
		...availability,
		sessions: sessionResult.status === 'fulfilled'
			? sessionResult.value[0]
				.filter((session) => !session.parentID)
				.sort((left, right) => right.time.updated - left.time.updated)
			: [],
		statuses: sessionResult.status === 'fulfilled' ? sessionResult.value[1] : {},
		git: gitResult.status === 'fulfilled'
			? {
					branch: gitResult.value[0].data.branch.current,
					defaultBranch: gitResult.value[0].data.branch.default,
					dirty: gitResult.value[1].data.length > 0,
					changedFiles: gitResult.value[1].data.length
				}
			: undefined,
		sessionError: sessionResult.status === 'rejected'
			? sessionResult.reason instanceof Error ? sessionResult.reason.message : 'Unable to load sessions.'
			: undefined,
		gitError: gitResult.status === 'rejected'
			? gitResult.reason instanceof Error ? gitResult.reason.message : 'Unable to load git status.'
			: undefined
	};
}

export type ServerLoad<T> =
	| { status: 'pending' }
	| { status: 'ready'; value: T }
	| { status: 'error'; error: string };

export function isReady<T>(load: ServerLoad<T> | undefined): load is { status: 'ready'; value: T } {
	return load?.status === 'ready';
}

export async function loadInParallel<T>(
	entries: { id: string; load: () => Promise<T> }[],
	report: (id: string, load: ServerLoad<T>) => void
) {
	await Promise.allSettled(
		entries.map(async ({ id, load }) => {
			try {
				report(id, { status: 'ready', value: await load() });
			} catch (cause) {
				report(id, { status: 'error', error: cause instanceof Error ? cause.message : 'Unable to load.' });
			}
		})
	);
}

export function isWorking(statuses: Record<string, SessionStatus>, sessionID: string) {
	return statuses[sessionID]?.type === 'busy' || statuses[sessionID]?.type === 'retry';
}

export async function getSessionStatuses(server: string, directory: string) {
	return await getOpencode(server).session.active();
}
