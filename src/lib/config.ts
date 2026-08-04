export type Server = {
	id: string;
	name: string;
	url: string;
};

export type SubprojectConfig = {
	id: string;
	name: string;
	path: string;
};

export type ProjectConfig = {
	id: string;
	name: string;
	repository: string;
	directory: string;
	subprojects?: SubprojectConfig[];
};

export type Project = {
	id: string;
	name: string;
	repository: string;
	directory: string;
	worktree: string;
	parentID?: string;
	parentName?: string;
};

export const servers: Server[] = [
	{
		id: 'scottyopencode.rileymathews.com',
		name: 'scottyopencode',
		url: 'https://scottyopencode.rileymathews.com'
	},
	{
		id: 'opencode.rileymathews.com',
		name: 'opencode',
		url: 'https://opencode.rileymathews.com'
	}
];

export const projectConfigs: ProjectConfig[] = [
	{
		id: 'configs',
		name: 'configs',
		repository: 'ssh://git@git.rileymathews.com/riley/configs.git',
		directory: '/home/riley/code/configs',
		subprojects: [
			{ id: 'nixos-config', name: 'nixos-config', path: 'nixos-config' },
			{ id: 'dotfiles', name: 'dotfiles', path: 'dotfiles' },
			{ id: 'agent-ui', name: 'agent-ui', path: 'agent-ui' },
			{ id: 'agent-dev', name: 'agent-dev', path: 'ansible/agent-dev' }
		]
	},
	{
		id: 'tedlib',
		name: 'tedlib',
		repository: 'ssh://git@git.rileymathews.com/riley/tedlib.git',
		directory: '/home/riley/code/tedlib'
	}
];

export const projects: Project[] = projectConfigs.flatMap((project) => [
	{
		id: project.id,
		name: project.name,
		repository: project.repository,
		directory: project.directory,
		worktree: project.directory
	},
	...(project.subprojects ?? []).map((subproject) => ({
		id: subproject.id,
		name: subproject.name,
		repository: project.repository,
		directory: `${project.directory}/${subproject.path}`,
		worktree: project.directory,
		parentID: project.id,
		parentName: project.name
	}))
]);

export function getServer(id: string | null | undefined) {
	return servers.find((server) => server.id === id);
}

export function getProject(id: string | null | undefined) {
	return projects.find((project) => project.id === id);
}

export function sessionHref(sessionID: string, serverID: string, projectID: string) {
	return `/session/${encodeURIComponent(sessionID)}?${new URLSearchParams({ server: serverID, project: projectID })}`;
}
