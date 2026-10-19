# Media decoder fixtures

Original JPEG photographs from NASA/JSC, downloaded 2026-10-17 for local interface testing. They are never included in the production bundle or a production report.

| File | Original dimensions | NASA source |
| --- | --- | --- |
| landscape.jpg | 5568 × 3712 | https://images.nasa.gov/details/iss067e170237 |
| spacecraft.jpg | 5568 × 3712 | https://images.nasa.gov/details/iss073e0008524 |
| portrait.jpg | 2832 × 4256 | https://images.nasa.gov/details/iss036e006166 |

Sources: `https://images-assets.nasa.gov/image/<id>/<id>~orig.jpg`. These files have not been resized. [NASA media usage guidance](https://www.nasa.gov/nasa-brand-center/images-and-media/).

`playable.webm` is a synthetic four-second 1280 × 720, 24 fps VP9/Opus clip with a 440 Hz test tone, generated for playback/seek/pause tests:

```powershell
ffmpeg -f lavfi -i "testsrc2=size=1280x720:rate=24" -f lavfi -i "sine=frequency=440:sample_rate=48000" -t 4 -c:v libvpx-vp9 -b:v 600k -threads 2 -c:a libopus playable.webm
```

The browser suite serves the fixtures through intercepted API responses. It does not fetch NASA or production services during test execution.
