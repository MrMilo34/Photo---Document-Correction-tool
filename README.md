# MeshDoctor v1.6.7

- Fixed the lower-left / outside panoramic guide handle interaction.
- The mirrored outside pink edge can now be dragged inward; its opposite edge mirrors automatically, so the capture window can be made very narrow for cylindrical labels.
- The inner points rescale with the edge so the guide does not fold or cross when narrowed.
- Camera overlap analysis now samples a tiny crop about seven times per second instead of copying and analyzing the full camera frame every animation frame, reducing live camera delay.
- Camera captures are cropped to the selected narrow guide area with a small safety margin before being added to Label Maker.
- Auto Capture still compares the previous right-edge strip with the current left-edge strip.

PWA cache key: `meshdoctor-v1.6.7`.
