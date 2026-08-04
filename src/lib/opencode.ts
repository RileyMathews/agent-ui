import { createOpencodeClient } from '@opencode-ai/sdk/client';
import { createOpencodeClient as createOpencodeV2Client } from '@opencode-ai/sdk/v2/client';

export function getOpencode(server: string) {
	return createOpencodeClient({
		baseUrl: server,
		responseStyle: 'data',
		throwOnError: true
	});
}

export function getOpencodeV2(server: string) {
	return createOpencodeV2Client({
		baseUrl: server,
		responseStyle: 'data',
		throwOnError: true
	});
}
