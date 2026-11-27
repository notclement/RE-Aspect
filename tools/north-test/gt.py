"""Ground truth by shape matching: circled stack outline (site plan, north up) vs floor plan outline.
For every mirror × clockwise rotation, IoU after scaling to equal area and aligning centroids."""
import glob, json, sys
import os
SET = os.environ.get('NORTH_SET', 'hdb-test-set')          # folder with 00_…/, 01_…/ case folders
OUT = os.environ.get('NORTH_OUT', 'north-test-out')        # results / images go here
os.makedirs(OUT, exist_ok=True)
import numpy as np
from PIL import Image, ImageOps
from scipy import ndimage as ndi

def circle(d):
    a = glob.glob(d + '/answer*')[0]
    A = np.asarray(Image.open(a).convert('RGB')).astype(int)
    S = np.asarray(Image.open(d + '/1_site-plan.jpg').convert('RGB')).astype(int)
    ys, xs = np.nonzero(np.abs(A - S).sum(2) > 120)
    return int(xs.mean()), int(ys.mean()), int(max(np.ptp(xs), np.ptp(ys)) / 2)

def site_mask(d, dil=1):
    cx, cy, r = circle(d)
    S = np.asarray(Image.open(d + '/1_site-plan.jpg').convert('RGB')).astype(int)
    H = int(r * 2.2)
    sub = S[cy - H:cy + H, cx - H:cx + H]
    L = sub.mean(2)
    dark = ndi.binary_dilation(L < 110, iterations=dil)
    yy, xx = np.mgrid[-H:H, -H:H]
    free = ~dark
    lab, n = ndi.label(free)
    near = (xx ** 2 + yy ** 2) < (0.45 * r) ** 2
    ids = lab[near & free]
    k = np.bincount(ids[ids > 0]).argmax()
    m = ndi.binary_fill_holes(lab == k)
    m = ndi.binary_dilation(m, iterations=dil + 1)
    col = np.median(sub[lab == k], 0)
    return m, col

def plan_mask(d):
    P = np.asarray(Image.open(d + '/2_floor-plan-3room.jpg').convert('L')).astype(int)
    m = P < 235
    m = ndi.binary_opening(m, iterations=2)  # drop thin text strokes / lines
    m = ndi.binary_closing(m, iterations=12)
    m = ndi.binary_fill_holes(m)
    lab, n = ndi.label(m)
    k = np.bincount(lab.ravel())[1:].argmax() + 1
    return lab == k

def norm(mask, N=160):
    ys, xs = np.nonzero(mask)
    pts = np.stack([xs - xs.mean(), ys - ys.mean()], 1)
    pts /= np.sqrt(len(xs))  # equal area
    return pts

def raster(pts, N=200, s=40.0):
    g = np.zeros((N, N), bool)
    ij = np.round(pts * s + N / 2).astype(int)
    ok = (ij >= 0).all(1) & (ij < N).all(1)
    g[ij[ok, 1], ij[ok, 0]] = True
    return ndi.binary_closing(g, iterations=2)

def match(d):
    sm, col = site_mask(d)
    pm = plan_mask(d)
    S = raster(norm(sm))
    # subsample plan points
    ys, xs = np.nonzero(pm[::4, ::4])
    base = np.stack([xs - xs.mean(), ys - ys.mean()], 1) / np.sqrt(len(xs))
    out = []
    for mir in (0, 1):
        b = base.copy()
        if mir: b[:, 0] *= -1
        for th in range(0, 360, 2):
            t = np.radians(th)
            R = np.array([[np.cos(t), -np.sin(t)], [np.sin(t), np.cos(t)]])  # clockwise on screen (y down)
            P = raster(b @ R.T)
            iou = (S & P).sum() / (S | P).sum()
            out.append((round(float(iou), 3), th, mir))
    out.sort(reverse=True)
    return out, sm, pm, col

if __name__ == '__main__':
    res = {}
    for d in sorted(glob.glob(SET+'/0*')):
        n = d.split('/')[-1]
        out, sm, pm, col = match(d)
        Image.fromarray((sm * 255).astype(np.uint8)).save(f'{OUT}/sm{n[:2]}.png')
        Image.fromarray((pm * 255).astype(np.uint8)).resize((pm.shape[1] // 4, pm.shape[0] // 4)).save(f'{OUT}/pm{n[:2]}.png')
        # best per mirror, with distinct angles
        best = []
        for o in out:
            if all(abs(((o[1] - b[1] + 180) % 360) - 180) > 20 or o[2] != b[2] for b in best): best.append(o)
            if len(best) == 4: break
        print(n, 'area', int(sm.sum()), 'col', col.astype(int).tolist(), best)
        res[n[:2]] = best
    json.dump(res, open(OUT+'/gt.json', 'w'))
