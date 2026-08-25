#!/usr/bin/env python3
"""
Hedonic diagnostic — DC (deep-dive companion to avm-failure-analysis-dc.py).
Question answered: is the COD~21 plateau the METHOD (comp median) or the
FEATURES (CAMA data)? Answer: the method. Ridge hedonic on the same CSV,
fit <=2024, tested on 2025+ with panel-index carry-forward:
COD 12.7 (passes IAAO <=15; OTR=13.4), MdAPE 9.1 (ties OTR).
PRD/PRB still fail (tier mis-centering: >2M med 0.864) - segment work needed.
This is a DIAGNOSTIC, not a shipping model.
Usage: python3 hedonic-diagnostic-dc.py <sales_csv>
"""
import csv, math, sys
import numpy as np
from collections import defaultdict

COND={'Poor':1,'Fair':2,'Average':3,'Good':4,'Very Good':5,'Excellent':6}
GRADES=['Low Quality','Fair Quality','Average','Above Average','Good Quality','Very Good','Excellent','Superior','Exceptional-A','Exceptional-B','Exceptional-C','Exceptional-D']
GIX={g:i for i,g in enumerate(GRADES)}

def main():
    rows=[]
    for r in csv.DictReader(open(sys.argv[1])):
        try:
            if not r['gba'] or float(r['gba'])<=0: continue
            rows.append(dict(
                yr=r['sale_date'][:4], q=r['sale_date'][:4]+'Q'+str((int(r['sale_date'][5:7])-1)//3+1),
                price=float(r['sale_price']), gba=float(r['gba']), land=float(r['landarea'] or 0),
                ayb=float(r['ayb'] or 0), eyb=float(r['eyb'] or 0), rmdl=float(r['yr_rmdl'] or 0),
                bed=float(r['bedrm'] or 0), bath=float(r['bathrm'] or 0), hbath=float(r['hf_bathrm'] or 0),
                rooms=float(r['rooms'] or 0), stories=float(r['stories'] or 0), units=float(r['num_units'] or 1),
                ac=1.0 if r['ac']=='Y' else 0.0, fp=float(r['fireplaces'] or 0),
                cond=COND.get(r['condition'],3), gix=GIX.get(r['grade'],2),
                cell=f"{int(float(r['lat'])//0.008)}:{int(float(r['lon'])//0.008)}", ward=r['ward'],
                usecode=r['usecode']))
        except ValueError: continue
    train=[r for r in rows if r['yr']<='2024']; test=[r for r in rows if r['yr']>='2025']
    qpsf=defaultdict(list)
    for r in rows: qpsf[r['q']].append(r['price']/r['gba'])
    qidx={q: float(np.median(v)) for q,v in qpsf.items() if len(v)>=50}
    ANCHOR='2024Q4'
    def vocab(key, items, min_n=25):
        c=defaultdict(int)
        for r in items: c[r[key]]+=1
        return {v:i for i,v in enumerate(sorted(k for k,n in c.items() if n>=min_n))}
    cells=vocab('cell',train); wards=vocab('ward',train,5); qs=vocab('q',train,5)
    grades=vocab('gix',train,25); conds=vocab('cond',train,25); uses=vocab('usecode',train,25)
    def design(r, q_override=None):
        q=q_override or r['q']
        x=[1.0, math.log(r['gba']), math.log(r['land']+1), r['bed'], r['bath'], r['hbath'], r['rooms'],
           r['stories'], r['ac'], r['fp'], min(r['units'],4),
           (2026-r['ayb'])/100 if r['ayb']>1800 else 1.0,
           (2026-r['eyb'])/100 if r['eyb']>1800 else 0.5,
           1.0 if r['rmdl']>=2010 else 0.0, 1.0 if 1990<=r['rmdl']<2010 else 0.0]
        for vb,key,val in ((grades,'gix',r['gix']),(conds,'cond',r['cond']),(uses,'usecode',r['usecode']),(qs,'q',q),(wards,'ward',r['ward'])):
            v=[0.0]*len(vb)
            if val in vb: v[vb[val]]=1.0
            x+=v
        v=[0.0]*len(cells)
        if r['cell'] in cells: v[cells[r['cell']]]=1.0
        x+=v
        return x
    X=np.array([design(r) for r in train]); y=np.log(np.array([r['price'] for r in train]))
    beta=np.linalg.solve(X.T@X + 1.0*np.eye(X.shape[1]), X.T@y)
    Xt=np.array([design(r, q_override=ANCHOR) for r in test])
    carry=np.array([qidx.get(r['q'], qidx[ANCHOR])/qidx[ANCHOR] for r in test])
    pred=np.exp(Xt@beta)*carry
    sp=np.array([r['price'] for r in test])
    r_=pred/sp; m=float(np.median(r_))
    cod=100*float(np.mean(np.abs(r_-m)))/m
    prd=float(np.mean(r_))/(pred.sum()/sp.sum())
    vp=0.5*(sp+pred/m); x=np.log(vp)/math.log(2); yv=r_/m-1; xc=x-x.mean()
    prb=float((xc*(yv-yv.mean())).sum()/(xc**2).sum())
    mdape=100*float(np.median(np.abs(pred-sp)/sp))
    print(f"n={len(sp):,}  med={m:.3f}  COD={cod:.1f}  PRD={prd:.3f}  PRB={prb:+.3f}  MdAPE={mdape:.1f}")

if __name__=='__main__':
    main()
