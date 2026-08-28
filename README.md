# MeshDoctor v1.6.18

## What’s new in v1.6.18

- The user-defined camera box is now the **true visible capture area** and becomes locked after the first section is captured.
- The previous captured edge is shown as a **clearer ghost reference pinned directly to the capture grid**, making text and line alignment easier.
- High-resolution captures use **hidden left/right overscan margins** outside the visible box. Those margins are retained only to help registration, morphing, and seam blending.
- Auto Capture now uses a **local best-overlap / peak detection rule** instead of waiting for a single unrealistic match percentage.
- Final camera-mode stitching now applies a small **morph alignment plus wider feathered seam blend** before the final correction screen.
- The live camera and live progress image stay lightweight; high-quality source captures continue to be saved separately for final output.
- Manual Photos mode and Continue Last Project remain unchanged.
