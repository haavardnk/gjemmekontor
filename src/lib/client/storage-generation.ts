const preTripDatabaseNames = ['gjemmekontor-data'] as const;
const preTripLocalStorageKeys = ['mapMode', 'mapAisEnabled'] as const;
const preTripSessionStorageKeys = ['mapCamera'] as const;

function deleteDatabase(name: string): Promise<void> {
	return new Promise((resolve) => {
		const request = indexedDB.deleteDatabase(name);
		request.onsuccess = (): void => resolve();
		request.onerror = (): void => resolve();
		request.onblocked = (): void => resolve();
	});
}

export async function discardPreTripClientStorage(): Promise<void> {
	for (const key of preTripLocalStorageKeys) localStorage.removeItem(key);
	for (const key of preTripSessionStorageKeys) sessionStorage.removeItem(key);
	await Promise.all(preTripDatabaseNames.map(deleteDatabase));
}
