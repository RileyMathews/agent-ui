import type { ModelInfo } from '@opencode/client';

export function dedupeModels(models: ModelInfo[]): ModelInfo[] {
	const seen = new Set<string>();
	return models.filter((model) => {
		const identity = `${model.providerID}/${model.modelID}`;
		if (seen.has(identity)) return false;
		seen.add(identity);
		return true;
	});
}
