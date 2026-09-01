import { describe, expect, test } from 'vitest';

import type { EditableItineraryEndpoint, Journey, KeyedItineraryItem } from '../domain/itinerary';
import type { ItineraryEditorDraft } from './itinerary-editor-command';
import { buildItineraryWrites } from './itinerary-editor-command';

const itemId = '11111111-1111-4111-8111-111111111111';
const legId = '22222222-2222-4222-8222-222222222222';

function endpoint(
	locationName: string,
	locationCode: string,
	localDateTime: string
): EditableItineraryEndpoint {
	return {
		locationName,
		locationCode,
		localDateTime,
		timeZone: 'Europe/Oslo',
		terminal: '',
		gate: '',
		platform: ''
	};
}

function draft(overrides: Partial<ItineraryEditorDraft> = {}): ItineraryEditorDraft {
	return {
		entryType: 'note',
		itemId,
		title: ' Husk pass ',
		bookingReference: '',
		bookingUrl: '',
		selectedParticipants: ['Håvard'],
		notes: ' Viktig ',
		createdAt: '',
		createdBy: '',
		journeyGroupId: itemId,
		journeyDirection: 'one-way',
		legs: [],
		staySubtype: 'hotel',
		rentalSubtype: 'car',
		bookingSubtype: 'activity',
		primary: endpoint('Oslo', '', '2027-06-01T09:00'),
		secondary: endpoint('Oslo', '', '2027-06-01T10:00'),
		bookingHasEnd: false,
		...overrides
	};
}

const identity = { now: '2027-05-01T10:00:00.000Z', actor: 'client-a' };

describe('itinerary editor command', (): void => {
	test('normalizes a plan entry into one shared-state write', (): void => {
		const result = buildItineraryWrites(draft(), identity);
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.writes).toHaveLength(1);
		expect(result.writes[0]).toMatchObject({
			key: `itinerary:item:${itemId}`,
			value: {
				kind: 'note',
				title: 'Husk pass',
				notes: 'Viktig',
				createdBy: 'client-a'
			}
		});
	});

	test('enforces transport arrival and single-leg invariants', (): void => {
		const firstLeg = {
			id: legId,
			mode: 'taxi' as const,
			operator: ' Taxi ',
			serviceNumber: ' ab12 ',
			from: endpoint('Oslo', 'osl', '2027-06-01T09:00'),
			to: endpoint('Bergen', 'bgo', '2027-06-01T10:00'),
			status: 'planned' as const,
			notes: ' Ring '
		};
		const result = buildItineraryWrites(
			draft({ entryType: 'taxi', legs: [firstLeg, { ...firstLeg, id: itemId }] }),
			identity
		);
		expect(result.success).toBe(true);
		if (!result.success) return;
		const value = result.writes[0]?.value as Record<string, unknown>;
		const legs = value.legs as Array<Record<string, unknown>>;
		expect(legs).toHaveLength(1);
		expect(legs[0]).toMatchObject({ operator: 'Taxi', serviceNumber: 'AB12', notes: 'Ring' });
		expect(legs[0]?.to).toMatchObject({
			locationCode: '',
			localDateTime: '2027-06-01T09:00'
		});
	});

	test('updates a one-way source when creating its return journey', (): void => {
		const source = {
			key: `itinerary:item:${itemId}`,
			id: itemId,
			kind: 'journey',
			groupId: itemId,
			direction: 'one-way',
			title: 'Oslo til Bergen',
			bookingReference: '',
			bookingUrl: '',
			participants: ['Håvard'],
			notes: '',
			version: 1,
			createdAt: '2027-04-01T10:00:00.000Z',
			createdBy: 'client-a',
			updatedAt: '2027-04-01T10:00:00.000Z',
			tombstone: false,
			legs: [
				{
					id: legId,
					mode: 'flight',
					operator: 'SAS',
					serviceNumber: 'SK1',
					from: {
						...endpoint('Oslo', 'OSL', '2027-06-01T09:00'),
						instant: '2027-06-01T07:00:00.000Z'
					},
					to: {
						...endpoint('Bergen', 'BGO', '2027-06-01T10:00'),
						instant: '2027-06-01T08:00:00.000Z'
					},
					status: 'planned',
					notes: ''
				}
			]
		} satisfies KeyedItineraryItem & Journey;
		const result = buildItineraryWrites(
			draft({
				entryType: 'flight',
				itemId: '33333333-3333-4333-8333-333333333333',
				journeyGroupId: itemId,
				journeyDirection: 'return',
				returnSource: source,
				legs: [
					{
						id: '44444444-4444-4444-8444-444444444444',
						mode: 'flight',
						operator: 'SAS',
						serviceNumber: 'SK2',
						from: endpoint('Bergen', 'BGO', '2027-06-10T09:00'),
						to: endpoint('Oslo', 'OSL', '2027-06-10T10:00'),
						status: 'planned',
						notes: ''
					}
				]
			}),
			identity
		);
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.writes).toHaveLength(2);
		expect(result.writes[0]?.value).toMatchObject({ direction: 'outbound' });
		expect(result.writes[1]?.value).toMatchObject({ direction: 'return' });
	});
});
