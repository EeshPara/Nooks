"""Preserve source artwork everywhere except feathered, art-directed motion regions."""
import argparse,json,subprocess
import numpy as np
from pathlib import Path
from PIL import Image,ImageDraw,ImageFilter
from pipeline import HERE,PUBLIC,JOBS,SPECS,save,source,validate
W,H=1280,720
OUTPUT=PUBLIC/'videos/nooks-animated-all'

def quantize_frame(composite,has_lights=False):
 # Light-only deltas are signed around an integer-valued source plate. Truncating
 # an arbitrarily small negative delta darkens a pixel by one full code value,
 # while an equal positive delta does nothing. Round signed light changes to
 # the nearest representable value; preserve existing non-light output bytes.
 if has_lights:composite=np.rint(composite)
 return np.clip(composite,0,255).astype(np.uint8)

def region_mask(regions):
 mask=Image.new('L',(W,H),0);draw=ImageDraw.Draw(mask)
 for region in regions:
  pts=region['points'];alpha=region['alpha']
  if region['kind']=='ellipse':draw.ellipse([round(v*(W/600 if i%2==0 else H/338)) for i,v in enumerate(pts)],fill=alpha)
  else:draw.polygon([(round(x*W/600),round(y*H/338)) for x,y in pts],fill=alpha)
 return mask.filter(ImageFilter.GaussianBlur(4))

def light_signal(frames,region,count,n):
 """AI-derived intensity only: never import a generated flame/fixture silhouette.

 Use the existing forward overlap, then smooth around the periodic boundary.
 No normalization to a minimum amplitude, synthesized oscillation or gain boost.
 """
 weights=np.asarray(region_mask([region]),dtype=np.float32)/255
 ys,xs=np.where(weights>0)
 if not len(xs):raise ValueError('Light region has no positive coverage')
 box=(slice(ys.min(),ys.max()+1),slice(xs.min(),xs.max()+1))
 crop_weights=weights[box];crop=frames[:count,box[0],box[1],:]
 luminance=np.einsum('nhwc,c->nhw',crop.astype(np.float32),[.2126,.7152,.0722])
 values=(luminance*crop_weights).sum(axis=(1,2))/crop_weights.sum()
 loop=values[n:count].copy()
 loop[-n:]=values[count-n:count]*(1-np.linspace(0,1,n))+values[:n]*np.linspace(0,1,n)
 baseline=float(loop.mean())
 relative=(loop-baseline)/max(baseline,1.)
 # 125 ms Gaussian smoothing removes abrupt AI flicker, including at the seam.
 offsets=np.arange(-9,10);kernel=np.exp(-.5*(offsets/3.)**2);kernel/=kernel.sum()
 smooth=sum(weight*np.roll(relative,int(offset)) for offset,weight in zip(offsets,kernel))
 modulation=.04*np.tanh(smooth/.04)
 modulation-=modulation.mean()
 modulation*=min(1.,.04/max(float(np.abs(modulation).max()),1e-12))
 evidence={'label':region['label'],'method':'original geometry with AI-derived luminance only',
  'sourceMeanLuminance':baseline,'sourceRelativeRange':float(np.ptp(relative)),
  'modulationRange':float(np.ptp(modulation)),'maxAbsoluteModulation':float(np.abs(modulation).max()),
  'maxFrameModulationStep':float(np.abs(modulation-np.roll(modulation,1)).max()),
  'smoothingSigmaFrames':3,'amplitudeCap':.04,'amplitudeFloor':None,
  'modulation':modulation.tolist()}
 return weights[:,:,None],modulation,evidence

def plates(name):
 p=JOBS/name;p.mkdir(parents=True,exist_ok=True)
 original=Image.open(source(name)).convert('RGB').resize((W,H),Image.Resampling.LANCZOS);original.save(p/'poster.png')
 mask=region_mask(SPECS[name][1]);mask.save(p/'motion-mask.png')
 # Human-readable red overlay; no generated video is published by this step.
 red=Image.new('RGB',(W,H),(255,38,38));Image.composite(red,original,mask.point(lambda x:min(x,130))).resize((600,338)).save(p/'mask-review.jpg')
 return p

def finish(name,crf=2,constant_qp=None):
 p=plates(name);raw=p/'generated.mp4'
 if not raw.exists():return
 duration=json.loads((p/'spec.json').read_text())['duration'];overlap=.5 if duration==4 else 1
 # Composite in one RGB color space. High-detail quiet scenes use CRF2 because
 # stronger I/P-frame quantization inflated the loop seam despite adjacent source frames.
 rawbytes=subprocess.check_output(['ffmpeg','-v','error','-i',str(raw),'-vf',f'scale={W}:{H},fps=24','-pix_fmt','rgb24','-f','rawvideo','-'])
 frames=np.frombuffer(rawbytes,dtype=np.uint8).reshape(-1,H,W,3)
 count=min(round(duration*24),len(frames));n=round(overlap*24)
 still=np.asarray(Image.open(p/'poster.png'),dtype=np.float32)
 regions=SPECS[name][1]
 light_regions=[r for r in regions if r.get('mode')=='light-only']
 if light_regions:
  mask=np.asarray(region_mask([r for r in regions if r.get('mode')!='light-only']),dtype=np.float32)[:,:,None]/255
 else:mask=np.asarray(Image.open(p/'motion-mask.png'),dtype=np.float32)[:,:,None]/255
 lights=[light_signal(frames,r,count,n) for r in light_regions]
 target=p/'finished.mp4'
 # Constant nonzero QP can avoid first-I-frame versus P/B-frame quantization
 # differences in almost-static scenes, without lossless High 4:4:4 profile.
 # Default CRF behavior stays byte-for-byte unchanged for existing candidates.
 if constant_qp is not None and not 1<=constant_qp<=51:raise ValueError('Constant QP must be 1..51')
 quality=['-crf',str(crf)] if constant_qp is None else ['-qp',str(constant_qp),'-x264-params','ipratio=1:pbratio=1']
 args=['ffmpeg','-y','-hide_banner','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r','24','-i','-','-an','-c:v','libx264','-threads','2','-preset','slow',*quality,'-pix_fmt','yuv420p','-movflags','+faststart',str(target)]
 proc=subprocess.Popen(args,stdin=subprocess.PIPE)
 try:
  for index in range(n,count):
   moving=frames[index].astype(np.float32)
   if index>=count-n:
    j=index-(count-n);alpha=j/(n-1)
    moving=moving*(1-alpha)+frames[j].astype(np.float32)*alpha
   composite=still*(1-mask)+moving*mask
   for light_mask,signal,_ in lights:
    composite+=still*light_mask*signal[index-n]
   frame=quantize_frame(composite,has_lights=bool(lights))
   proc.stdin.write(frame.tobytes())
  proc.stdin.close()
  if proc.wait():raise RuntimeError('ffmpeg encode failed')
 except BaseException:
  proc.kill();proc.wait();raise
 save(p/'finish-spec.json',{'method':'RGB static plate with geometry-masked forward overlap','durationSeconds':(count-n)/24,'fps':24,'crf':crf,'motionRegions':SPECS[name][1],'coordinateSpace':[600,338]})
 if constant_qp is not None:
  finish_spec=json.loads((p/'finish-spec.json').read_text());finish_spec.update(crf=None,constantQp=constant_qp,iToPQuantizerRatio=1,pToBQuantizerRatio=1);save(p/'finish-spec.json',finish_spec)
 if lights:save(p/'light-only-evidence.json',{'method':'Original artwork geometry; bounded periodic luminance modulation derived from existing Higgsfield frames. Other motion regions retain the original compositor.','regions':[evidence for _,_,evidence in lights]})
 print(name,'finished',target.stat().st_size,flush=True)
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('--ids',nargs='*');ap.add_argument('--masks-only',action='store_true');ap.add_argument('--crf',type=int,default=2);ap.add_argument('--constant-qp',type=int);args=ap.parse_args();validate()
 for name in args.ids or SPECS:
  if args.masks_only:plates(name)
  else:finish(name,args.crf,args.constant_qp)
