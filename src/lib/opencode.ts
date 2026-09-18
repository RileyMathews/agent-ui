import { OpenCode } from '@opencode/client';

export function getOpencode(server: string) {
	return OpenCode.make({ baseUrl: server });
}
