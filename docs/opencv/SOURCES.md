# References and evidence provenance

Sources were read during local preparation on October 26–27, 2026. Exercise summaries and meal examples are authored paraphrases; no instructional videos or third-party trainer source/model were copied into this project.

## Exercise guidance

- [ACE: Bodyweight squat](https://www.acefitness.org/resources/everyone/exercise-library/135/bodyweight-squat/) — controlled lower-body movement and comfortable range.
- [ACE: Push-up](https://www.acefitness.org/resources/everyone/exercise-library/41/push-up/) — supported upper-body push with maintained trunk alignment.
- [ACE: Bicep curl](https://www.acefitness.org/resources/everyone/exercise-library/70/bicep-curl/) — elbow movement with a steady trunk and upper arm.
- [ACE: Standing shoulder press](https://www.acefitness.org/resources/everyone/exercise-library/71/standing-shoulder-press/) — overhead press with trunk control. The reference describes a loaded variation; the prototype does not assess load or prescribe it.
- [ACE: Forward lunge](https://www.acefitness.org/resources/everyone/exercise-library/8/forward-lunge/) — stepping and controlled lowering. This reference includes a loaded variation; the prototype's beginner-facing cues do not recommend that load.

The catalog's muscle roles are anatomical expectations, not activation data, and its numerical thresholds are engineering choices rather than ACE-validated thresholds. The existing reference atlas supports learning anatomy; it is not an exercise-specific EMG dataset.

## Nutrition

[Harvard Nutrition Source: Healthy Eating Plate](https://nutritionsource.hsph.harvard.edu/healthy-eating-plate/) informs general variety, whole-grain and protein/vegetable meal ideas. The project does not reproduce its copyrighted plate image, prescribe amounts or calculate personalized nutrition. Food names and exclusion tags are authored examples. Cross-contact and individual needs need human checking.

## Vision and deployment

- [MediaPipe Pose Landmarker for web](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js) — video inference, returned normalized landmarks and worker considerations. Installed package type definitions additionally document the ES-module WASM loader option used here.
- [OpenCV Python installation guidance](https://docs.opencv.org/5.0/py_tutorials/py_setup/py_pip_install/py_pip_install.html) — choose exactly one wheel variant.
- [OpenCV headless package](https://pypi.org/project/opencv-python-headless/) — pinned 5.0.0.93 wheel; actual runtime verified separately.
- [AWS Fargate networking](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-task-networking.html) — task ENIs, network/security groups and load balancing.
- [CloudFormation ECS service](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-ecs-service.html) — declarative service configuration.
- [Competition overview](https://opencv26.devpost.com/) and [official rules](https://opencv26.devpost.com/rules) — current requirements; see checklist for pending evidence and conflicting displayed time/age text.

## Supplied reference projects

The supplied references were reviewed to understand their capabilities and integration formats. [BODY_25 output documentation](https://github.com/CMU-Perceptual-Computing-Lab/openpose/blob/master/doc/02_output.md) informed the interoperable keypoint mapping. The external pose executable is not installed or redistributed.

The supplied [fitness classification/counting project](https://github.com/RiccardoRiccio/Fitness-AI-Trainer-With-Automatic-Exercise-Recognition-and-Counting) describes a separate Streamlit/MediaPipe/BiLSTM system, trained assets and exercise-recognition results. Its source, videos, models and reported accuracy were not copied or presented as results of this prototype. This local implementation adds its own counting/controller, anatomy connection, browser input and tests. A full drop-in integration of that trained classifier is not claimed.

The main README uses RepAnatomy branding without the two supplied repository links. Third-party asset and model credits remain separate in `public/ATTRIBUTION.md` and this provenance record.
