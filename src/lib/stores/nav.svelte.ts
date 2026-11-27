/** Breadcrumb for the top bar, set by each page. */
export interface Crumb {
	label: string;
	href?: string;
}
class Nav {
	crumbs = $state<Crumb[]>([]);
	set(...crumbs: Crumb[]) {
		this.crumbs = crumbs;
	}
}
export const nav = new Nav();
