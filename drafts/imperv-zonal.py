import urllib.request, urllib.parse, json, io
from urllib.error import HTTPError
import numpy as np, rasterio
from rasterio.features import rasterize
from rasterio.warp import reproject, Resampling
from pyproj import Transformer

TIGER="https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/{svc}/MapServer/{lyr}/query"
WCS="https://www.mrlc.gov/geoserver/ows?service=WCS&version=2.0.1&request=GetCoverage&format=image/geotiff&outputCrs=http://www.opengis.net/def/crs/EPSG/0/5070"
IMP="mrlc_display__NLCD_2021_Impervious_L48"
LC ="mrlc_display__NLCD_2021_Land_Cover_L48"
T3857=Transformer.from_crs(4326,3857,always_xy=True)

CITIES={
 "atlanta":("Places_CouSub_ConCity_SubMCD",4,"GEOID='1304000'"),
 "sandysprings":("Places_CouSub_ConCity_SubMCD",4,"GEOID='1368516'"),
 "nyc":("Places_CouSub_ConCity_SubMCD",4,"GEOID='3651000'"),
 "dc":("State_County",None,"GEOID='11001'"),
}
def get(url):
    try:
        with urllib.request.urlopen(url,timeout=120) as r: return r.read()
    except HTTPError as e: raise RuntimeError(e.read()[:200])

def counties_layer():
    d=json.loads(get("https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer?f=json"))
    return next((l["id"] for l in d["layers"] if l["name"]=="Counties"),1)

def fetch_geom(svc,lyr,where):
    if lyr is None: lyr=counties_layer()
    p={"where":where,"outFields":"NAME,GEOID","returnGeometry":"true","outSR":"4326","f":"geojson"}
    d=json.loads(get(TIGER.format(svc=svc,lyr=lyr)+"?"+urllib.parse.urlencode(p)))
    f=d["features"][0]; return f["geometry"],f["properties"]["NAME"]

def coords_bbox3857(geom):
    xs=[];ys=[]
    def walk(c):
        for e in c:
            if isinstance(e[0],(int,float)):
                x,y=T3857.transform(e[0],e[1]); xs.append(x); ys.append(y)
            else: walk(e)
    walk(geom["coordinates"]); return min(xs),min(ys),max(xs),max(ys)

def reproj_geom(geom,transformer):
    def rc(c): return [list(transformer.transform(x,y)) for x,y in c]
    g=dict(geom)
    if g["type"]=="Polygon": g["coordinates"]=[rc(r) for r in g["coordinates"]]
    else: g["coordinates"]=[[rc(r) for r in poly] for poly in g["coordinates"]]
    return g

def wcs(cov,bb):
    pad=60; xmin,ymin,xmax,ymax=bb
    return get(WCS+f"&coverageId={cov}&subset=X({xmin-pad},{xmax+pad})&subset=Y({ymin-pad},{ymax+pad})")

def run(city):
    svc,lyr,where=CITIES[city]
    geom,name=fetch_geom(svc,lyr,where)
    bb=coords_bbox3857(geom)
    with rasterio.open(io.BytesIO(wcs(IMP,bb))) as s:
        imp=s.read(1).astype(np.float32); tr=s.transform; crs=s.crs; H,W=imp.shape
    with rasterio.open(io.BytesIO(wcs(LC,bb))) as s2:
        src=s2.read(1); lc=np.zeros((H,W),src.dtype)
        reproject(src,lc,src_transform=s2.transform,src_crs=s2.crs,dst_transform=tr,dst_crs=crs,resampling=Resampling.nearest)
    Tg=Transformer.from_crs(4326,crs.to_epsg(),always_xy=True)
    g=reproj_geom(geom,Tg)
    poly=rasterize([(g,1)],out_shape=(H,W),transform=tr,fill=0,dtype="uint8").astype(bool)
    inside=poly&(imp<=100)
    land=inside&(lc!=11)&(lc!=0)
    ml=float(imp[land].mean()); ma=float(imp[inside].mean())
    print(f"{city:13s} {name:20s} crs={crs.to_epsg()} land_px={int(land.sum()):>8d} | IMPERV land={ml:5.1f}%  incl_water={ma:5.1f}%")
    return round(ml,1)

vals={}
for c in ["dc","atlanta","sandysprings","nyc"]:
    try: vals[c]=run(c)
    except Exception as e: print(f"{c}: ERROR {e}")
print("\nRESULT:",vals)
