import type Database from 'better-sqlite3';

declare global {
	namespace App {
		interface Locals {
			adminAuthenticated: boolean;
			db: Database.Database;
			tripAuthenticated: boolean;
			trip?: {
				id: string;
				slug: string;
				name: string;
				enabledModuleIds: string[];
			};
		}
	}
}

export {};
