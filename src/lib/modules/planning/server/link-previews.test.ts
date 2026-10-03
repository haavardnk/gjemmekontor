import { describe, expect, it } from 'vitest';

import { parseLinkPreview } from './link-previews';

describe('parseLinkPreview', () => {
	it.each([
		[
			'Open Graph tags',
			`<html><head>
				<title>Fallback</title>
				<meta property="og:title" content="  Hytte   ved sjøen ">
				<meta property="og:description" content="Fire sengeplasser">
				<meta property="og:site_name" content="Finn">
				<meta property="og:image" content="/bilder/hytte.jpg">
			</head></html>`,
			{
				title: 'Hytte ved sjøen',
				description: 'Fire sengeplasser',
				siteName: 'Finn',
				imageUrl: 'https://www.finn.no/bilder/hytte.jpg'
			}
		],
		[
			'plain page metadata',
			`<html><head>
				<title>Kajakkutleie</title>
				<meta name="Description" content="${'Lang tekst '.repeat(60)}">
				<meta name="twitter:image" content="https://cdn.example.com/kajakk.png">
			</head></html>`,
			{
				title: 'Kajakkutleie',
				description: `${'Lang tekst '.repeat(60).slice(0, 499).trimEnd()}…`,
				siteName: null,
				imageUrl: 'https://cdn.example.com/kajakk.png'
			}
		]
	])('reads %s', (_name, html, expected) => {
		expect(parseLinkPreview(html, 'https://www.finn.no/annonse/1')).toEqual(expected);
	});
});
