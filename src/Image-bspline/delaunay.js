const r = 1 / 1_048_576;

function n(n, e, t, u) {
	let i;
	let l;
	let o;
	let a;
	let f;
	let h;
	let s;
	let I;
	let c;
	let N;
	const p = n[e][0];
	const g = n[e][1];
	const v = n[t][0];
	const E = n[t][1];
	const T = n[u][0];
	const b = n[u][1];
	const k = Math.abs(g - E);
	const m = Math.abs(E - b);
	if (k < r && m < r) {
		throw new Error('Eek! Coincident points!');
	}

	return k < r ? l = (a = -(T - v) / (b - E)) * ((i = (v + p) / 2) - (h = (v + T) / 2)) + (I = (E + b) / 2) : (m < r ? l = (o = -(v - p) / (E - g)) * ((i = (T + v) / 2) - (f = (p + v) / 2)) + (s = (g + E) / 2) : (i = ((o = -(v - p) / (E - g)) * (f = (p + v) / 2) - (a = -(T - v) / (b - E)) * (h = (v + T) / 2) + (I = (E + b) / 2) - (s = (g + E) / 2)) / (o - a), l = k > m ? o * (i - f) + s : a * (i - h) + I)), {
		i: e,
		j: t,
		k: u,
		x: i,
		y: l,
		r: (c = v - i) * c + (N = E - l) * N,
	};
}

function e(r) {
	let n;
	let e;
	let t;
	let u;
	let i;
	let l;
	for (e = r.length; e;) {
		for (u = r[--e], t = r[--e], n = e; n;) {
			if (l = r[--n], t === (i = r[--n]) && u === l || t === l && u === i) {
				r.splice(e, 2), r.splice(n, 2);
				break;
			}
		}
	}
}

const Delaunay = {
	triangulate(t, u) {
		let i;
		let l;
		let o;
		let a;
		let f;
		let h;
		let s;
		let I;
		let c;
		let N;
		let p;
		let g;
		const
			v = t.length;
		if (v < 3) {
			return [];
		}

		if (t = t.slice(0), u) {
			for (i = v; i--;) {
				t[i] = t[i][u];
			}
		}

		for (o = new Array(v), i = v; i--;) {
			o[i] = i;
		}

		for (o.sort((r, n) => {
			const e = t[n][0] - t[r][0];
			return e === 0 ? r - n : e;
		}), a = (function (r) {
			let n;
			let e;
			let t;
			let u;
			let i;
			let l;
			let o = Number.POSITIVE_INFINITY;
			let a = Number.POSITIVE_INFINITY;
			let f = Number.NEGATIVE_INFINITY;
			let h = Number.NEGATIVE_INFINITY;
			for (n = r.length; n--;) {
				r[n][0] < o && (o = r[n][0]), r[n][0] > f && (f = r[n][0]), r[n][1] < a && (a = r[n][1]), r[n][1] > h && (h = r[n][1]);
			}

			return t = h - a, [
				[(i = o + 0.5 * (e = f - o)) - 20 * (u = Math.max(e, t)), (l = a + 0.5 * t) - u],
				[i, l + 20 * u],
				[i + 20 * u, l - u],
			];
		})(t), t.push(a[0], a[1], a[2]), f = [n(t, v + 0, v + 1, v + 2)], h = [], s = [], i = o.length; i--; s.length = 0) {
			for (g = o[i], l = f.length; l--;) {
				(I = t[g][0] - f[l].x) > 0 && I * I > f[l].r ? (h.push(f[l]), f.splice(l, 1)) : I * I + (c = t[g][1] - f[l].y) * c - f[l].r > r || (s.push(f[l].i, f[l].j, f[l].j, f[l].k, f[l].k, f[l].i), f.splice(l, 1));
			}

			for (e(s), l = s.length; l;) {
				p = s[--l], N = s[--l], f.push(n(t, N, p, g));
			}
		}

		for (i = f.length; i--;) {
			h.push(f[i]);
		}

		for (f.length = 0, i = h.length; i--;) {
			h[i].i < v && h[i].j < v && h[i].k < v && f.push(h[i].i, h[i].j, h[i].k);
		}

		return f;
	},
	contains(r, n) {
		if (n[0] < r[0][0] && n[0] < r[1][0] && n[0] < r[2][0] || n[0] > r[0][0] && n[0] > r[1][0] && n[0] > r[2][0] || n[1] < r[0][1] && n[1] < r[1][1] && n[1] < r[2][1] || n[1] > r[0][1] && n[1] > r[1][1] && n[1] > r[2][1]) {
			return null;
		}

		const e = r[1][0] - r[0][0];
		const t = r[2][0] - r[0][0];
		const u = r[1][1] - r[0][1];
		const i = r[2][1] - r[0][1];
		const l = e * i - t * u;
		if (l === 0) {
			return null;
		}

		const o = (i * (n[0] - r[0][0]) - t * (n[1] - r[0][1])) / l;
		const a = (e * (n[1] - r[0][1]) - u * (n[0] - r[0][0])) / l;
		return o < 0 || a < 0 || o + a > 1 ? null : [o, a];
	},
};

export default Delaunay;
