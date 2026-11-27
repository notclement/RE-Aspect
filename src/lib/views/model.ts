import * as T from './three.ts';
import type { Unit, Lighting } from './types.ts';
import { rad } from './types.ts';
import { bounds, pieces } from './layout.ts';
import { fittings } from './fittings.ts';
import { flooring, imageLayer } from './floor.ts';
import type { Palette } from './surface.ts';
type Vertex = [number, number, number];
type Paint = { key: string; shade: number; item: number; start: number; end: number };
function batch(scene: T.Scene, transparent = false, itemCount = 0) {
	const positions: number[] = [],
		indices: number[] = [],
		paint: Paint[] = [];
	function face(v: Vertex[], key: string, shade: number, item: number) {
		const start = positions.length / 3;
		for (const vertex of v) positions.push(...vertex);
		for (let i = 2; i < v.length; i++) indices.push(start, start + i - 1, start + i);
		paint.push({ key, shade, item, start, end: positions.length / 3 });
	}
	function prism(
		x: number,
		y: number,
		z: number,
		w: number,
		d: number,
		h: number,
		angle: number,
		key: string,
		top: string,
		item = -1,
		tone = 1,
		sides = 4,
	) {
		const base: Vertex[] = [],
			lid: Vertex[] = [],
			c = Math.cos(angle),
			s = Math.sin(angle);
		for (let j = 0; j < sides; j++) {
			const dx =
				sides === 4 ? ([-1, 1, 1, -1][j] * w) / 2 : (Math.cos((j * 2 * Math.PI) / sides) * w) / 2;
			const dy =
				sides === 4 ? ([-1, -1, 1, 1][j] * d) / 2 : (Math.sin((j * 2 * Math.PI) / sides) * d) / 2;
			const vx = x + dx * c - dy * s,
				vy = y + dx * s + dy * c;
			base.push([vx, z, vy]);
			lid.push([vx, z + h, vy]);
		}
		for (let j = 0; j < sides; j++) {
			const k = (j + 1) % sides;
			face(
				[base[j], base[k], lid[k], lid[j]],
				key,
				tone * (0.72 + 0.12 * Math.cos(angle + (j * Math.PI * 2) / sides)),
				item,
			);
		}
		face(lid, top, tone, item);
		face(base, key, tone * 0.65, item);
	}
	function finish() {
		const geo = new T.BufferGeometry(),
			colors = new T.Float32BufferAttribute(new Float32Array(positions.length), 3);
		geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
		geo.setAttribute('color', colors);
		geo.setIndex(indices);
		const mat = new T.MeshBasicMaterial({
			vertexColors: true,
			side: T.DoubleSide,
			transparent,
			opacity: transparent ? 0.32 : 1,
			depthWrite: !transparent,
		});
		// Each item samples one texel. Scrubbing changes the lookup, never a vertex buffer.
		const width = Math.min(1024, itemCount + 1),
			height = Math.ceil((itemCount + 1) / width);
		const bytes = new Uint8Array(width * height * 4).fill(255);
		const lut = itemCount ? new T.DataTexture(bytes, width, height) : undefined;
		if (lut) {
			const uv = new T.Float32BufferAttribute(new Float32Array(colors.count * 2), 2);
			for (const f of paint) {
				const ix = f.item + 1,
					x = ((ix % width) + 0.5) / width,
					y = (Math.floor(ix / width) + 0.5) / height;
				for (let i = f.start; i < f.end; i++) uv.setXY(i, x, y);
			}
			geo.setAttribute('uv', uv);
			mat.map = lut;
			lut.needsUpdate = true;
		}
		const mesh = new T.Mesh(geo, mat);
		if (indices.length) scene.add(mesh);
		const tint = new T.Color(),
			night = new T.Color('#708398'),
			cache = new Map<string, T.Color>();
		let lastDark = -1;
		return {
			mesh,
			update(p: Palette, l: Lighting, changed: boolean) {
				if (lut) {
					let upload = false;
					for (let i = 0; i < itemCount; i++) {
						const offset = (i + 1) * 4,
							lit = l.sun.altitude > 0 && l.furniture.lit.has(i),
							blue = lit ? 203 : 255;
						if (bytes[offset + 2] === blue) continue;
						bytes[offset + 1] = lit ? 243 : 255;
						bytes[offset + 2] = blue;
						upload = true;
					}
					if (upload) lut.needsUpdate = true;
				}
				if (changed) {
					cache.clear();
					for (const f of paint) {
						const value = p[f.key as keyof Palette] ?? f.key;
						let col = cache.get(value);
						if (!col) {
							col = new T.Color(value);
							cache.set(value, col);
						}
						tint.copy(col).multiplyScalar(f.shade);
						for (let i = f.start; i < f.end; i++) {
							const ambient = 0.82 + 0.18 * Math.min(1, positions[i * 3 + 1] / 75);
							colors.setXYZ(i, tint.r * ambient, tint.g * ambient, tint.b * ambient);
						}
					}
					colors.needsUpdate = true;
				}
				if (lastDark !== l.dark) {
					mat.color.setRGB(1, 1, 1).lerp(night, l.dark * 0.86);
					lastDark = l.dark;
				}
			},
			dispose() {
				scene.remove(mesh);
				geo.dispose();
				mat.dispose();
				lut?.dispose();
			},
		};
	}
	return { face, prism, finish };
}
export function apartment(scene: T.Scene, u: Unit, walk: boolean) {
	const b = bounds(u),
		floor = flooring(u, b),
		image = imageLayer(floor.base.width, floor.base.height);
	const texture = new T.CanvasTexture(image.canvas);
	texture.colorSpace = T.SRGBColorSpace;
	texture.generateMipmaps = false;
	texture.minFilter = T.LinearFilter;
	const floorGeo = new T.BufferGeometry();
	floorGeo.setAttribute(
		'position',
		new T.Float32BufferAttribute(
			[b.x, 0, b.y, b.x + b.w, 0, b.y, b.x + b.w, 0, b.y + b.h, b.x, 0, b.y + b.h],
			3,
		),
	);
	floorGeo.setAttribute('uv', new T.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
	floorGeo.setIndex([0, 2, 1, 0, 3, 2]);
	const floorMat = new T.MeshBasicMaterial({ map: texture, alphaTest: 0.3 });
	const plane = new T.Mesh(floorGeo, floorMat);
	scene.add(plane);
	const solid = batch(scene, false, u.items.length),
		glass = batch(scene, true),
		parts = pieces(u, walk ? u.ceiling : Math.min(230, u.ceiling));
	for (const p of parts) {
		const dx = p.b[0] - p.a[0],
			dy = p.b[1] - p.a[1],
			key = p.glass ? 'glass' : 'wall';
		(p.glass ? glass : solid).prism(
			(p.a[0] + p.b[0]) / 2,
			(p.a[1] + p.b[1]) / 2,
			p.bottom,
			Math.hypot(dx, dy),
			p.t,
			p.top - p.bottom,
			Math.atan2(dy, dx),
			key,
			p.glass ? key : 'wall-top',
		);
	}
	// A narrow frame gives glazing a readable edge at eye level.
	for (const p of parts)
		if (p.glass) {
			const dx = p.b[0] - p.a[0],
				dy = p.b[1] - p.a[1],
				length = Math.hypot(dx, dy),
				a = Math.atan2(dy, dx);
			solid.prism(
				(p.a[0] + p.b[0]) / 2,
				(p.a[1] + p.b[1]) / 2,
				p.bottom,
				length,
				4,
				3,
				a,
				'wall-top',
				'glass',
			);
			const panes = Math.max(1, Math.ceil(length / 145));
			for (let i = 0; i <= panes; i++) {
				const t = i / panes;
				solid.prism(
					p.a[0] + dx * t,
					p.a[1] + dy * t,
					p.bottom,
					2.8,
					4,
					p.top - p.bottom,
					a,
					'wall-top',
					'glass',
				);
			}
		}
	if (walk) {
		const poly = u.outline.map((v) => new T.Vector2(v[0], v[1]));
		for (const tri of T.ShapeUtils.triangulateShape(poly, []))
			solid.face(
				tri.map((i) => [poly[i].x, u.ceiling, poly[i].y]),
				'surface',
				0.95,
				-1,
			);
	}
	u.items.forEach((it, index) => {
		const a = (it.rot ?? 0) * rad,
			c = Math.cos(a),
			s = Math.sin(a);
		for (const part of fittings(it)) {
			const x = (part.x + part.w / 2 - 0.5) * it.w,
				y = (part.y + part.d / 2 - 0.5) * it.d;
			solid.prism(
				it.x + it.w / 2 + x * c - y * s,
				it.y + it.d / 2 + x * s + y * c,
				Math.max(0.12, part.z * it.h),
				part.w * it.w,
				part.d * it.d,
				part.h * it.h,
				a,
				it.color,
				it.color,
				index,
				part.tone,
				part.round ? 8 : 4,
			);
		}
	});
	const opaque = solid.finish(),
		panes = glass.finish();
	// Each fixed curtain follows the incoming light in its vertex shader. The fade tapers
	// over the first few centimetres of travel; there is no volumetric pass.
	const vertices: number[] = [],
		coords: number[] = [],
		normals: number[] = [],
		indices: number[] = [];
	for (const win of u.windows) {
		const height = Math.min(win.head, walk ? u.ceiling : 230) - win.sill;
		if (height <= 0) continue;
		const start = vertices.length / 3;
		for (const [along, travel] of [
			[0.04, 0],
			[0.96, 0],
			[0.96, 1],
			[0.04, 1],
		]) {
			vertices.push(
				win.a[0] + (win.b[0] - win.a[0]) * along,
				win.sill + height * 0.68,
				win.a[1] + (win.b[1] - win.a[1]) * along,
			);
			coords.push(along, travel);
			normals.push(...win.normal);
		}
		indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
	}
	const beamGeo = new T.BufferGeometry();
	beamGeo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
	beamGeo.setAttribute('uv', new T.Float32BufferAttribute(coords, 2));
	beamGeo.setAttribute('outward', new T.Float32BufferAttribute(normals, 2));
	beamGeo.setIndex(indices);
	const beamMat = new T.ShaderMaterial({
		transparent: true,
		depthWrite: false,
		side: T.DoubleSide,
		uniforms: {
			dir: { value: new T.Vector2() },
			slope: { value: 1 },
			warm: { value: new T.Color() },
			strength: { value: 0 },
		},
		vertexShader: `attribute vec2 outward; uniform vec2 dir; uniform float slope; varying vec2 v; varying float facing;
    void main(){v=uv;facing=max(0.,dot(outward,dir));float reach=min(42.,position.y/max(.01,slope)) * uv.y;
    vec3 p=position;p.xz-=dir*reach;p.y-=slope*reach;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
		fragmentShader: `uniform vec3 warm;uniform float strength;varying vec2 v;varying float facing;
    void main(){float edge=smoothstep(.04,.19,v.x)*(1.-smoothstep(.81,.96,v.x));
    gl_FragColor=vec4(warm,strength*facing*edge*(1.-v.y)*(1.-v.y));
    #include <colorspace_fragment>
    }`,
	});
	const beam = new T.Mesh(beamGeo, beamMat);
	beam.frustumCulled = false;
	scene.add(beam);
	const markerBatch = batch(scene);
	markerBatch.prism(0, 0, 0, 22, 22, 12, 0, 'ochre', 'ochre', -1, 1, 12);
	const markerPaint = markerBatch.finish(),
		marker = markerPaint.mesh;
	const night = new T.Color('#788ca4');
	return {
		b,
		parts,
		update(l: Lighting, p: Palette, themed: boolean, showSun: boolean) {
			if (themed) floor.theme(p);
			floor.update(l, p);
			image.ctx.clearRect(0, 0, image.canvas.width, image.canvas.height);
			image.ctx.drawImage(floor.base, 0, 0);
			image.ctx.drawImage(floor.light, 0, 0);
			texture.needsUpdate = true;
			floorMat.color.setRGB(1, 1, 1).lerp(night, l.dark * 0.86);
			opaque.update(p, l, themed);
			panes.update(p, l, themed);
			markerPaint.update(p, l, themed);
			const az = (l.sun.azimuth - u.bearing) * rad,
				alt = l.sun.altitude * rad,
				sx = Math.sin(az),
				sy = -Math.cos(az);
			beam.visible = l.patches.length > 0 && alt > 0 && l.dark < 1;
			beamMat.uniforms.dir.value.set(sx, sy);
			beamMat.uniforms.slope.value = Math.tan(alt);
			beamMat.uniforms.strength.value = 0.14 * (1 - l.dark) * Math.min(1, l.sun.altitude / 12);
			beamMat.uniforms.warm.value.set(l.sunColor || p.ochre);
			marker.visible = showSun && alt > 0;
			const r = 0.48 * Math.max(b.w, b.h);
			marker.position.set(
				b.cx + sx * r * Math.cos(alt),
				u.ceiling + r * 0.25 * Math.sin(alt),
				b.cy + sy * r * Math.cos(alt),
			);
		},
		dispose() {
			scene.remove(plane, beam);
			markerPaint.dispose();
			opaque.dispose();
			panes.dispose();
			floorGeo.dispose();
			floorMat.dispose();
			texture.dispose();
			beamGeo.dispose();
			beamMat.dispose();
		},
	};
}
