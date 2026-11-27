/**
 * App theme, remembered in this browser (localStorage) and synced to the account (profiles.settings).
 * "system" follows the device: Basic light or Basic dark.
 */
import { isThemeId, themeDef, type ThemeId } from '#lib/config/themes.ts';

export type ThemeChoice = 'system' | ThemeId;
const KEY = 'rea.theme';

export const isThemeChoice = (v: unknown): v is ThemeChoice => v === 'system' || isThemeId(v);

function read(): ThemeChoice {
	try {
		const v = localStorage.getItem(KEY);
		return isThemeChoice(v) ? v : 'system';
	} catch {
		return 'system';
	}
}

function resolve(choice: ThemeChoice): ThemeId {
	if (choice !== 'system') return choice;
	return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function apply(choice: ThemeChoice) {
	const id = resolve(choice);
	const el = document.documentElement;
	el.dataset.theme = id;
	el.dataset.mode = themeDef(id).mode;
	// Browser chrome (status bar / tab colour) follows the theme background.
	const bg = getComputedStyle(el).getPropertyValue('--paper').trim();
	if (bg) {
		let m = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
		if (!m) {
			m = document.createElement('meta');
			m.name = 'theme-color';
			document.head.append(m);
		}
		m.content = bg;
	}
}

class Theme {
	choice = $state<ThemeChoice>('system');
	/** Called after the user changes the theme (used to sync it to their account). */
	onChange: (() => void) | null = null;

	init() {
		this.choice = read();
		apply(this.choice);
		matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
			if (this.choice === 'system') apply('system');
		});
	}

	/** Apply a theme. `fromCloud` = loaded from the account, so don't echo it back. */
	set(choice: ThemeChoice, fromCloud = false) {
		if (!isThemeChoice(choice)) return;
		this.choice = choice;
		try {
			localStorage.setItem(KEY, choice);
		} catch {
			/* private mode — still applies for this visit */
		}
		apply(choice);
		if (!fromCloud) this.onChange?.();
	}
}

export const theme = new Theme();
