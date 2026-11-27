/** Light / dark / system theme, remembered in this browser (localStorage). */
export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'rea.theme';

function read(): ThemeChoice {
	try {
		const v = localStorage.getItem(KEY);
		return v === 'light' || v === 'dark' ? v : 'system';
	} catch {
		return 'system';
	}
}

function apply(choice: ThemeChoice) {
	const dark =
		choice === 'dark' ||
		(choice === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
	document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

class Theme {
	choice = $state<ThemeChoice>('system');

	init() {
		this.choice = read();
		apply(this.choice);
		matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
			if (this.choice === 'system') apply('system');
		});
	}

	set(choice: ThemeChoice) {
		this.choice = choice;
		try {
			localStorage.setItem(KEY, choice);
		} catch {
			/* private mode — still applies for this visit */
		}
		apply(choice);
	}
}

export const theme = new Theme();
