import type { FormAnswer, FormDetail, FormField, FormInfo, FormValue } from '@opencode/client';
import { getOpencode } from '$lib/opencode';

export type FormValues = Record<string, FormValue | undefined>;

export async function listForms(server: string, sessionID: string): Promise<FormInfo[]> {
	return getOpencode(server).session.form.list({ sessionID });
}

export async function getForm(server: string, sessionID: string, formID: string): Promise<FormDetail> {
	return getOpencode(server).session.form.get({ sessionID, formID });
}

export function isFieldVisible(field: FormField, values: FormValues) {
	if (field.type === 'external') return true;
	return !field.hidden && (field.when ?? []).every((condition) => {
		const value = values[condition.key];
		return condition.op === 'eq' ? value === condition.value : value !== condition.value;
	});
}

export function initialValues(fields: FormField[]): FormValues {
	return Object.fromEntries(fields.map((field) => [field.key, 'default' in field ? field.default : field.type === 'multiselect' ? [] : field.type === 'boolean' ? false : undefined]));
}

export function validateForm(fields: FormField[], values: FormValues): Record<string, string> {
	const errors: Record<string, string> = {};
	for (const field of fields) {
		if (!isFieldVisible(field, values) || field.type === 'external') continue;
		const value = values[field.key];
		if (field.required && (value === undefined || value === '' || (Array.isArray(value) && value.length === 0))) errors[field.key] = 'This field is required.';
		if ((field.type === 'number' || field.type === 'integer') && value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) errors[field.key] = 'Enter a valid number.';
		if ((field.type === 'number' || field.type === 'integer') && typeof value === 'number' && ((field.minimum !== undefined && value < Number(field.minimum)) || (field.maximum !== undefined && value > Number(field.maximum)) || (field.type === 'integer' && !Number.isInteger(value)))) errors[field.key] = 'Enter a value in the allowed range.';
		if (field.type === 'multiselect' && Array.isArray(value) && ((field.minItems !== undefined && value.length < field.minItems) || (field.maxItems !== undefined && value.length > field.maxItems))) errors[field.key] = 'Choose the allowed number of options.';
	}
	return errors;
}

export function answerFromValues(fields: FormField[], values: FormValues): FormAnswer {
	const answer: FormAnswer = {};
	for (const field of fields) {
		if (isFieldVisible(field, values) && field.type !== 'external' && values[field.key] !== undefined) answer[field.key] = values[field.key]!;
	}
	return answer;
}
