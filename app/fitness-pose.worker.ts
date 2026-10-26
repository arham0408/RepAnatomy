import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
let detector: PoseLandmarker | undefined;
self.onmessage = async ({data}) => {
  try {
    if (data.type === 'init') {
      const files = await FilesetResolver.forVisionTasks(data.wasm, true);
      detector = await PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: data.model, delegate: 'CPU' },
        runningMode: 'VIDEO', numPoses: 2,
        minPoseDetectionConfidence: .6, minPosePresenceConfidence: .6, minTrackingConfidence: .6,
      });
      self.postMessage({ready:true});
    } else {
      try {
        if (!detector) throw new Error('Pose model is not ready.');
        const result = detector.detectForVideo(data.bitmap, data.timestamp);
        // Ambiguous multi-person frames intentionally produce no coaching.
        const landmarks = result.landmarks.length === 1 ? result.landmarks[0].map(p => ({
          x:Math.max(0,Math.min(1,p.x)), y:Math.max(0,Math.min(1,p.y)), visibility:p.visibility ?? 0,
        })) : [];
        self.postMessage({landmarks, people:result.landmarks.length});
      } finally { data.bitmap.close(); }
    }
  } catch (error) { self.postMessage({error:error instanceof Error ? error.message : String(error)}); }
};
