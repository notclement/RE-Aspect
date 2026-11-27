// After `vite build`: give the shared page (/s) the buyer link preview instead of the app's.
// Every route is a prerendered client-side shell, so the meta tags have to be fixed in the HTML files.
// Rule: the generic room illustration is for the app only, never for a link to a real unit.
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../build/s.html', import.meta.url);
const swaps = [
	[/(property="og:title" content=")[^"]*"/, '$1RE:Aspect — See the light before you move in"'],
	[/(property="og:description" content=")[^"]*"/, '$1Room-by-room sunlight for Singapore homes."'],
	[/(property="og:image" content="[^"]*\/og\/)reaspect-app\.jpg"/, '$1reaspect-share.jpg"'],
	[/(property="og:image:alt" content=")[^"]*"/, '$1RE:Aspect logo with the line: See the light before you move in."'],
	[/(name="description" content=")[^"]*"/, '$1See the light before you move in. Room-by-room sunlight for Singapore homes."']
];
let html = readFileSync(file, 'utf8');
for (const [re, to] of swaps) {
	if (!re.test(html)) throw new Error(`og-routes: pattern not found in s.html: ${re}`);
	html = html.replace(re, to);
}
writeFileSync(file, html);
console.log('og-routes: /s uses the buyer link preview');
