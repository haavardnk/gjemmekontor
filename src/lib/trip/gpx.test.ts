import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, test } from 'vitest';

import { extractGpxXml } from './gpx';

type FixturePoint = [latitude: number, longitude: number, seconds: number];

function gpxFixture(points: FixturePoint[]): string {
	return `<?xml version="1.0"?><gpx creator="test" version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Testetappe</name><trkseg>${points
		.map(
			([latitude, longitude, seconds]) =>
				`<trkpt lat="${latitude}" lon="${longitude}"><time>${new Date(Date.UTC(2026, 8, 5, 8, 0, seconds)).toISOString()}</time></trkpt>`
		)
		.join('')}</trkseg></trk></gpx>`;
}

function parse(xml: string): ReturnType<DOMParser['parseFromString']> {
	return new DOMParser().parseFromString(xml, 'text/xml');
}

describe('GPX extraction', (): void => {
	test('removes stationary head, middle, and tail while retaining movement episodes', (): void => {
		const points: FixturePoint[] = [
			[43, 16, 0],
			[43, 16, 60],
			[43, 16, 120],
			[43, 16, 180],
			[43.001, 16, 200],
			[43.002, 16, 220],
			[43.002, 16, 280],
			[43.002, 16, 340],
			[43.002, 16, 400],
			[43.002, 16, 460],
			[43.001, 16, 480],
			[43, 16, 500],
			[43, 16, 560],
			[43, 16, 620],
			[43, 16, 680]
		];
		const result = extractGpxXml(gpxFixture(points), parse);

		expect(result.originalPointCount).toBe(points.length);
		expect(result.stationaryBlocks).toHaveLength(3);
		expect(result.stationarySeconds).toBe(600);
		expect(result.activeSeconds).toBe(80);
		expect(result.elapsedSeconds).toBe(320);
		expect(result.nauticalMiles).toBeGreaterThan(0.2);
		expect(result.segments).toHaveLength(1);
		expect(result.routePointCount).toBeLessThan(result.originalPointCount);
	});

	test('splits displaced recording gaps without measuring a connector', (): void => {
		const points: FixturePoint[] = [
			[43, 16, 0],
			[43.001, 16, 20],
			[43.002, 16, 40],
			[43.01, 16, 640],
			[43.011, 16, 660]
		];
		const result = extractGpxXml(gpxFixture(points), parse);

		expect(result.recordingGaps).toHaveLength(1);
		expect(result.segments).toHaveLength(2);
		expect(result.activeSeconds).toBe(60);
		expect(result.nauticalMiles).toBeLessThan(0.2);
	});

	test('rejects tracks without useful movement', (): void => {
		const points: FixturePoint[] = [
			[43, 16, 0],
			[43, 16, 60],
			[43, 16, 120],
			[43, 16, 180]
		];

		expect(() => extractGpxXml(gpxFixture(points), parse)).toThrow('GPX_MOVEMENT_REQUIRED');
	});

	test('handles dense stationary jitter without rescanning the track', (): void => {
		const points: FixturePoint[] = Array.from({ length: 2_000 }, (_value, index) => [
			43 + (index % 2) * 0.00001,
			16,
			index * 20
		]);

		expect(() => extractGpxXml(gpxFixture(points), parse)).toThrow('GPX_MOVEMENT_REQUIRED');
	});

	test('rejects GPX segments that move backward in time', (): void => {
		const xml = `<?xml version="1.0"?><gpx creator="test" version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg><trkpt lat="43" lon="16"><time>2026-09-05T09:00:00Z</time></trkpt><trkpt lat="43.1" lon="16"><time>2026-09-05T09:01:00Z</time></trkpt></trkseg><trkseg><trkpt lat="43.2" lon="16"><time>2026-09-05T08:00:00Z</time></trkpt><trkpt lat="43.3" lon="16"><time>2026-09-05T08:01:00Z</time></trkpt></trkseg></trk></gpx>`;

		expect(() => extractGpxXml(xml, parse)).toThrow('GPX_TIMESTAMPS_NOT_MONOTONIC');
	});

	test('simplifies long zigzag routes without recursive stack growth', (): void => {
		const points: FixturePoint[] = Array.from({ length: 5_000 }, (_value, index) => [
			43 + (index % 2) * 0.001,
			16 + index * 0.0001,
			index * 20
		]);

		const result = extractGpxXml(gpxFixture(points), parse);
		expect(result.originalPointCount).toBe(5_000);
		expect(result.routePointCount).toBeGreaterThan(2);
	});
});
