"""Original no-person WebM fixture for exercising actual browser upload/inference."""
from pathlib import Path
import cv2
import numpy as np

root = Path(__file__).resolve().parents[1]
path = root / "data/fitness/no-person.webm"
writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"VP80"), 10, (640, 480))
if not writer.isOpened():
    raise RuntimeError("This OpenCV build has no VP8 encoder.")
for i in range(40):
    image = np.full((480, 640, 3), 90, np.uint8)
    for x in range(0, 640, 32):
        cv2.line(image, (x, 0), (x, 479), (150, 150, 150), 1)
    for y in range(0, 480, 32):
        cv2.line(image, (0, y), (639, y), (150, 150, 150), 1)
    cv2.rectangle(image, (i * 10, 100), (i * 10 + 30, 130), (170, 190, 160), -1)
    writer.write(image)
writer.release()
capture = cv2.VideoCapture(str(path))
assert int(capture.get(cv2.CAP_PROP_FRAME_COUNT)) == 40
capture.release()
print(f"Original no-person VP8 fixture written: {path}")
