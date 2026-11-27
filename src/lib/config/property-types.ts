/** Property types for a project (Project details → Type). Keys mirror the DB check in migration 0003. */
export const PROPERTY_TYPES = [
	{ id: 'hdb', label: 'HDB flat' },
	{ id: 'ec', label: 'Executive condominium (EC)' },
	{ id: 'condo', label: 'Condominium / apartment' },
	{ id: 'terrace', label: 'Landed — terrace' },
	{ id: 'semi-d', label: 'Landed — semi-detached' },
	{ id: 'bungalow', label: 'Landed — bungalow / detached' },
	{ id: 'cluster', label: 'Cluster house' },
	{ id: 'shophouse', label: 'Shophouse' },
	{ id: 'commercial', label: 'Commercial / office' },
	{ id: 'other', label: 'Other' }
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number]['id'];
export const isPropertyType = (v: unknown): v is PropertyType => PROPERTY_TYPES.some((t) => t.id === v);
export const propertyTypeLabel = (v: string) => PROPERTY_TYPES.find((t) => t.id === v)?.label ?? 'Other';
