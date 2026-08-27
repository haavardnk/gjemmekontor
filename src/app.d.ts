declare global {
	namespace App {
		interface Locals {
			adminAuthenticated: boolean;
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
