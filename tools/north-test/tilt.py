"""Block tilt from the black unit outlines near the ring; draws the found axes on a zoom for checking."""
import sys,glob,numpy as np,cv2
sys.path.insert(0,__import__('os').path.dirname(__import__('os').path.abspath(__file__))); import gt
from PIL import Image,ImageDraw
SET=__import__('os').environ.get('NORTH_SET','hdb-test-set'); Z=8
out=[]
for n in sys.argv[1:]:
    d=glob.glob(f'{SET}/{n}_*')[0]; cx,cy,r=gt.circle(d); H=int(r*float(__import__("os").environ.get("HF","2.2")))
    G=np.asarray(Image.open(d+'/1_site-plan.jpg').convert('L').crop((cx-H,cy-H,cx+H,cy+H)).resize((2*H*Z,2*H*Z),Image.BICUBIC))
    dark=(G<85).astype(np.uint8)*255
    lines=cv2.HoughLinesP(dark,1,np.pi/360,threshold=60,minLineLength=8*Z,maxLineGap=Z)
    h=np.zeros(180)
    if lines is not None:
        for x1,y1,x2,y2 in lines.reshape(-1,4):
            a=np.degrees(np.arctan2(y2-y1,x2-x1))%90; L=np.hypot(x2-x1,y2-y1)
            for dd in range(-3,4): h[int(round(a*2+dd))%180]+=L*np.exp(-dd*dd/4)
    t=(h.argmax()/2)%90
    im=Image.fromarray(G).convert('RGB'); dr=ImageDraw.Draw(im); C=H*Z
    for k in range(4):
        th=np.radians(t+90*k); dr.line((C,C,C+C*np.cos(th),C+C*np.sin(th)),fill=(255,0,0),width=3)
    dr.text((5,5),f'{n} tilt {t:.1f}',fill=(255,0,0)); im.thumbnail((400,400)); out.append(im)
    print(n,round(t,1))
W=Image.new('RGB',(400*len(out),400),'white')
for i,im in enumerate(out): W.paste(im,(400*i,0))
W.save(gt.OUT+'/tilt.png')
