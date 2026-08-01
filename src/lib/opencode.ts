import { createOpencodeClient } from '@opencode-ai/sdk/client';

export const opencode = createOpencodeClient({
	baseUrl: 'https://scottyopencode.rileymathews.com',
	responseStyle: 'data',
	throwOnError: true
});
