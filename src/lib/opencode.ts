import { createOpencodeClient } from '@opencode-ai/sdk/client';
import { createOpencodeClient as createOpencodeV2Client } from '@opencode-ai/sdk/v2/client';

const config = {
	baseUrl: 'https://scottyopencode.rileymathews.com',
	responseStyle: 'data' as const,
	throwOnError: true
};

export const opencode = createOpencodeClient(config);
export const opencodeV2 = createOpencodeV2Client(config);
