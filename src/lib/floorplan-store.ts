/**
 * The floor-plan image, kept ONLY on this device (IndexedDB) as a tracing backdrop for Studio.
 * It is never stored on our servers — uploads are processed and discarded.
 */
const DB = 'rea-floorplans';
const STORE = 'plans';

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(STORE);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export interface FloorPlanImage {
	/** The plan photo, turned by whole quarter turns only so its walls stay straight (older projects: fully north-up). */
	dataUrl: string;
	w: number;
	h: number;
	original?: string; // as uploaded, so it can be re-rotated without losing quality
	angle?: number; // the full north turn (degrees clockwise) chosen for `original`
	/** Set when `dataUrl` is straight: degrees clockwise still needed for north-up (= the plan's bearing). */
	bearing?: number;
}

export async function saveFloorPlan(projectId: string, img: FloorPlanImage): Promise<void> {
	try {
		const db = await open();
		await new Promise<void>((res, rej) => {
			const tx = db.transaction(STORE, 'readwrite');
			tx.objectStore(STORE).put(img, projectId);
			tx.oncomplete = () => res();
			tx.onerror = () => rej(tx.error);
		});
	} catch {
		/* private mode etc. — Studio still works without a backdrop */
	}
}

export async function loadFloorPlan(projectId: string): Promise<FloorPlanImage | null> {
	try {
		const db = await open();
		return await new Promise((res) => {
			const req = db.transaction(STORE).objectStore(STORE).get(projectId);
			req.onsuccess = () => res((req.result as FloorPlanImage) ?? null);
			req.onerror = () => res(null);
		});
	} catch {
		return null;
	}
}

export async function deleteFloorPlan(projectId: string): Promise<void> {
	try {
		const db = await open();
		db.transaction(STORE, 'readwrite').objectStore(STORE).delete(projectId);
	} catch {
		/* ignore */
	}
}
