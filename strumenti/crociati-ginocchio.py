# Rifinitura grafica crociati: numpy e scipy; invocato dal wrapper .mjs.
# Mantiene le curve terminali interpolate e i centri delle inserzioni.
import json,sys,numpy as np
from scipy.ndimage import gaussian_filter1d
from scipy.interpolate import CubicSpline
D=json.load(open(sys.argv[1]));out={}
for name,nrings,ncomp in [('lca',51,2),('lcp',61,1)]:
 P=np.array(D[name]['pos']).reshape(-1,3);parts=[];faces=[];dirs=[];offset=0
 for part in range(ncomp):
  old=P[part*(nrings*20+2):(part+1)*(nrings*20+2)];rings=old[:-2].reshape(nrings,20,3);centers=rings.mean(1)
  t=np.linspace(0,1,nrings);u=np.linspace(0,1,101);theta=np.arange(20)*2*np.pi/20;angle=np.arange(64)*2*np.pi/64
  smooth=gaussian_filter1d(rings,3,axis=0,mode='nearest')
  sm=CubicSpline(t,smooth,axis=0)(u)
  sm+=(rings[0]-sm[0])[None,:,:]*(1-u[:,None,None])**6
  sm+=(rings[-1]-sm[-1])[None,:,:]*u[:,None,None]**6
  xyz=CubicSpline(np.r_[theta,2*np.pi],np.concatenate([sm,sm[:,:1]],axis=1),axis=1,bc_type='periodic')(angle)
  center=xyz.mean(1)
  tangent=np.gradient(center,axis=0);tangent/=np.linalg.norm(tangent,axis=1)[:,None]
  radial=xyz-center[:,None,:];radial/=np.linalg.norm(radial,axis=2)[:,:,None]
  relief=.005*np.sin(angle*12)[None,:]*np.sin(np.pi*u)[:,None]**2
  xyz+=radial*relief[:,:,None]
  verts=np.vstack([xyz.reshape(-1,3),old[-2:]])
  f=[]
  for i in range(100):
   for j in range(64):
    a0=i*64+j;b0=i*64+(j+1)%64;c0=(i+1)*64+j;d0=(i+1)*64+(j+1)%64
    f.extend([[a0,b0,c0],[b0,d0,c0]])
  for j in range(64):f.extend([[6464,(j+1)%64,j],[6465,6400+j,6400+(j+1)%64]])
  fd=np.repeat(tangent[:,None,:],64,axis=1).reshape(-1,3);fd=np.vstack([fd,tangent[0],tangent[-1]])
  parts.append(verts);faces.extend(np.array(f)+offset);dirs.append(fd);offset+=len(verts)
 out[name]={'pos':np.vstack(parts).ravel().tolist(),'idx':np.array(faces).ravel().tolist(),'fdir':np.round(np.vstack(dirs)*127).astype(int).ravel().tolist()}
json.dump(out,open(sys.argv[2],'w'))
