import { expect, test } from '@playwright/test';

test('lists hosts with terminal launchers into their home directory', async ({ page }) => {
	await page.route('https://**/*', (route) => route.abort());
	await page.setViewportSize({ width: 320, height: 700 });
	await page.goto('/');

	const hosts = page.getByRole('region', { name: 'Hosts' });
	await expect(hosts).toBeVisible();
	await expect(hosts.getByRole('link', { name: /scottyopencode/ })).toBeVisible();
	await expect(hosts.getByRole('link', { name: /ds9opencode/ })).toBeVisible();
	await expect(hosts.getByRole('link', { name: 'opencode /home/riley Terminal >_', exact: true })).toBeVisible();

	for (const href of await hosts.locator('a').evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href))) {
		const url = new URL(href);
		expect(url.pathname).toBe('/terminal');
		expect(url.searchParams.get('directory')).toBe('/home/riley');
		expect(url.searchParams.get('returnTo')).toBe('/');
	}

	await expect(hosts.locator('a').first()).toHaveAttribute('href', /server=.*opencode\.rileymathews\.com/);
	await expect(page.locator('.host-list')).toHaveCount(1);
	await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});