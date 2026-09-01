import { z } from 'zod';

import type { TripDay } from '$lib/trip/itinerary';

const identifier = z
	.string()
	.trim()
	.min(1)
	.max(100)
	.regex(/^[A-Za-z0-9_-]+$/);
const standardCameras = ['Mobil', 'Kamera', 'Actionkamera', 'Drone', 'Annet'];
const standardBackupChecks = [
	'Filer kopiert fra minnekortene',
	'To kopier kontrollert',
	'Beste klipp notert',
	'Batterier til lading'
];
const shotSchema = z.object({
	text: z.string().trim().min(1).max(1000),
	camera: z.string().trim().min(1).max(200).optional()
});
const moduleSchema = z.object({
	title: z.string().trim().min(1).max(200),
	camera: z.string().trim().min(1).max(200),
	aRoll: z.array(z.number().int().nonnegative()).max(1000),
	shots: z.array(shotSchema).min(1).max(1000)
});

export const shotContentSchema = z
	.object({
		version: z.literal(1),
		cameras: z.array(z.string().trim().min(1).max(100)).min(1).max(100),
		backupChecks: z.array(z.string().trim().min(1).max(200)).min(1).max(100),
		modules: z.record(identifier, moduleSchema),
		activityModuleIds: z.array(identifier).max(1000),
		scenarioGroups: z
			.array(
				z.object({
					title: z.string().trim().min(1).max(200),
					ids: z.array(identifier).max(1000)
				})
			)
			.max(100),
		dayPlans: z
			.array(
				z.object({
					dayIndex: z.number().int().nonnegative(),
					modules: z.array(identifier).max(1000)
				})
			)
			.max(3660)
	})
	.strict()
	.superRefine((content, context): void => {
		if (new Set(content.cameras).size !== content.cameras.length) {
			context.addIssue({ code: 'custom', path: ['cameras'], message: 'Duplicate cameras' });
		}
		if (new Set(content.activityModuleIds).size !== content.activityModuleIds.length) {
			context.addIssue({
				code: 'custom',
				path: ['activityModuleIds'],
				message: 'Duplicate activity modules'
			});
		}
		const moduleIds = new Set(Object.keys(content.modules));
		for (const [moduleId, module] of Object.entries(content.modules)) {
			if (new Set(module.aRoll).size !== module.aRoll.length) {
				context.addIssue({
					code: 'custom',
					path: ['modules', moduleId, 'aRoll'],
					message: 'Duplicate A-roll index'
				});
			}
			if (module.aRoll.some((index) => index >= module.shots.length)) {
				context.addIssue({
					code: 'custom',
					path: ['modules', moduleId, 'aRoll'],
					message: 'A-roll index out of range'
				});
			}
		}
		const grouped = content.scenarioGroups.flatMap((group) => group.ids);
		if (
			grouped.some((id) => !moduleIds.has(id)) ||
			content.activityModuleIds.some((id) => !moduleIds.has(id)) ||
			new Set(grouped).size !== grouped.length ||
			new Set(grouped).size !== content.activityModuleIds.length ||
			content.activityModuleIds.some((id) => !grouped.includes(id))
		) {
			context.addIssue({
				code: 'custom',
				path: ['scenarioGroups'],
				message: 'Invalid activity module references'
			});
		}
		if (new Set(content.dayPlans.map((plan) => plan.dayIndex)).size !== content.dayPlans.length) {
			context.addIssue({ code: 'custom', path: ['dayPlans'], message: 'Duplicate day plans' });
		}
		if (content.dayPlans.some((plan) => plan.modules.some((id) => !moduleIds.has(id)))) {
			context.addIssue({
				code: 'custom',
				path: ['dayPlans'],
				message: 'Invalid fixed module reference'
			});
		}
	});

export type ShotContent = z.infer<typeof shotContentSchema>;
export type ShotModule = ShotContent['modules'][string];

function dayPlans(days: readonly TripDay[]): ShotContent['dayPlans'] {
	return days.map((day) => ({
		dayIndex: day.index,
		modules: []
	}));
}

export function blankShotContent(days: readonly TripDay[]): ShotContent {
	return {
		version: 1,
		cameras: [...standardCameras],
		backupChecks: [...standardBackupChecks],
		modules: {},
		activityModuleIds: [],
		scenarioGroups: [],
		dayPlans: dayPlans(days)
	};
}

export function standardShotContent(days: readonly TripDay[]): ShotContent {
	const content: ShotContent = {
		...blankShotContent(days),
		modules: {
			dagensHistorie: {
				title: 'Dagens historie',
				camera: 'Kamera eller mobil',
				aRoll: [0, 1],
				shots: [
					{ text: 'En tydelig åpning som viser hvor dagen begynner.', camera: 'Kamera' },
					{ text: 'Dagens viktigste handling og reaksjonene rundt den.', camera: 'Mobil' },
					{ text: 'Detaljer, omgivelser og en rolig overgang.' },
					{ text: 'Et avsluttende klipp som runder av dagen.' }
				]
			},
			maltid: {
				title: 'Måltid',
				camera: 'Kamera eller mobil',
				aRoll: [1],
				shots: [
					{ text: 'Forberedelser og råvarer før maten er klar.' },
					{ text: 'Alle samles og måltidet serveres.' },
					{ text: 'Detaljer av maten og stemningen rundt bordet.' }
				]
			},
			omgivelser: {
				title: 'Omgivelser og B-roll',
				camera: 'Valgfritt kamera',
				aRoll: [],
				shots: [
					{ text: 'Et bredt oversiktsklipp av stedet.' },
					{ text: 'Nære detaljer som viser vær, lys og miljø.' },
					{ text: 'Mennesker i naturlige øyeblikk uten regi.' }
				]
			}
		},
		activityModuleIds: ['dagensHistorie', 'maltid', 'omgivelser'],
		scenarioGroups: [{ title: 'Generelle scener', ids: ['dagensHistorie', 'maltid', 'omgivelser'] }]
	};
	return shotContentSchema.parse(content);
}
