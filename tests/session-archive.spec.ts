import { expect, test } from '@playwright/test';

const directory = '/home/riley/code/configs/agent-ui';
const activeSession = {
	id: 'active-session',
	projectID: 'configs',
	cost: 0,
	tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
	time: { created: 10, updated: 20 },
	title: 'Active session',
	location: { type: 'path', path: directory }
};
const archivedSession = {
	...activeSession,
	id: 'archived-session',
	time: { created: 5, updated: 15, archived: 16 },
	title: 'Archived session'
};

test('selects, archives, and reveals archived sessions', async ({ page }) => {
	const archiveRequests: unknown[] = [];

	await page.route('https://*/**', async (route) => {
		const url = new URL(route.request().url());
		if (!url.hostname.endsWith('opencode.rileymathews.com')) return route.continue();
		if (url.hostname === 'opencode.rileymathews.com') {
			if (url.pathname === '/project/current') return route.fulfill({ json: { id: 'other', vcs: 'none', worktree: '/tmp' } });
			return route.abort();
		}
		if (url.pathname === '/project/current') return route.fulfill({ json: { id: 'configs', vcs: 'git', worktree: '/home/riley/code/configs' } });
		if (url.pathname === '/file') return route.fulfill({ json: [] });
		if (url.pathname === '/api/session') return route.fulfill({ json: { data: [activeSession, archivedSession], cursor: {} } });
		if (url.pathname === '/session/status') return route.fulfill({ json: {} });
		if (url.pathname === '/vcs') return route.fulfill({ json: { branch: 'main', default_branch: 'main' } });
		if (url.pathname === '/vcs/status') return route.fulfill({ json: [] });
		if (url.pathname === '/session/active-session' && route.request().method() === 'PATCH') {
			archiveRequests.push(route.request().postDataJSON());
			return route.fulfill({ json: { ...activeSession, time: { ...activeSession.time, archived: Date.now() } } });
		}
		return route.abort();
	});

	await page.setViewportSize({ width: 320, height: 700 });
	await page.goto('/project/agent-ui');

	await expect(page.getByRole('link', { name: /Active session/ })).toBeVisible();
	await expect(page.getByRole('link', { name: /Archived session/ })).toBeHidden();
	await page.getByLabel('Show archived').check();
	const archivedCard = page.getByRole('link', { name: /Archived session/ }).locator('..');
	await expect(archivedCard).toHaveCSS('border-left-color', 'rgb(105, 113, 112)');

	await page.getByLabel('Show archived').uncheck();
	await page.getByLabel('Select all').check();
	await expect(page.getByRole('button', { name: 'Archive (1)' })).toBeVisible();
	await page.getByRole('button', { name: 'Archive (1)' }).click();

	await expect(page.getByRole('link', { name: /Active session/ })).toBeHidden();
	expect(archiveRequests).toHaveLength(1);
	expect(archiveRequests[0]).toMatchObject({ time: { archived: expect.any(Number) } });
	await page.getByLabel('Show archived').check();
	await expect(page.getByRole('link', { name: /Active session/ })).toBeVisible();
});
