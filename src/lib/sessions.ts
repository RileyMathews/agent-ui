import type {
	Project as OpencodeProject,
	SessionStatusResponse,
	SessionV2Info,
	VcsInfo,
	VcsStatusResponse,
	V2SessionListResponse
} from '@opencode-ai/sdk/v2/client';
import type { Project, Server } from '$lib/config';
import { getOpencodeV2 } from '$lib/opencode';

const pageLimit = 5000;

export async function listSessions(server: string, directory?: string) {
	const sessions: SessionV2Info[] = [];
	const opencodeV2 = getOpencodeV2(server);
	let cursor: string | undefined;

	for (;;) {
		// The generated SDK types do not preserve the client's responseStyle setting.
		const page = (await opencodeV2.v2.session.list({
			limit: pageLimit,
			order: 'desc',
			directory,
			cursor
		})) as unknown as V2SessionListResponse;
		sessions.push(...page.data);

		if (page.data.length < pageLimit || !page.cursor.next) return sessions;
		cursor = page.cursor.next;
	}
}

export type ProjectServerState = {
	server: Server;
	available: boolean;
	sessions: SessionV2Info[];
	statuses: SessionStatusResponse;
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
	const client = getOpencodeV2(server.url);
	let current: OpencodeProject;
	try {
		// The generated SDK types do not preserve the client's responseStyle setting.
		current = await client.project.current({ directory: project.directory }) as unknown as OpencodeProject;
	} catch (cause) {
		return {
			server,
			available: false,
			error: cause instanceof Error ? cause.message : 'Unable to reach server.'
		};
	}

	if (current.vcs !== 'git' || normalizePath(current.worktree) !== normalizePath(project.worktree)) {
		return { server, available: false };
	}

	try {
		await client.file.list({ directory: project.directory, path: '.' });
		return { server, available: true };
	} catch {
		return { server, available: false };
	}
}

export async function loadProjectServer(project: Project, server: Server): Promise<ProjectServerState> {
	const availability = await checkProject(project, server);
	if (!availability.available) return { ...availability, sessions: [], statuses: {} };

	const client = getOpencodeV2(server.url);
	const [sessionResult, gitResult] = await Promise.allSettled([
		Promise.all([
			listSessions(server.url, project.directory),
			getSessionStatuses(server.url, project.directory).catch(() => ({}))
		]),
		Promise.all([
			client.vcs.get({ directory: project.directory }) as unknown as Promise<VcsInfo>,
			client.vcs.status({ directory: project.directory }) as unknown as Promise<VcsStatusResponse>
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
					branch: gitResult.value[0].branch,
					defaultBranch: gitResult.value[0].default_branch,
					dirty: gitResult.value[1].length > 0,
					changedFiles: gitResult.value[1].length
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

export function isWorking(statuses: SessionStatusResponse, sessionID: string) {
	return statuses[sessionID]?.type === 'busy' || statuses[sessionID]?.type === 'retry';
}

export async function getSessionStatuses(server: string, directory: string) {
	// The generated SDK types do not preserve the client's responseStyle setting.
	return (await getOpencodeV2(server).session.status({ directory })) as unknown as SessionStatusResponse;
}
