import { LinkifyIt } from 'linkify-it';

export type LinkTextPart =
	{ kind: 'text'; text: string } | { kind: 'link'; text: string; href: string };

const linkify = new LinkifyIt({ fuzzyEmail: false, fuzzyLink: true });
linkify.add('ftp:', null);
linkify.add('mailto:', null);
linkify.tlds('no', true);

export function linkTextParts(value: string): LinkTextPart[] {
	const matches = linkify.match(value) ?? [];
	const parts: LinkTextPart[] = [];
	let position = 0;
	for (const match of matches) {
		if (match.index > position) {
			parts.push({ kind: 'text', text: value.slice(position, match.index) });
		}
		parts.push({ kind: 'link', text: match.raw, href: match.url });
		position = match.lastIndex;
	}
	if (position < value.length) parts.push({ kind: 'text', text: value.slice(position) });
	return parts.length ? parts : [{ kind: 'text', text: value }];
}

export function websiteLabel(value: string): string {
	return new URL(value).hostname.replace(/^www\./, '');
}
