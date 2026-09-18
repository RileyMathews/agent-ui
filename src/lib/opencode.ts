import { OpenCode } from '@opencode/client';

const OPENCODE_USERNAME = 'opencode';
export const OPENCODE_PASSWORD = 'fhjqE1DSFo4MbH76Au559gm3WNgs1j6DatstSGWqYMM';

export function getOpencode(server: string) {
	const credentials = `${OPENCODE_USERNAME}:${OPENCODE_PASSWORD}`;
	return OpenCode.make({
		baseUrl: server,
		headers: { Authorization: `Basic ${globalThis.btoa(credentials)}` }
	});
}
