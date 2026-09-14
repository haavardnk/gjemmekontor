import { describe, expect, it } from 'vitest';

import { linkTextParts, websiteLabel } from './links';

describe('next trip links', () => {
	it('separates web links from surrounding text and punctuation', () => {
		expect(linkTextParts('Se https://example.com/tur, eller example.no.')).toEqual([
			{ kind: 'text', text: 'Se ' },
			{ kind: 'link', text: 'https://example.com/tur', href: 'https://example.com/tur' },
			{ kind: 'text', text: ', eller ' },
			{ kind: 'link', text: 'example.no', href: 'http://example.no' },
			{ kind: 'text', text: '.' }
		]);
	});

	it('leaves non-web protocols and markup as text', () => {
		expect(linkTextParts('<script>alert(1)</script> mailto:test@example.com')).toEqual([
			{ kind: 'text', text: '<script>alert(1)</script> mailto:test@example.com' }
		]);
	});

	it('uses the hostname as a concise website label', () => {
		expect(websiteLabel('https://www.example.com/trips/lofoten')).toBe('example.com');
	});
});
