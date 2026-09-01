import { analyzeGpx } from './gpx-analysis';
import { normalizeGpxDocument } from './gpx-normalize';
import { type GpxDocument, type GpxExtraction, gpxMaximumBytes } from './gpx-types';

export { distanceMeters } from './gpx-analysis';
export {
	type GpxExtraction,
	gpxExtractionVersion,
	gpxMaximumBytes,
	gpxMaximumPoints,
	type GpxRecordingGap,
	type GpxStationaryBlock
} from './gpx-types';

export function extractGpxDocument(document: GpxDocument): GpxExtraction {
	return analyzeGpx(normalizeGpxDocument(document));
}

export function extractGpxXml(xml: string, parse: (value: string) => GpxDocument): GpxExtraction {
	if (new TextEncoder().encode(xml).byteLength > gpxMaximumBytes) {
		throw new Error('GPX_TOO_LARGE');
	}
	return extractGpxDocument(parse(xml));
}
