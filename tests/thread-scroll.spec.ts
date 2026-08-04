import { expect, test } from '@playwright/test';

test('follows new thread content until the user scrolls up and resumes from the bottom button', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 700 });
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.route('https://scottyopencode.rileymathews.com/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/event') return new Promise(() => {});
		if (path === '/session/test/message') {
			return route.fulfill({
				json: Array.from({ length: 24 }, (_, index) => ({
					info: { id: `message-${index}`, role: index % 2 === 0 ? 'user' : 'assistant' },
					parts: [{
						id: `part-${index}`,
						messageID: `message-${index}`,
						sessionID: 'test',
						type: 'text',
						text: `Message ${index}: ${'thread content '.repeat(12)}`
					}]
				}))
			});
		}
		if (path === '/session/test') {
			return route.fulfill({ json: { id: 'test', directory: '/home/riley/code/configs/agent-ui' } });
		}
		return route.abort();
	});

	await page.goto('/session/test?server=scottyopencode.rileymathews.com&project=agent-ui');
	await expect(page.getByRole('region', { name: 'Session messages' })).toBeVisible();

	const distanceFromBottom = () => page.evaluate(() =>
		document.documentElement.scrollHeight - window.innerHeight - window.scrollY
	);
	const appendContent = (height: number) => page.evaluate((contentHeight) => {
		const content = document.createElement('div');
		content.dataset.testAppend = '';
		content.style.height = `${contentHeight}px`;
		document.querySelector('section')?.append(content);
	}, height);

	await expect.poll(distanceFromBottom).toBeLessThanOrEqual(1);
	await appendContent(300);
	await expect.poll(distanceFromBottom).toBeLessThanOrEqual(1);
	await page.mouse.wheel(0, 100);
	await page.evaluate(() => document.querySelector('[data-test-append]')?.remove());
	await expect(page.getByRole('button', { name: 'Following newest messages' })).toHaveAttribute('aria-pressed', 'true');
	await expect.poll(distanceFromBottom).toBeLessThanOrEqual(1);
	await appendContent(300);
	await expect.poll(distanceFromBottom).toBeLessThanOrEqual(1);

	await page.evaluate(() => window.scrollBy({ top: -350, behavior: 'auto' }));
	await expect(page.getByRole('button', { name: 'Following newest messages' })).toHaveAttribute('aria-pressed', 'true');
	await expect.poll(distanceFromBottom).toBeLessThanOrEqual(1);

	await page.mouse.wheel(0, -350);
	const followButton = page.getByRole('button', { name: 'Scroll to bottom and follow newest messages' });
	await expect(followButton).toHaveAttribute('aria-pressed', 'false');
	const pausedScrollTop = await page.evaluate(() => window.scrollY);

	await appendContent(400);
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(pausedScrollTop);

	await followButton.click();
	await expect(page.getByRole('button', { name: 'Following newest messages' })).toHaveAttribute('aria-pressed', 'true');
	await expect.poll(distanceFromBottom).toBeLessThanOrEqual(1);
	await appendContent(250);
	await expect.poll(distanceFromBottom).toBeLessThanOrEqual(1);
});
