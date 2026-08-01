import type { SessionV2Info, V2SessionListResponse } from '@opencode-ai/sdk/v2/client';
import { opencodeV2 } from '$lib/opencode';

const pageLimit = 5000;

export async function listSessions() {
	const sessions: SessionV2Info[] = [];
	let cursor: string | undefined;

	for (;;) {
		// The generated SDK types do not preserve the client's responseStyle setting.
		const page = (await opencodeV2.v2.session.list({
			limit: pageLimit,
			order: 'desc',
			cursor
		})) as unknown as V2SessionListResponse;
		sessions.push(...page.data);

		if (page.data.length < pageLimit || !page.cursor.next) return sessions;
		cursor = page.cursor.next;
	}
}
