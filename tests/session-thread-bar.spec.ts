import { expect, test } from '@playwright/test';

const directory = '/home/riley/code/configs/agent-ui';

test('shows session context and archives after confirmation', async ({ page }) => {
	let archiveRequest: unknown;

	await page.route('https://scottyopencode.rileymathews.com/**', async (route) => {
		const url = new URL(route.request().url());
		if (url.pathname === '/event') return new Promise(() => {});
		if (url.pathname === '/session/test/message') return route.fulfill({ json: [] });
		if (url.pathname === '/session/test' && route.request().method() === 'GET') {
			return route.fulfill({ json: { id: 'test', directory, title: 'Sticky bar session' } });
		}
		if (url.pathname === '/session/test' && route.request().method() === 'PATCH') {
			archiveRequest = route.request().postDataJSON();
			return route.fulfill({ json: { id: 'test', directory, title: 'Sticky bar session' } });
		}
		return route.abort();
	});

	await page.setViewportSize({ width: 320, height: 700 });
	await page.goto('/session/test?server=scottyopencode.rileymathews.com&project=agent-ui');

	const bar = page.getByRole('navigation', { name: 'Session controls' });
	await expect(bar).toHaveCSS('position', 'sticky');
	await expect(page.getByText('scottyopencode', { exact: true }).first()).toBeVisible();
	await expect(page.getByRole('link', { name: 'Sticky bar session' })).toHaveAttribute(
		'href',
		'https://scottyopencode.rileymathews.com/L2hvbWUvcmlsZXkvY29kZS9jb25maWdzL2FnZW50LXVp/session/test'
	);
	await expect(page.getByRole('link', { name: 'Home dashboard' })).toHaveAttribute('href', '/');

	page.on('dialog', (dialog) => dialog.dismiss());
	await page.getByRole('button', { name: 'Archive' }).click();
	expect(archiveRequest).toBeUndefined();
	await expect(page).toHaveURL(/\/session\/test/);

	page.removeAllListeners('dialog');
	page.on('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: 'Archive' }).click();
	await expect(page).toHaveURL('/');
	expect(archiveRequest).toMatchObject({ time: { archived: expect.any(Number) } });
});
