import { Command } from 'commander';
import inquirer from 'inquirer';
import type { Question } from 'inquirer';
import chalk from 'chalk';

import { AuthenticatedUser, N8nClient, WorkflowSummary } from './api';

interface CliOptions {
	baseUrl: string;
	restPath: string;
	email?: string;
	password?: string;
}

const program = new Command();

program
	.name('n8n-workflow-manager')
	.description('Gestiona tus automatizaciones de n8n sin abrir la interfaz web.')
	.option(
		'-u, --base-url <url>',
		'URL base de n8n',
		process.env.N8N_BASE_URL ?? 'http://localhost:5678',
	)
	.option('-r, --rest-path <path>', 'Ruta del endpoint REST', process.env.N8N_REST_PATH ?? 'rest')
	.option('-e, --email <email>', 'Correo electrónico de la cuenta n8n', process.env.N8N_EMAIL)
	.option(
		'-p, --password <password>',
		'Contraseña de la cuenta n8n (usa variables de entorno para mayor seguridad)',
		process.env.N8N_PASSWORD,
	);

program
	.command('list')
	.description('Muestra los workflows disponibles y su estado actual.')
	.action(async () => {
		const options = getCliOptions();
		const { client } = await authenticate(options);
		await showWorkflows(client);
	});

program
	.command('activate <workflowId>')
	.description('Activa un workflow específico.')
	.action(async (workflowId: string) => {
		const options = getCliOptions();
		const { client } = await authenticate(options);
		await toggleWorkflow(client, workflowId, true);
	});

program
	.command('deactivate <workflowId>')
	.description('Desactiva un workflow específico.')
	.action(async (workflowId: string) => {
		const options = getCliOptions();
		const { client } = await authenticate(options);
		await toggleWorkflow(client, workflowId, false);
	});

program
	.command('interactive')
	.description('Inicia un asistente interactivo para activar o desactivar workflows.')
	.action(async () => {
		const options = getCliOptions();
		const { client, user } = await authenticate(options);
		await runInteractiveSession(client, user);
	});

program.action(async () => {
	const options = getCliOptions();
	const { client, user } = await authenticate(options);
	await runInteractiveSession(client, user);
});

program.parseAsync(process.argv).catch((error: Error) => {
	console.error(chalk.red(`Error: ${error.message}`));
	process.exitCode = 1;
});

function getCliOptions(): CliOptions {
	const opts = program.opts();
	return {
		baseUrl: opts.baseUrl,
		restPath: opts.restPath,
		email: opts.email,
		password: opts.password,
	};
}

async function authenticate(options: CliOptions) {
	const answers = await askForCredentials(options);
	const client = new N8nClient({ baseUrl: answers.baseUrl, restPath: answers.restPath });
	const user = await client.login(answers.email, answers.password);
	console.log(
		chalk.green(
			`Sesión iniciada correctamente como ${user.firstName ?? ''} ${
				user.lastName ?? ''
			} <${user.email}>`.replace(/\s+/g, ' '),
		),
	);
	return { client, user };
}

async function askForCredentials(options: CliOptions) {
	type CredentialsAnswers = { email: string; password: string };
	const questions: Question<CredentialsAnswers>[] = [];

	if (!options.email) {
		questions.push({
			type: 'input',
			name: 'email',
			message: 'Correo electrónico:',
			validate: (value: string) => value.trim() !== '' || 'Introduce tu correo electrónico.',
		});
	}

	if (!options.password) {
		questions.push({
			type: 'password',
			name: 'password',
			message: 'Contraseña:',
			validate: (value: string) => value.trim() !== '' || 'Introduce tu contraseña.',
		});
	}

	const answers = await inquirer.prompt<{ email: string; password: string }>(questions);

	return {
		baseUrl: options.baseUrl,
		restPath: options.restPath,
		email: options.email ?? answers.email,
		password: options.password ?? answers.password,
	};
}

async function showWorkflows(client: N8nClient) {
	const workflows = await client.getWorkflows();
	const activeIds = await client.getActiveWorkflowIds();
	if (workflows.length === 0) {
		console.log(chalk.yellow('No se encontraron workflows disponibles.'));
		return;
	}
	console.log();
	console.log(chalk.bold('Workflows disponibles:'));
	workflows.forEach((workflow, index) => {
		const status = activeIds.includes(workflow.id) ? chalk.green('Activo') : chalk.gray('Inactivo');
		const line = `${index + 1}. ${workflow.name} (${workflow.id}) - ${status}`;
		console.log(line);
	});
	console.log();
}

async function toggleWorkflow(client: N8nClient, workflowId: string, active: boolean) {
	const action = active ? 'activar' : 'desactivar';
	try {
		const updated = await client.setWorkflowActive(workflowId, active);
		const status = updated.active ? chalk.green('ACTIVO') : chalk.gray('INACTIVO');
		console.log(chalk.green(`Workflow "${updated.name}" actualizado. Estado actual: ${status}`));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(chalk.red(`No se pudo ${action} el workflow ${workflowId}. ${message}`));
		throw error;
	}
}

async function runInteractiveSession(client: N8nClient, user: AuthenticatedUser) {
	console.log(chalk.cyan(`Bienvenido, ${user.firstName ?? user.email}!`));
	let exit = false;

	while (!exit) {
		const workflows = await client.getWorkflows();
		const activeIds = await client.getActiveWorkflowIds();
		displayWorkflowSummary(workflows, activeIds);

		const { action } = await inquirer.prompt<{
			action: 'activate' | 'deactivate' | 'refresh' | 'exit';
		}>([
			{
				type: 'list',
				name: 'action',
				message: '¿Qué acción quieres realizar?',
				choices: [
					{ name: 'Activar un workflow', value: 'activate' },
					{ name: 'Desactivar un workflow', value: 'deactivate' },
					{ name: 'Actualizar listado', value: 'refresh' },
					{ name: 'Salir', value: 'exit' },
				],
			},
		]);

		if (action === 'exit') {
			exit = true;
			continue;
		}

		if (action === 'refresh') {
			continue;
		}

		const candidates = workflows.filter((workflow) =>
			action === 'activate' ? !activeIds.includes(workflow.id) : activeIds.includes(workflow.id),
		);

		if (candidates.length === 0) {
			console.log(chalk.yellow('No hay workflows disponibles para esa acción.'));
			continue;
		}

		const { workflowId } = await inquirer.prompt<{ workflowId: string }>([
			{
				type: 'list',
				name: 'workflowId',
				message:
					action === 'activate'
						? 'Selecciona un workflow para activar:'
						: 'Selecciona un workflow para desactivar:',
				choices: candidates.map((workflow) => ({
					name: `${workflow.name} (${workflow.id})`,
					value: workflow.id,
				})),
			},
		]);

		try {
			await toggleWorkflow(client, workflowId, action === 'activate');
		} catch (error) {
			// Error already mostrado en toggleWorkflow
		}
	}

	try {
		await client.logout();
	} catch {
		// Ignore logout errors
	}
	console.log(chalk.cyan('Sesión finalizada.'));
}

function displayWorkflowSummary(workflows: WorkflowSummary[], activeIds: string[]) {
	console.log();
	console.log(chalk.bold('Resumen de workflows:'));
	workflows.forEach((workflow) => {
		const isActive = activeIds.includes(workflow.id);
		const status = isActive ? chalk.green('Activo') : chalk.gray('Inactivo');
		const updatedAt = workflow.updatedAt
			? new Date(workflow.updatedAt).toLocaleString()
			: undefined;
		const suffix = updatedAt ? ` • Actualizado: ${updatedAt}` : '';
		console.log(`- ${workflow.name} (${workflow.id}) → ${status}${suffix}`);
	});
	console.log();
}
