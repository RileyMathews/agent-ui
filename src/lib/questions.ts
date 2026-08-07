import { getOpencodeV2 } from '$lib/opencode';

export type QuestionOption = {
	label: string;
	description: string;
};

export type QuestionPrompt = {
	question: string;
	header: string;
	options: QuestionOption[];
	multiple?: boolean;
	custom?: boolean;
};

export type PendingQuestion = {
	id: string;
	sessionID: string;
	questions: QuestionPrompt[];
	tool?: {
		messageID: string;
		callID: string;
	};
};

export async function listPendingQuestions(server: string, directory: string, sessionID: string) {
	const questions = (await getOpencodeV2(server).question.list({ directory })) as unknown as PendingQuestion[];
	return questions.filter((request) => request.sessionID === sessionID);
}

export function answerQuestion(server: string, directory: string, requestID: string, answers: string[][]) {
	return getOpencodeV2(server).question.reply({ requestID, directory, answers });
}

export function rejectQuestion(server: string, directory: string, requestID: string) {
	return getOpencodeV2(server).question.reject({ requestID, directory });
}

type QuestionEvent = {
	type?: string;
	properties?: Partial<PendingQuestion> & { requestID?: string };
	data?: Partial<PendingQuestion> & { requestID?: string };
};

export function questionEvent(event: unknown) {
	const candidate = event as QuestionEvent;
	if (!candidate.type?.startsWith('question.')) return;

	const payload = candidate.data ?? candidate.properties;
	if (!payload) return;
	if (candidate.type === 'question.asked' || candidate.type === 'question.v2.asked') {
		if (typeof payload.id !== 'string' || typeof payload.sessionID !== 'string' || !Array.isArray(payload.questions)) return;
		return {
			type: 'asked' as const,
			request: payload as PendingQuestion
		};
	}

	if (candidate.type === 'question.replied' || candidate.type === 'question.rejected' || candidate.type === 'question.v2.replied' || candidate.type === 'question.v2.rejected') {
		if (typeof payload.sessionID !== 'string' || typeof payload.requestID !== 'string') return;
		return {
			type: 'removed' as const,
			sessionID: payload.sessionID,
			requestID: payload.requestID
		};
	}
}
