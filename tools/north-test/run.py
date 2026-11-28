"""Run detect-north on every test case. Usage: python3 run.py [00 06 …] [x3]   (CONC=2 for parallelism)"""
import os
SET = os.environ.get('NORTH_SET', 'hdb-test-set')          # folder with 00_…/, 01_…/ case folders
OUT = os.environ.get('NORTH_OUT', 'north-test-out')        # results / images go here
os.makedirs(OUT, exist_ok=True)
import json, sys, base64, io, urllib.request, concurrent.futures, time, glob
from PIL import Image
tok=open(os.environ.get('NORTH_TOKEN_FILE','token.txt')).read().strip()  # session token of an ADMIN on the test site (never commit it)
pk=os.environ['SUPABASE_PUBLISHABLE_KEY']  # test project publishable key
FN=os.environ.get('NORTH_FN','https://kyupdztsvwegaelrkyfd.supabase.co/functions/v1/detect-north')
GT={'00':168,'01':293,'02':0,'03':0,'04':0,'05':190,'06':125,'07':205,
    # set 2 (1024 px, 28 Nov): read by eye at 1024 px (tilt by Hough on the unit outlines); '?' = less sure, see README
    '08':180,'09':83,'10':0,'11':180,'12':180,'13':180,'14':353,'15':208,'16':195,'18':90}
# 17 Rajah Summit and 19 Toa Payoh Ascent are left out: their 2_floor-plan-3room.jpg is a 4-ROOM plan.
UNSURE={'09','11'}
def enc(f,maxs,q):
    im=Image.open(f).convert('RGB'); im.thumbnail((maxs,maxs)); b=io.BytesIO(); im.save(b,'JPEG',quality=int(q*100))
    return 'data:image/jpeg;base64,'+base64.b64encode(b.getvalue()).decode()
def body(d):
    c=json.load(open(d+'/case.json'))
    return {'floorPlan':enc(d+'/2_floor-plan-3room.jpg',1536,.8),'others':[enc(d+'/1_site-plan.jpg',1400,.75)],
      'context':{'address':f"Blk {c['block']} {c['project']}, {c['town']}, Singapore",'unitNo':'#'+c['unit_no'],'level':7,'propertyType':'hdb'},'debug':True}
def one(arg):
    n,d,b=arg
    req=urllib.request.Request(FN,data=json.dumps(b).encode(),method='POST',
        headers={'Authorization':'Bearer '+tok,'apikey':pk,'Content-Type':'application/json','Origin':'https://re-aspect-dev.clement-392.workers.dev'})
    t=time.time()
    try: r=json.loads(urllib.request.urlopen(req,timeout=180).read())
    except urllib.error.HTTPError as e: r={'http':e.code,'body':e.read().decode()[:300]}
    except Exception as e: r={'err':str(e)}
    r['_s']=round(time.time()-t,1); r['_case']=n; return r
cases=[a for a in sys.argv[1:] if not a.startswith('x')] or list(GT)
reps=int(([a[1:] for a in sys.argv[1:] if a.startswith('x')] or ['1'])[0])
jobs=[]
for d in sorted(glob.glob(SET+'/[0-9][0-9]_*')):
    n=d.split('/')[-1][:2]
    if n in cases and n in GT:
        b=body(d); jobs+= [(n,d,b)]*reps
with concurrent.futures.ThreadPoolExecutor(int(__import__("os").environ.get("CONC","6"))) as ex: res=list(ex.map(one,jobs))
ok=0
for r in res:
    a=r.get('angle'); g=GT[r['_case']]
    good=a is not None and r.get('found') and min(abs(a-g),360-abs(a-g))<=15; ok+=bool(good)
    d=r.get('debug') if isinstance(r.get('debug'),dict) else {}
    f=d.get('find',{}); runs=d.get('runs',[])
    print(r['_case'],'PASS' if good else 'FAIL', a,'want',g, r.get('method'), r.get('_s'),'s | est',f.get('rotate_cw_deg'),'stack',f.get('stack_found'),f.get('stack_label'),'N',f.get('north_tail'),f.get('north_tip'),
      '| runs',[(x['deg'],x['ai'].get('ring_label'),{k:round(v) for k,v in (x['geo'] or {}).items() if isinstance(v,(int,float))}) for x in runs], '| chose',d.get('chose'),[ (v['order'],v['ai'].get('choice'),v['ai'].get('second')) for v in d.get('votes',[])], (r.get('detail') or r.get('body') or r.get('err') or r.get('reason') or '')[:160])
print(f'{ok}/{len(res)} pass')
for g in sorted(set(r['_case'] for r in res)):
    rr=[r for r in res if r['_case']==g]; a=[r.get('angle') for r in rr]
    print(g, 'want', GT[g], '(unsure)' if g in UNSURE else '', 'got', a)
json.dump(res,open(f'{OUT}/res-{int(time.time())}.json','w'))
