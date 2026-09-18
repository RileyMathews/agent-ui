import type { OpenCodeClient, SessionMessageInfo } from '@opencode/client';

const MESSAGE_PAGE_SIZE = 200;

export async function getAllMessages(client: OpenCodeClient, sessionID: string): Promise<SessionMessageInfo[]> {
	const messages: SessionMessageInfo[] = [];
	const cursors = new Set<string>();
	let cursor: string | undefined;

	while (true) {
		const page = await client.message.list({
			sessionID,
			limit: MESSAGE_PAGE_SIZE,
			order: 'asc',
			...(cursor ? { cursor } : {})
		});
		messages.push(...page.data);

		if (page.data.length < MESSAGE_PAGE_SIZE || !page.cursor.next) break;
		if (cursors.has(page.cursor.next)) break;
		cursors.add(page.cursor.next);
		cursor = page.cursor.next;
	}

	return messages;
}
