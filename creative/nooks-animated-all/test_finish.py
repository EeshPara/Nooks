"""Geometry-safe lighting checks; no provider calls or candidate publication."""
import unittest
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
from finish import W,H,region_mask,light_signal
from specs import SPECS,light


class LightOnlyTests(unittest.TestCase):
 def test_default_mask_matches_original_compositor(self):
  for name,(_,regions) in SPECS.items():
   if any(r.get('mode')=='light-only' for r in regions):continue
   legacy=Image.new('L',(W,H),0);draw=ImageDraw.Draw(legacy)
   for r in regions:
    if r['kind']=='ellipse':draw.ellipse([round(v*(W/600 if i%2==0 else H/338)) for i,v in enumerate(r['points'])],fill=r['alpha'])
    else:draw.polygon([(round(x*W/600),round(y*H/338)) for x,y in r['points']],fill=r['alpha'])
   self.assertEqual(region_mask(regions).tobytes(),legacy.filter(ImageFilter.GaussianBlur(4)).tobytes(),name)

 def signal(self,values):
  frames=np.broadcast_to(np.asarray(values,dtype=np.uint8)[:,None,None,None],(96,H,W,3))
  return light_signal(frames,light((100,100,110,120),160,'test'),96,12)

 def test_constant_source_stays_still_without_artificial_motion_floor(self):
  _,signal,_=self.signal(np.full(96,80))
  self.assertLess(float(np.abs(signal).max()),1e-12)

 def test_abrupt_input_is_capped_and_periodically_smoothed(self):
  _,signal,evidence=self.signal(np.r_[np.full(48,30),np.full(48,220)])
  self.assertEqual(len(signal),84)
  self.assertLessEqual(float(np.abs(signal).max()),.04+1e-12)
  self.assertLess(abs(float(signal.mean())),1e-12)
  self.assertLess(abs(float(signal[-1]-signal[0])),.01)
  self.assertIsNone(evidence['amplitudeFloor'])

 def test_low_signal_is_not_amplified(self):
  _,signal,evidence=self.signal(np.r_[np.full(48,100),np.full(48,101)])
  self.assertGreater(float(np.ptp(signal)),0)
  self.assertLess(float(np.ptp(signal)),evidence['sourceRelativeRange'])


if __name__=='__main__':unittest.main()
