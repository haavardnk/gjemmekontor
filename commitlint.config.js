export default {
	extends: ['@commitlint/config-conventional'],
	rules: {
		'body-empty': [2, 'always'],
		'footer-empty': [2, 'always'],
		'header-full-stop': [2, 'never', '.'],
		'header-max-length': [2, 'always', 50],
		'type-enum': [
			2,
			'always',
			['feat', 'fix', 'refactor', 'test', 'docs', 'chore', 'ci', 'build', 'perf']
		]
	}
};
