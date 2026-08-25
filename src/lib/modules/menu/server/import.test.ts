import { describe, expect, test } from 'vitest';

import { parseRecipeHtml } from './import';

function htmlFor(value: unknown): string {
	return `<html><head><script type="application/ld+json">${JSON.stringify(value)}</script></head></html>`;
}

describe('Recipe import parsing', (): void => {
	test('uses the generic Schema.org parser for graph recipes and preserves instructions', async (): Promise<void> => {
		const result = await parseRecipeHtml(
			htmlFor({
				'@context': 'https://schema.org',
				'@graph': [
					{ '@type': 'WebSite', name: 'Eksempel' },
					{
						'@type': ['Recipe', 'Thing'],
						name: 'Tomatsuppe',
						image: 'https://images.example/suppe.jpg',
						recipeYield: '4 porsjoner',
						recipeIngredient: ['1,5 dl melk', '2 stk tomat'],
						recipeInstructions: [
							{
								'@type': 'HowToSection',
								name: 'Suppen',
								itemListElement: [
									{ '@type': 'HowToStep', text: 'Kok opp.' },
									{ '@type': 'HowToStep', text: 'Server varm.' }
								]
							}
						]
					}
				]
			}),
			'https://recipes.example/suppe'
		);

		expect(result).toMatchObject({
			name: 'Tomatsuppe',
			imageUrl: 'https://images.example/suppe.jpg',
			baseServings: 4,
			sourceUrl: 'https://recipes.example/suppe'
		});
		expect(result.ingredients?.map((ingredient) => ingredient.name)).toEqual(['melk', 'tomat']);
		expect(result.ingredients?.[0]?.normalizedQuantity).toEqual({ numerator: 3, denominator: 2 });
		expect(result.instructions?.map((instruction) => instruction.text)).toEqual([
			'Kok opp.',
			'Server varm.'
		]);
		expect(result.instructions?.every((instruction) => instruction.section === 'Suppen')).toBe(
			true
		);
	});

	test('returns an editable manual draft when Recipe data is absent', async (): Promise<void> => {
		const result = await parseRecipeHtml(
			'<html><title>Vanlig side</title></html>',
			'https://example.com/page'
		);

		expect(result).toMatchObject({
			sourceUrl: 'https://example.com/page',
			baseServings: 4,
			ingredients: [],
			instructions: []
		});
	});

	test('parses Tine-shaped Recipe metadata without turning step labels into instructions', async (): Promise<void> => {
		const result = await parseRecipeHtml(
			htmlFor({
				'@context': 'https://schema.org',
				'@type': 'Recipe',
				name: 'Amerikanske pannekaker',
				recipeYield: '4 servings',
				recipeIngredient: ['50 g smør', '2.5 dl melk'],
				recipeInstructions: [
					{ '@type': 'HowToStep', name: 'Step 1', text: 'Smelt smøret.' },
					{ '@type': 'HowToStep', name: 'Step 2', text: 'Bland inn melken.' }
				]
			}),
			'https://recipes.example/pancakes'
		);

		expect(result).toMatchObject({ name: 'Amerikanske pannekaker', baseServings: 4 });
		expect(result.ingredients).toHaveLength(2);
		expect(result.instructions?.map((instruction) => instruction.text)).toEqual([
			'Smelt smøret.',
			'Bland inn melken.'
		]);
	});

	test('restores groups and sections from generic embedded Next recipe data', async (): Promise<void> => {
		const metadata = {
			'@context': 'https://schema.org',
			'@type': 'Recipe',
			name: 'Amerikanske pannekaker',
			recipeYield: '4 servings',
			recipeIngredient: ['50 g smør', '2 ss sirup'],
			recipeInstructions: ['Smelt smøret.', 'Server med sirup.']
		};
		const embeddedRecipe = {
			ingredientGroups: [
				{
					name: 'Pannekaker',
					ingredientLines: [
						{
							amount: 50,
							unit: { singular: 'g' },
							ingredient: { singular: 'smør' }
						}
					]
				},
				{
					name: 'Tilbehør',
					ingredientLines: [
						{
							amount: 2,
							unit: { singular: 'ss' },
							ingredient: { singular: 'sirup' }
						}
					]
				}
			],
			stepGroups: [
				{ name: 'Røre', steps: [{ instruction: 'Smelt smøret.' }] },
				{ name: 'Tilbehør', steps: [{ instruction: 'Server med sirup.' }] }
			]
		};
		const payload = `8:${JSON.stringify(['$', 'component', null, { recipe: embeddedRecipe }])}`;
		const nextMessage = JSON.stringify([1, payload]);
		const html = `<html><head><script type="application/ld+json">${JSON.stringify(metadata)}</script><script>self.__next_f.push(${nextMessage})</script></head></html>`;

		const result = await parseRecipeHtml(html, 'https://recipes.example/pancakes');

		expect(result.ingredients?.map((ingredient) => ingredient.group)).toEqual([
			'Pannekaker',
			'Tilbehør'
		]);
		expect(result.instructions?.map((instruction) => instruction.section)).toEqual([
			'Røre',
			'Tilbehør'
		]);
	});

	test('restores Matprat-shaped groups from Next data', async (): Promise<void> => {
		const metadata = {
			'@context': 'https://schema.org',
			'@type': 'Recipe',
			name: 'Pastasalat',
			recipeYield: '4 porsjoner',
			recipeIngredient: ['400 g kylling', '2 ss pesto'],
			recipeInstructions: ['Stek kyllingen.', 'Rør sammen dressingen.']
		};
		const nextData = {
			props: {
				pageProps: {
					recipe: {
						ingredientGroups: [
							{
								groupName: 'Salat',
								ingredients: [{ amount: 400, unit: 'g', name: 'kylling' }]
							},
							{
								groupName: 'Dressing',
								ingredients: [{ amount: 2, unit: 'ss', name: 'pesto' }]
							}
						],
						stepGroups: [
							{
								groupName: 'Salat',
								steps: [{ content: [{ type: 'html', html: '<p>Stek kyllingen.</p>' }] }]
							},
							{
								groupName: 'Dressing',
								steps: [{ content: [{ type: 'html', html: '<p>Rør sammen dressingen.</p>' }] }]
							}
						]
					}
				}
			}
		};
		const html = `<html><head><script type="application/ld+json">${JSON.stringify(metadata)}</script><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></head></html>`;

		const result = await parseRecipeHtml(html, 'https://recipes.example/pasta');

		expect(result.ingredients?.map(({ group, name }) => ({ group, name }))).toEqual([
			{ group: 'Salat', name: 'kylling' },
			{ group: 'Dressing', name: 'pesto' }
		]);
		expect(result.instructions?.map(({ section, text }) => ({ section, text }))).toEqual([
			{ section: 'Salat', text: 'Stek kyllingen.' },
			{ section: 'Dressing', text: 'Rør sammen dressingen.' }
		]);
	});

	test('recovers visible DOM ingredient groups when metadata is flat', async (): Promise<void> => {
		const metadata = {
			'@context': 'https://schema.org',
			'@type': 'Recipe',
			name: 'Burritos',
			recipeIngredient: ['400 g kjøttdeig', '4 stk tortilla', '2 dl salsa'],
			recipeInstructions: ['Stek kjøttdeigen.']
		};
		const html = `<html><head><script type="application/ld+json">${JSON.stringify(metadata)}</script></head><body><h3>Ingredienser</h3><h4>Fyll</h4><ul><li>400 g kjøttdeig</li></ul><h4>Tilbehør</h4><ul><li>4 stk tortilla</li><li>2 dl salsa</li></ul><h3>Slik gjør du</h3><p>Stek kjøttdeigen og server med tortilla.</p></body></html>`;

		const result = await parseRecipeHtml(html, 'https://recipes.example/burritos');

		expect(result.ingredients?.map((ingredient) => ingredient.group)).toEqual([
			'Fyll',
			'Tilbehør',
			'Tilbehør'
		]);
	});

	test('uses the public page title for a manual draft when recipe data is unavailable', async (): Promise<void> => {
		const result = await parseRecipeHtml(
			'<html><head><meta property="og:title" content="Stekt ris med kylling"></head><body><p>Logg inn for å lese oppskriften.</p></body></html>',
			'https://recipes.example/protected'
		);

		expect(result).toMatchObject({
			name: 'Stekt ris med kylling',
			ingredients: [],
			instructions: []
		});
	});
});
