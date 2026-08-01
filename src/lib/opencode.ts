import { createOpencodeClient } from '@opencode-ai/sdk/client';
import { createOpencodeClient as createOpencodeV2Client } from '@opencode-ai/sdk/v2/client';

export const OPENCODE_SERVER_URL = 'https://scottyopencode.rileymathews.com';

const config = {
	baseUrl: OPENCODE_SERVER_URL,
	responseStyle: 'data' as const,
	throwOnError: true
};

export const opencode = createOpencodeClient(config);
export const opencodeV2 = createOpencodeV2Client(config);
