"""Generate RE:Aspect demo flats (cm, north-up: +x east, +y south) and check the layouts like an
interior designer would: furniture inside rooms, not overlapping, not in door swings, not across walls."""
import json, math, sys

def rect(x1,y1,x2,y2): return [[x1,y1],[x2,y1],[x2,y2],[x1,y2]]

class Flat:
    def __init__(s, W, H): s.W=W; s.H=H; s.walls=[]; s.doors=[]; s.wins=[]; s.items=[]; s.rooms=[]; s.outline=rect(0,0,W,H)
    def wall(s,x1,y1,x2,y2,t=12): s.walls.append(dict(a=[x1,y1],b=[x2,y2],t=t))
    def door(s,x1,y1,x2,y2,flip=0,glass=False): s.doors.append(dict(a=[x1,y1],b=[x2,y2],glass=glass,flip=flip))
    def win(s,x1,y1,x2,y2,n,room,sill=100,head=230): s.wins.append(dict(a=[x1,y1],b=[x2,y2],normal=n,sill=sill,head=head,room=room))
    def item(s,kind,x,y,w,d,h,color,r=6,rot=0): s.items.append(dict(kind=kind,x=x,y=y,w=w,d=d,h=h,color=color,r=r,**({'rot':rot} if rot else {})))
    def room(s,name,x,y): s.rooms.append(dict(name=name,x=x,y=y))
    def mirror(s):
        W=s.W; fx=lambda p:[W-p[0],p[1]]
        s.outline=[fx(p) for p in s.outline][::-1]
        for w in s.walls: w['a'],w['b']=fx(w['a']),fx(w['b'])
        for d in s.doors:
            d['a'],d['b']=fx(d['a']),fx(d['b']); d['flip']^=2   # mirrored → swings to the other side
        for w in s.wins:
            w['a'],w['b']=fx(w['a']),fx(w['b']); w['normal']=[-w['normal'][0],w['normal'][1]]; w['room']=[fx(p) for p in w['room']][::-1]
        for i in s.items: i['x']=W-i['x']-i['w']
        for r in s.rooms: r['x']=W-r['x']

COL=dict(bed='#B7BE9C',wardrobe='#7F7766',desk='#9C7A57',sofa='#9DAE8F',table='#9C7A57',chair='#A88B6A',console='#8E6F52',
         rug='#CDBFA8',counter='#C9CBC2',bath='#E9ECE6',plant='#6E8A5E',coffee='#EFE8DA')
def furn(f,kind,x,y,w,d,h=None,**k):
    H=dict(bed=50,wardrobe=215,desk=75,sofa=80,table=75,chair=90,console=48,rug=1,counter=90,bath=60,plant=90)
    col=COL['coffee'] if kind=='table' and (h or 75)<50 else COL[kind]
    f.item(kind,x,y,w,d,h if h is not None else H[kind],col,r=k.get('r',6),rot=k.get('rot',0))

OUT=20  # outside wall thickness
def outside(f,doorgap=None):
    o=f.outline
    for i in range(len(o)): f.wall(*o[i],*o[(i+1)%len(o)],t=OUT)

# ───────────── 3-room · 67 m² · living faces EAST (bright mornings) ─────────────
def three():
    f=Flat(940,690); outside(f)
    f.wall(300,0,300,310); f.wall(0,310,340,310)                         # bedroom 2
    f.wall(300,200,460,200); f.wall(460,0,460,200,25)                    # common bath
    f.wall(460,200,620,200,25); f.wall(620,0,620,200,25)                 # shelter
    f.wall(740,0,740,260); f.wall(740,260,940,260)                       # kitchen
    f.wall(340,310,340,690); f.wall(340,480,480,480); f.wall(480,480,480,690)  # master + ensuite
    f.door(630,0,730,0)               # main door (swings in)
    f.door(300,210,300,300)           # bedroom 2 (swings west, into the room)
    f.door(330,200,410,200,flip=2)    # bath (swings north, in)
    f.door(500,200,580,200)           # shelter (swings out)
    f.door(740,170,740,250,flip=2)    # kitchen (swings east, in)
    f.door(340,330,340,420)           # master (swings west, in)
    f.door(340,500,340,580,flip=2)    # ensuite (swings east, in)
    bed2=rect(0,0,300,310); mbr=rect(0,310,340,690); liv=[[340,260],[740,260],[740,260],[940,260],[940,690],[480,690],[480,480],[340,480]]
    f.win(30,0,220,0,[0,-1],bed2); f.win(340,0,420,0,[0,-1],rect(300,0,460,200),sill=160,head=220)
    f.win(770,0,910,0,[0,-1],rect(740,0,940,260),sill=110)
    f.win(40,690,300,690,[0,1],mbr); f.win(370,690,450,690,[0,1],rect(340,480,480,690),sill=160,head=220)
    f.win(940,300,940,420,[1,0],liv,sill=90); f.win(940,470,940,660,[1,0],liv,sill=90)
    # bedroom 2: super single, desk under the window, wardrobe
    furn(f,'bed',20,114,107,190); furn(f,'desk',60,8,110,50); furn(f,'wardrobe',236,8,58,150)
    furn(f,'bath',362,8,90,100)
    furn(f,'counter',748,6,122,60); furn(f,'counter',876,6,58,240)
    # master: queen bed (headboard on the west wall), wardrobe on the north wall
    furn(f,'wardrobe',8,316,200,58); furn(f,'bed',8,440,200,152,r=10); furn(f,'bath',382,592,90,90)
    # living: sofa faces east to the TV under the window; dining by the kitchen
    furn(f,'rug',600,450,250,200); furn(f,'sofa',488,440,90,210,r=14); furn(f,'table',625,500,50,110,h=42)
    furn(f,'console',894,460,40,180)
    furn(f,'table',790,288,120,75); furn(f,'chair',806,368,45,45); furn(f,'chair',858,368,45,45); furn(f,'chair',742,300,45,45)
    furn(f,'plant',285,635,40,40,r=20)
    for n,x,y in [('Bedroom 2',200,240),('Bath',380,150),('Shelter',540,100),('Kitchen',840,120),('Main bedroom',170,630),('Bath',410,650),('Living / Dining',700,560)]: f.room(n,x,y)
    return f

# ───────────── 4-room / 5-room template: bedrooms west, living east (mirror for west-facing) ─────────────
def family(W,H,study=False,westish=False):
    f=Flat(W,H); outside(f); L=660; K=760; Y=960 if W<1200 else W-150   # living starts at x=L, kitchen at K, yard at Y
    f.wall(300,0,300,300); f.wall(0,300,300,300)                          # bedroom 3
    f.wall(300,210,460,210); f.wall(460,0,460,210,25)                     # common bath
    f.wall(460,210,620,210,25); f.wall(620,0,620,210,25)                  # shelter
    f.wall(K,0,K,300); f.wall(K,300,W,300); f.wall(Y,0,Y,300)             # kitchen + service yard
    f.wall(0,420,L,420); f.wall(300,420,300,H); f.wall(L,420,L,H)        # bedroom 2 + master
    f.wall(440,420,440,620); f.wall(300,620,440,620)                      # ensuite
    f.door(640,0,740,0)                       # main door
    f.door(200,300,290,300,flip=2)            # bedroom 3 (in, north)
    f.door(330,210,410,210,flip=2)            # bath
    f.door(500,210,580,210)                   # shelter (out)
    f.door(K,200,K,285,flip=2)                # kitchen (in, east)
    f.door(Y,200,Y,280,flip=2)                # yard (clear of the kitchen counters)
    f.door(200,420,290,420)                   # bedroom 2 (in, south)
    f.door(470,420,560,420)                   # master (in, south)
    f.door(440,430,440,500)                   # ensuite (swings west into the ensuite), near the room door so the bed doesn't block it
    bed3=rect(0,0,300,300); bed2=rect(0,420,300,H); mbr=[[300,420],[L,420],[L,H],[300,H]]
    liv=[[620,300],[K,300],[W,300],[W,H],[L,H],[L,420],[620,420]]
    f.win(30,0,220,0,[0,-1],bed3); f.win(340,0,420,0,[0,-1],rect(300,0,460,210),sill=160,head=220)
    f.win(K+30,0,Y-20,0,[0,-1],rect(K,0,Y,300),sill=110); f.win(W,40,W,260,[1,0],rect(Y,0,W,300))
    f.win(30,H,270,H,[0,1],bed2); f.win(470,H,640,H,[0,1],mbr); f.win(340,H,420,H,[0,1],rect(300,420,440,620),sill=160,head=220)
    if westish:   # 5-room: the living room's big windows are on the outer side wall (west once mirrored)
        f.win(W,330,W,H-330,[1,0],liv,sill=50); f.win(W,H-250,W,H-30,[1,0],liv,sill=50)
    else:         # 4-room: big living window/glass on the far (south) wall
        f.win(L+40,H,W-20,H,[0,1],liv,sill=50)
    # bedrooms
    furn(f,'bed',10,100,107,190); furn(f,'desk',125,8,100,50); furn(f,'wardrobe',236,8,58,150)
    furn(f,'wardrobe',8,426,150,58); furn(f,'bed',10,H-240,107,190); furn(f,'desk',140,H-60,110,52)
    furn(f,'wardrobe',306,640,58,190); furn(f,'bed',L-208,H-260,200,152,r=10); furn(f,'bath',318,522,90,90)
    furn(f,'bath',362,8,90,100)
    # kitchen
    furn(f,'counter',K+8,6,Y-K-80,60); furn(f,'counter',Y-66,6,60,170)
    # living + dining (+ study nook in the 5-room)
    furn(f,'table',K+40,340,140,80); furn(f,'chair',K+55,425,45,45); furn(f,'chair',K+120,425,45,45)
    furn(f,'chair',K-10,358,45,45); furn(f,'chair',K+185,358,45,45)
    if westish:   # sofa on the inner wall, low TV console under the big window (keeps the glass clear)
        furn(f,'console',W-46,H-300,40,180)
        furn(f,'sofa',L+8,H-310,90,210,r=14); furn(f,'rug',L+120,H-320,W-L-200,220); furn(f,'table',L+145,H-260,50,110,h=42)
    else:
        furn(f,'console',L+6,H-300,40,180)
        sx=W-100
        furn(f,'sofa',sx,H-310,90,210,r=14); furn(f,'rug',L+110,H-320,sx-L-130,220); furn(f,'table',sx-95,H-260,50,110,h=42)
    furn(f,'plant',W-50,H-60,40,40,r=20)
    if study: furn(f,'desk',W-150,330,120,55); furn(f,'chair',W-115,390,45,45)
    rooms=[('Bedroom 3',190,215),('Bath',380,150),('Shelter',540,100),('Kitchen',(K+Y)//2,150),('Yard',(Y+W)//2,220),
           ('Bedroom 2',200,560),('Main bedroom',480,H-40),('Bath',370,560),('Living / Dining',(L+W)//2+20,H-60)]
    if study: rooms.append(('Study',W-90,460))
    for n,x,y in rooms: f.room(n,x,y)
    return f

# ───────────── checks ─────────────
def corners(i):
    cx,cy=i['x']+i['w']/2,i['y']+i['d']/2; r=math.radians(i.get('rot',0)); c,s=math.cos(r),math.sin(r)
    return [(cx+x*c-y*s,cy+x*s+y*c) for x,y in [(-i['w']/2,-i['d']/2),(i['w']/2,-i['d']/2),(i['w']/2,i['d']/2),(-i['w']/2,i['d']/2)]]
def box(i): xs=[p[0] for p in corners(i)]; ys=[p[1] for p in corners(i)]; return min(xs),min(ys),max(xs),max(ys)
def ov(a,b,m=0): return a[0]<b[2]-m and b[0]<a[2]-m and a[1]<b[3]-m and b[1]<a[3]-m
def seg_box(w):
    t=w['t']/2; (x1,y1),(x2,y2)=w['a'],w['b']; return min(x1,x2)-t,min(y1,y2)-t,max(x1,x2)+t,max(y1,y2)+t
def swing(d):
    (hx,hy),(ex,ey)=(d['b'],d['a']) if d['flip']&1 else (d['a'],d['b'])
    dx,dy=ex-hx,ey-hy; L=math.hypot(dx,dy); side=-1 if d['flip']&2 else 1
    R=max(L,60); nx,ny=-dy/L,dx/L
    xs=[hx,ex,hx+nx*R,ex+nx*R,hx-nx*R,ex-nx*R]; ys=[hy,ey,hy+ny*R,ey+ny*R,hy-ny*R,ey-ny*R]; return min(xs),min(ys),max(xs),max(ys)
def check(name,f):
    bad=[]
    sw=[swing(d) for d in f.doors]
    for k,i in enumerate(f.items):
        b=box(i)
        if b[0]<0 or b[1]<0 or b[2]>f.W or b[3]>f.H: bad.append(f'{i["kind"]}#{k} outside the flat')
        if i['kind']!='rug':
            for w in f.walls:
                if ov(b,seg_box(w),1): bad.append(f'{i["kind"]}#{k} crosses wall {w["a"]}-{w["b"]}')
            for d,s in zip(f.doors,sw):
                if ov(b,s,1): bad.append(f'{i["kind"]}#{k} in door swing {d["a"]}-{d["b"]}')
        for j in range(k+1,len(f.items)):
            o=f.items[j]
            if 'rug' in (i['kind'],o['kind']): continue
            if ov(b,box(o)): bad.append(f'{i["kind"]}#{k} overlaps {o["kind"]}#{j}')
    for d in f.doors:
        L=math.hypot(d['b'][0]-d['a'][0],d['b'][1]-d['a'][1])
        if not 70<=L<=110: bad.append(f'door {d["a"]} width {L}')
    a=sum(f.outline[i][0]*f.outline[(i+1)%len(f.outline)][1]-f.outline[(i+1)%len(f.outline)][0]*f.outline[i][1] for i in range(len(f.outline)))/2
    print(name, f'{abs(a)/1e4:.1f} m² inside,', 'OK' if not bad else bad)
    return not bad

def settle(f):
    # Push each piece of furniture clear of walls (to the wall face + 2 cm), like sliding it back against the wall.
    for _ in range(6):
        moved=False
        for i in f.items:
            if i['kind']=='rug': continue
            for w in f.walls:
                b=box(i); s_=seg_box(w); s_=(s_[0]-2,s_[1]-2,s_[2]+2,s_[3]+2)
                if not ov(b,s_): continue
                pens=[(s_[2]-b[0],1,0),(b[2]-s_[0],-1,0),(s_[3]-b[1],0,1),(b[3]-s_[1],0,-1)]
                p,dx,dy=min(pens)
                if p>40: continue   # deep overlap = a real layout error, leave it for the check
                i['x']+=dx*p; i['y']+=dy*p; moved=True
        if not moved: break

units={'3room':three(),'4room':family(1080,840),'5room':family(1250,880,study=True,westish=True)}
for v in units.values(): settle(v)
units['5room'].mirror()   # living on the west side → faces west (harsh afternoon sun)
ok=all([check(k,v) for k,v in units.items()])
json.dump({k:dict(outline=v.outline,walls=v.walls,doors=v.doors,windows=v.wins,items=v.items,rooms=v.rooms) for k,v in units.items()},open('/tmp/demo/units.json','w'))
sys.exit(0 if ok else 1)
