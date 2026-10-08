"""Regression checks for source-plate quantization across zero light modulation."""
import unittest
import numpy as np
from finish import quantize_frame

class LightQuantizationTests(unittest.TestCase):
 def test_sub_code_light_change_preserves_plate_on_both_sides_of_zero(self):
  plate=np.array([[[1.,32.,127.],[128.,192.,254.]]],dtype=np.float32)
  for delta in (-.49,-.001,0.,.001,.49):
   np.testing.assert_array_equal(quantize_frame(plate+delta,True),plate.astype(np.uint8))

 def test_resolvable_signed_changes_are_symmetric(self):
  plate=np.array([32.,128.,192.],dtype=np.float32)
  np.testing.assert_array_equal(quantize_frame(plate-.75,True),plate.astype(np.uint8)-1)
  np.testing.assert_array_equal(quantize_frame(plate+.75,True),plate.astype(np.uint8)+1)

 def test_bounds_and_non_light_byte_compatibility(self):
  pixels=np.array([-1.2,0.,12.9,128.1,254.9,256.],dtype=np.float32)
  np.testing.assert_array_equal(quantize_frame(pixels),np.clip(pixels,0,255).astype(np.uint8))
  np.testing.assert_array_equal(quantize_frame(pixels,True),[0,0,13,128,255,255])

if __name__=='__main__':unittest.main()
