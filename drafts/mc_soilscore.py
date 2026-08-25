import numpy as np
rng = np.random.default_rng(42)
N = 200000

# Live factor values (verified /api/factors, 2026-06-17)
CITIES = {
 "Atlanta":      dict(canopy=46.1, pm25=9.1, park=82, walk=11.0, imp=32.5),
 "Sandy Springs":dict(canopy=54.5, pm25=9.1, park=28, walk=11.2, imp=22.7),
 "DC":           dict(canopy=37.0, pm25=6.3, park=99, walk=14.4, imp=47.1),
 "NYC":          dict(canopy=23.4, pm25=9.3, park=99, walk=13.8, imp=66.2),
}
# PROVISIONAL 1-sigma error model (to be replaced by Track-1 measured factor errors)
SIG = dict(canopy=2.5, pm25=1.0, park=4.0, walk=1.0, imp=5.0)
W   = dict(canopy=.30, air=.20, park=.20, walk=.15, imp=.15)

clamp = lambda x: np.clip(x,0,100)
def sub_canopy(c): return clamp(c/40*100)
def sub_air(p):    return clamp(100*(20-p)/(20-5))
def sub_park(pk):  return clamp(pk)
def sub_walk(w):   return clamp(100*(w-1)/(20-1))
def sub_imp(i):    return clamp(100-i)
def score(c,p,pk,w,i):
    return (W['canopy']*sub_canopy(c)+W['air']*sub_air(p)+W['park']*sub_park(pk)
            +W['walk']*sub_walk(w)+W['imp']*sub_imp(i))

def samp(mu,sig,lo,hi): return np.clip(rng.normal(mu,sig,N),lo,hi)

print(f"Monte Carlo N={N:,} | provisional sigma: canopy±{SIG['canopy']}pp pm25±{SIG['pm25']} park±{SIG['park']}pp walk±{SIG['walk']} imperv±{SIG['imp']}pp\n")
print(f"{'City':14s} {'point':>5s} {'mean':>5s} {'SD':>4s} {'90% CI':>12s}   sensitivity (% of score variance)")
for name,v in CITIES.items():
    pt = score(v['canopy'],v['pm25'],v['park'],v['walk'],v['imp'])
    c=samp(v['canopy'],SIG['canopy'],0,100); p=samp(v['pm25'],SIG['pm25'],0,50)
    pk=samp(v['park'],SIG['park'],0,100); w=samp(v['walk'],SIG['walk'],1,20); i=samp(v['imp'],SIG['imp'],0,100)
    s = score(c,p,pk,w,i)
    mean,sd = s.mean(), s.std()
    lo,hi = np.percentile(s,[5,95])
    # first-order sensitivity: vary one factor, others fixed at mu
    contrib={}
    base=dict(c=v['canopy'],p=v['pm25'],pk=v['park'],w=v['walk'],i=v['imp'])
    varmap={'canopy':('c',c),'air':('p',p),'park':('pk',pk),'walk':('w',w),'imp':('i',i)}
    for fac,(k,arr) in varmap.items():
        args=dict(base); args[k]=arr
        contrib[fac]=score(args['c'],args['p'],args['pk'],args['w'],args['i']).var()
    tot=sum(contrib.values()) or 1
    sens=sorted(((f,100*x/tot) for f,x in contrib.items()), key=lambda z:-z[1])
    senstr=" ".join(f"{f}:{pct:.0f}%" for f,pct in sens if pct>=1)
    print(f"{name:14s} {pt:5.1f} {mean:5.1f} {sd:4.1f}  [{lo:4.1f},{hi:4.1f}]   {senstr}")

# Pairwise significance: P(row city's true score > col city's), independent draws
print("\nPairwise P(row > col)  [≈0.5 = indistinguishable, ≥0.95 = clearly higher]")
names=list(CITIES.keys())
samples={}
for name,v in CITIES.items():
    c=samp(v['canopy'],SIG['canopy'],0,100); p=samp(v['pm25'],SIG['pm25'],0,50)
    pk=samp(v['park'],SIG['park'],0,100); w=samp(v['walk'],SIG['walk'],1,20); i=samp(v['imp'],SIG['imp'],0,100)
    samples[name]=score(c,p,pk,w,i)
hdr="".join(f"{n[:6]:>8s}" for n in names)
print(f"{'':14s}{hdr}")
for a in names:
    row="".join(f"{(samples[a]>samples[b]).mean():8.2f}" for b in names)
    print(f"{a:14s}{row}")
