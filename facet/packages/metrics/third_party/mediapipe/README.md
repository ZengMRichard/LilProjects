# Third-party: MediaPipe canonical face model

`canonical_face_model.obj` is copied unmodified from the MediaPipe project
(`mediapipe/modules/face_geometry/data/canonical_face_model.obj`), Copyright The MediaPipe
Authors, licensed under the Apache License 2.0.

`scripts/build_canonical.py` turns it into `canonical_face.json` (vertices, triangles, mirrored
vertex pairs, symmetry regions and skin zones) for the metrics library and the web app.
