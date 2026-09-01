import { type LogbookGpx, type LogbookLeg, mooringChoices } from '../domain/logbook';

export interface LogbookLegDraft {
	editingKey?: string;
	createdAt: string;
	createdBy: string;
	from: string;
	to: string;
	departure: string;
	arrival: string;
	nauticalMiles: number;
	sailingMinutes: number;
	engineMinutes: number;
	mooring: (typeof mooringChoices)[number]['value'];
	customMooring: string;
	gpx?: LogbookGpx;
	gpxFile?: File;
	readingGpx: boolean;
	error: string;
}

export function newLogbookLegDraft(from = ''): LogbookLegDraft {
	return {
		createdAt: '',
		createdBy: '',
		from,
		to: '',
		departure: '09:00',
		arrival: '12:00',
		nauticalMiles: 0,
		sailingMinutes: 0,
		engineMinutes: 0,
		mooring: 'anchor',
		customMooring: '',
		readingGpx: false,
		error: ''
	};
}

export function editLogbookLegDraft(editingKey: string, leg: LogbookLeg): LogbookLegDraft {
	return {
		editingKey,
		createdAt: leg.createdAt,
		createdBy: leg.createdBy,
		from: leg.from.name,
		to: leg.to.name,
		departure: leg.departure,
		arrival: leg.arrival,
		nauticalMiles: leg.nauticalMiles,
		sailingMinutes: leg.sailingMinutes,
		engineMinutes: leg.engineMinutes,
		mooring: leg.mooring,
		customMooring: leg.customMooring,
		gpx: leg.gpx,
		readingGpx: false,
		error: ''
	};
}
