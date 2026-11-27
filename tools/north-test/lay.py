"""Overlay the floor plan on its stack at given angles, front door marked red. Usage: python3 lay.py 01:283,301 06:125"""
import os, sys, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import gt, glob
from gt import SET, OUT
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
spec=[a.split(':') for a in sys.argv[1:]]  # case:ang,ang
rows=[]
for n,angs in spec:
    d=glob.glob(f'{SET}/{n}_*')[0]
    sm,_=gt.site_mask(d, 2 if n=='02' else 1); pm=gt.plan_mask(d)
    cx,cy,r=gt.circle(d); H=int(r*1.3)
    ys,xs=np.nonzero(sm); H0=int(r*2.2); mx,my=xs.mean()-H0+int(r*1.3),ys.mean()-H0+int(r*1.3)
    area_s=sm.sum() if n!='02' else None
    site=Image.open(d+'/1_site-plan.jpg').convert('RGB').crop((cx-H,cy-H,cx+H,cy+H))
    Z=420/site.width; site=site.resize((420,420))
    bb=np.nonzero(pm); plan=Image.open(d+'/2_floor-plan-3room.jpg').convert('RGB').crop((bb[1].min(),bb[0].min(),bb[1].max(),bb[0].max()))
    k=np.sqrt((area_s or 2400)/pm.sum())*Z
    row=Image.new('RGB',(420*(len(angs.split(','))),440),'white')
    for i,a in enumerate(angs.split(',')):
        a=int(a); p=plan.resize((int(plan.width*k),int(plan.height*k))).rotate(-a,expand=True,fillcolor='white')
        img=site.copy(); pa=np.asarray(p).astype(float); 
        alpha=Image.fromarray(((pa.mean(2)<200)*170).astype(np.uint8))
        img.paste(Image.new('RGB',p.size,(200,0,200)),(int(mx*Z-p.width/2),int(my*Z-p.height/2)),alpha)
        DOOR={'01':(360,1250),'02':(1110,1320),'03':(1110,1350),'05':(600,1500),'06':(1220,1440),'07':(1260,1420)}
        if n in DOOR:
            px=(DOOR[n][0]-bb[1].min()-plan.width/2)*k; py=(DOOR[n][1]-bb[0].min()-plan.height/2)*k; t=np.radians(a)
            qx=px*np.cos(t)-py*np.sin(t)+mx*Z; qy=px*np.sin(t)+py*np.cos(t)+my*Z
            ImageDraw.Draw(img).ellipse((qx-7,qy-7,qx+7,qy+7),fill=(255,0,0),outline='black')
        row.paste(img,(420*i,0)); ImageDraw.Draw(row).text((420*i+5,423),f'{n} cw {a}',fill='black')
    rows.append(row)
W=max(r.width for r in rows); out=Image.new('RGB',(W,440*len(rows)),'white')
for i,r in enumerate(rows): out.paste(r,(0,440*i))
out.save(OUT+'/lay.png')
