import { createHash, randomUUID } from 'node:crypto';
import {
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync
} from 'node:fs';
import { join, relative, resolve } from 'node:path';

type FileDigest = { path: string; bytes: number; sha256: string };

function fileManifest(directory: string): FileDigest[] {
	const files: FileDigest[] = [];
	const visit = (current: string): void => {
		for (const name of readdirSync(current).sort()) {
			const path = join(current, name);
			const stat = lstatSync(path);
			if (stat.isSymbolicLink()) throw new Error('MAP_FILE_IMPORT_SYMLINK');
			if (stat.isDirectory()) {
				visit(path);
				continue;
			}
			if (!stat.isFile()) throw new Error('MAP_FILE_IMPORT_UNSUPPORTED_ENTRY');
			const content = readFileSync(path);
			files.push({
				path: relative(directory, path),
				bytes: content.byteLength,
				sha256: createHash('sha256').update(content).digest('hex')
			});
		}
	};
	visit(directory);
	return files;
}

function sameFiles(left: string, right: string): boolean {
	return JSON.stringify(fileManifest(left)) === JSON.stringify(fileManifest(right));
}

export function migrateLegacyMapFiles(dataDir: string, tripId: string): void {
	const root = resolve(dataDir);
	const source = resolve(root, 'map');
	const tripRoot = resolve(root, 'trips', tripId);
	const target = resolve(tripRoot, 'map');
	if (!existsSync(source)) return;
	if (!source.startsWith(`${root}/`) || !target.startsWith(`${root}/`) || source === target) {
		throw new Error('MAP_FILE_IMPORT_PATH');
	}
	if (existsSync(target)) {
		if (!sameFiles(source, target)) throw new Error('MAP_FILE_IMPORT_CONFLICT');
		rmSync(source, { recursive: true });
		return;
	}

	mkdirSync(tripRoot, { recursive: true });
	const staging = resolve(tripRoot, `.map-import-${randomUUID()}`);
	if (!staging.startsWith(`${tripRoot}/`)) throw new Error('MAP_FILE_IMPORT_PATH');
	try {
		cpSync(source, staging, { recursive: true, errorOnExist: true });
		if (!sameFiles(source, staging)) throw new Error('MAP_FILE_IMPORT_CHECKSUM');
		renameSync(staging, target);
		if (!sameFiles(source, target)) throw new Error('MAP_FILE_IMPORT_CHECKSUM');
		rmSync(source, { recursive: true });
	} catch (error) {
		if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
		throw error;
	}
}
