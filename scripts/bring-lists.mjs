import Bring from 'bring-shopping';

const email = process.env.BRING_EMAIL;
const password = process.env.BRING_PASSWORD;

if (!email || !password) {
	console.error('Set BRING_EMAIL and BRING_PASSWORD before running this command.');
	process.exit(1);
}

const bring = new Bring({ mail: email, password });

try {
	await bring.login();
	const response = await bring.loadLists();
	for (const list of response.lists) {
		console.log(`${list.name}\t${list.listUuid}`);
	}
} catch {
	console.error('Could not load Bring lists. Check the credentials and try again.');
	process.exit(1);
}
