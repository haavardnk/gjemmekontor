import { XMLParser, XMLValidator } from 'fast-xml-parser';
import sanitizeHtml from 'sanitize-html';

import type { MapFeatureStyle } from '$lib/modules/map/domain/types';

export type XmlNode = Record<string, unknown>;

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: '@_',
	parseTagValue: false,
	trimValues: false
});

export function node(value: unknown): XmlNode | undefined {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as XmlNode)
		: undefined;
}

export function values(value: unknown): unknown[] {
	if (value === undefined || value === null) return [];
	return Array.isArray(value) ? value : [value];
}

export function text(value: unknown): string {
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return String(value).trim();
	}
	const valueNode = node(value);
	return valueNode ? text(valueNode['#text']) : '';
}

export function safeHtml(value: unknown): string {
	return sanitizeHtml(text(value), {
		allowedTags: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a'],
		allowedAttributes: { a: ['href'] },
		allowedSchemes: ['https'],
		allowProtocolRelative: false,
		disallowedTagsMode: 'discard'
	}).trim();
}

export function plainText(value: unknown): string {
	return sanitizeHtml(text(value), { allowedTags: [], allowedAttributes: {} }).trim();
}

function kmlColor(value: unknown): { color?: string; opacity?: number } {
	const raw = text(value).replace(/^#/, '');
	if (!/^[0-9a-f]{8}$/i.test(raw)) return {};
	const alpha = Number.parseInt(raw.slice(0, 2), 16) / 255;
	const blue = raw.slice(2, 4);
	const green = raw.slice(4, 6);
	const red = raw.slice(6, 8);
	return { color: `#${red}${green}${blue}`.toLowerCase(), opacity: alpha };
}

export function parseStyle(value: unknown, id = ''): MapFeatureStyle {
	const style = node(value);
	if (!style) return {};
	const iconStyle = node(style.IconStyle);
	const lineStyle = node(style.LineStyle);
	const polygonStyle = node(style.PolyStyle);
	const iconColor = kmlColor(iconStyle?.color);
	const lineColor = kmlColor(lineStyle?.color);
	const fillColor = kmlColor(polygonStyle?.color);
	const width = Number(text(lineStyle?.width));
	return {
		color: lineColor.color ?? iconColor.color,
		opacity: lineColor.opacity ?? iconColor.opacity,
		fillColor: fillColor.color,
		fillOpacity: fillColor.opacity,
		width: Number.isFinite(width) && width > 0 ? width : undefined,
		iconHref: text(node(iconStyle?.Icon)?.href) || undefined,
		iconCode: id.match(/^icon-(\d+)-/)?.[1]
	};
}

export function extendedData(value: unknown): Record<string, string> {
	const dataNode = node(value);
	if (!dataNode) return {};
	const entries = values(dataNode.Data).flatMap((item): [string, string][] => {
		const itemNode = node(item);
		const name = text(itemNode?.['@_name']);
		const content = safeHtml(itemNode?.value);
		return name ? [[name, content]] : [];
	});
	return Object.fromEntries(entries);
}

export function parseKmlDocument(kml: string): XmlNode {
	if (XMLValidator.validate(kml) !== true) throw new Error('INVALID_KML');
	const root = node(parser.parse(kml));
	const documentNode = node(node(root?.kml)?.Document);
	if (!documentNode) throw new Error('INVALID_KML');
	return documentNode;
}
