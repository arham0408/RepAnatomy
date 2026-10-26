// Original synthetic observations for an explicitly labelled engineering demo.
// These do not measure the accuracy of a pose detector on people.
export interface FitnessLandmark { x: number; y: number; visibility: number }
export const skeletonEdges = [[11,13],[13,15],[12,14],[14,16],[11,12],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];

export function demoPose(exercise: string, frame: number): FitnessLandmark[] {
  const angles = [170, 170, 140, 105, 55, 55, 105, 140, 170, 170];
  const angle = angles[frame % angles.length] * Math.PI / 180;
  const p = Array.from({length:33}, () => ({x:.5,y:.3,visibility:.98}));
  const put = (index:number, x:number, y:number) => { p[index] = {x:x/640,y:y/480,visibility:.98}; };
  for (const offset of [0,1]) {
    const dx = offset * 7;
    put(11+offset, 280+dx, 125); put(13+offset, 283+dx, 200); put(15+offset, 290+dx, 275);
    put(23+offset, 290+dx, 235); put(25+offset, 290+dx, 325); put(27+offset, 300+dx, 420);
    if (exercise === 'squat' || exercise === 'lunge') {
      put(27+offset, 290+dx+Math.sin(angle)*90, 325-Math.cos(angle)*90);
    } else if (exercise === 'curl') {
      put(15+offset, 283+dx+Math.sin(angle)*75, 200-Math.cos(angle)*75);
    } else if (exercise === 'press') {
      put(13+offset, 290+dx, 100);
      const a = Math.atan2(25,-10) + angle;
      put(15+offset, 290+dx+Math.cos(a)*70, 100+Math.sin(a)*70);
    } else if (exercise === 'pushup') {
      put(11+offset, 170+dx, 190); put(23+offset, 330+dx, 205);
      put(25+offset, 435+dx, 215); put(27+offset, 535+dx, 225);
      put(13+offset, 180+dx, 270);
      const a = Math.atan2(-80,-10) + angle;
      put(15+offset, 180+dx+Math.cos(a)*75, 270+Math.sin(a)*75);
    }
  }
  put(0, 278, 90);
  return p;
}

export function drawSkeleton(context: CanvasRenderingContext2D, points: FitnessLandmark[], width:number, height:number) {
  context.strokeStyle = '#c1e6a6'; context.lineWidth = 4; context.lineCap = 'round';
  for (const [a,b] of skeletonEdges) {
    if (!points[a] || !points[b] || points[a].visibility < .6 || points[b].visibility < .6) continue;
    context.beginPath(); context.moveTo(points[a].x*width,points[a].y*height);
    context.lineTo(points[b].x*width,points[b].y*height); context.stroke();
  }
  context.fillStyle = '#f7e6af';
  for (const index of [11,12,13,14,15,16,23,24,25,26,27,28]) {
    const point=points[index]; if (!point || point.visibility < .6) continue;
    context.beginPath(); context.arc(point.x*width, point.y*height, 4, 0, Math.PI*2); context.fill();
  }
}

export function drawDemo(context: CanvasRenderingContext2D, exercise: string, frame: number) {
  const points = demoPose(exercise, frame);
  context.fillStyle = '#20291f'; context.fillRect(0,0,640,480);
  context.strokeStyle = '#344332'; context.lineWidth = 1;
  for(let x=0;x<640;x+=32){ context.beginPath();context.moveTo(x,0);context.lineTo(x,480);context.stroke(); }
  for(let y=0;y<480;y+=32){ context.beginPath();context.moveTo(0,y);context.lineTo(640,y);context.stroke(); }
  context.fillStyle = '#c5cfbd'; context.font = '12px sans-serif';
  context.fillText('SYNTHETIC POSE · ENGINEERING DEMO', 22, 30);
  drawSkeleton(context, points, 640,480);
  return points;
}
