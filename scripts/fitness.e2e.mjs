import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { demoPose } from '../app/fitness-demo.ts';

async function ready(page){
  await page.goto('/?gym=1');
  await expect(page.getByRole('button',{name:'Try synthetic demo',exact:true})).toBeEnabled();
}
async function demo(page){
  await page.getByRole('button',{name:'Try synthetic demo',exact:true}).click();
  await expect.poll(()=>page.locator('.fit-metrics strong').first().innerText(),{timeout:20000}).not.toMatch(/—|^0$/);
  await page.getByRole('button',{name:'Stop session',exact:true}).click();
}
test('complete practice flow, trace, preferences, review and export',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await ready(page);
  await expect(page).toHaveTitle('RepAnatomy');
  await expect(page.getByRole('button',{name:'Use camera',exact:true})).toBeDisabled();
  await demo(page);
  await expect(page.locator('.fit-metrics strong').nth(1)).not.toHaveText('0');
  await page.getByRole('button',{name:'My practice plan',exact:true}).click();
  if(!await page.locator('.session-details').getAttribute('open'))await page.getByText('Session measurements & diagnostics',{exact:true}).click();
  await expect(page.locator('.fit-trace')).toContainText('count rep');
  await page.getByRole('button',{name:'My practice plan',exact:true}).click();
  await page.getByLabel('Food preference').selectOption('vegan');
  await page.getByLabel('Practice days per week').selectOption('4');
  await page.getByLabel('soy',{exact:true}).check();
  await page.getByRole('button',{name:'Create my draft',exact:true}).click();
  await expect(page.locator('.fit-day')).toHaveCount(4);
  await expect(page.locator('.fit-meal-list')).not.toContainText(/tofu|yogurt|chicken/);
  await expect(page.getByRole('button',{name:'Export plan',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'I have reviewed this draft',exact:true}).click();
  const downloading=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export plan',exact:true}).click();
  expect((await downloading).suggestedFilename()).toBe('RepAnatomy-practice-plan.json');
  await mkdir('docs/opencv/evidence',{recursive:true});
  await page.screenshot({path:'docs/opencv/evidence/practice-plan.png',fullPage:true});
  await page.getByRole('button',{name:'Gym Studio',exact:true}).click();
  await page.screenshot({path:'docs/opencv/evidence/gym-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'My practice plan',exact:true}).click();
  if(!await page.locator('.session-details').getAttribute('open'))await page.getByText('Session measurements & diagnostics',{exact:true}).click();
  await page.screenshot({path:'docs/opencv/evidence/vision-trace.png',fullPage:true});
  await page.getByRole('button',{name:'Delete session',exact:true}).click();
  await expect(page.getByRole('button',{name:'Export trace',exact:true})).toBeDisabled();
  expect(errors).toEqual([]);
});
test('all exercise selections count in the labelled synthetic demonstration',async({page})=>{
  await ready(page);
  for(const id of ['squat','curl','pushup','press','lunge']){
    await page.getByLabel('Choose an exercise').selectOption(id);
    await demo(page);
    await expect(page.locator('.fit-metrics strong').nth(1)).not.toHaveText('0');
  }
});
test('camera initializes local WASM and the pose model; stopping releases camera',async({page,context})=>{
  await context.grantPermissions(['camera']);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const assets=[];page.on('response',response=>{if(response.url().includes('/pose/'))assets.push({url:response.url(),status:response.status()});});
  await ready(page);
  await page.locator('.fit-camera-card .fit-consent input').check();
  await page.getByRole('button',{name:'Use camera',exact:true}).click();
  await expect(page.locator('.fit-live-cue strong')).toHaveText('reframe',{timeout:60000});
  await expect(page.locator('.anatomy-legend')).toContainText('WAITING FOR MOVEMENT RECOGNITION');
  await expect(page.locator('.muscle-buttons')).toHaveCount(0);
  expect(assets.some(a=>a.url.endsWith('.task')&&a.status===200)).toBe(true);
  expect(assets.some(a=>a.url.endsWith('.wasm')&&a.status===200)).toBe(true);
  await page.getByRole('button',{name:'Stop session',exact:true}).click();
  expect(await page.locator('video').evaluate(v=>v.srcObject)).toBe(null);
  expect(errors).toEqual([]);
});
test('pain stops capture and blocks the plan, clinical review also gates a draft',async({page})=>{
  await ready(page);await page.getByRole('button',{name:'Try synthetic demo',exact:true}).click();
  await expect.poll(()=>page.locator('.fit-metrics strong').first().innerText()).not.toMatch(/—|^0$/);
  await page.getByRole('button',{name:'I feel pain or dizziness — stop coaching',exact:true}).click();
  await expect(page.locator('.fit-live-cue')).toContainText('Session stopped');
  await page.getByRole('button',{name:'My practice plan',exact:true}).click();
  await page.getByRole('button',{name:'Create my draft',exact:true}).click();
  await expect(page.locator('.fit-plan-result')).toContainText('A person should help with this.');
  await expect(page.locator('.fit-day')).toHaveCount(0);
});
test('mobile layouts keep controls reachable and fit within the viewport',async({page})=>{
  await page.setViewportSize({width:390,height:844});await ready(page);
  await demo(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await page.locator('.fit-main').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.locator('.fit-main').evaluate(el=>{el.scrollTop=0;});
  await page.screenshot({path:'docs/opencv/evidence/gym-mobile.png',fullPage:true});
  for(const tab of ['My practice plan']){
    await page.getByRole('button',{name:tab,exact:true}).click();
    expect(await page.locator('.fit-main').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  }
});
test('offline vision backend shows a useful error and disables capture',async({page})=>{
  await page.route('**/api/fitness/capabilities',route=>route.abort());
  await page.goto('/?gym=1');
  await expect(page.getByRole('alert')).toContainText('Vision service is offline');
  await expect(page.getByRole('button',{name:'Try synthetic demo',exact:true})).toBeDisabled();
});
test('uploaded video runs the pose model and releases its media on stop',async({page})=>{
  await ready(page);
  await page.locator('.fit-camera-card .fit-consent input').check();
  await page.getByLabel('Open exercise video',{exact:true}).setInputFiles('data/fitness/no-person.webm');
  await page.waitForFunction(()=>document.querySelector('.fit-error') || /reframe|steady camera/.test(document.querySelector('.fit-live-cue strong')?.textContent??''),{},{timeout:30000});
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.fit-live-cue strong')).toHaveText(/reframe|steady camera/,{timeout:40000});
  await expect(page.locator('.fit-camera-card .fit-card-top')).toContainText('VIDEO');
  // End-of-video also stops capture. Either end or the manual stop releases src.
  if(await page.getByRole('button',{name:'Stop session',exact:true}).count())await page.getByRole('button',{name:'Stop session',exact:true}).click();
  await expect.poll(()=>page.locator('video').getAttribute('src')).toBe(null);
});
test('BODY_25 observation import uses the selected exercise and frame geometry',async({page})=>{
  await ready(page);
  const image=await page.locator('.fit-stage canvas').evaluate(c=>c.toDataURL('image/jpeg',.8));
  const points=demoPose('squat',0), body=Array.from({length:75},()=>0);
  const mapping={11:5,12:2,13:6,14:3,15:7,16:4,23:12,24:9,25:13,26:10,27:14,28:11};
  for(const [destination,source] of Object.entries(mapping)){
    const p=points[Number(destination)];body.splice(source*3,3,p.x*640,p.y*480,p.visibility);
  }
  await page.locator('.fit-camera-card .fit-consent input').check();
  await page.getByRole('button',{name:'My practice plan',exact:true}).click();
  if(!await page.locator('.session-details').getAttribute('open'))await page.getByText('Session measurements & diagnostics',{exact:true}).click();
  await page.getByLabel('Import BODY_25 frame',{exact:true}).setInputFiles({name:'body25-frame.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({image,people:[{pose_keypoints_2d:body}]}))});
  await expect(page.locator('.fit-evidence-stats')).toContainText('body25');
  await expect(page.locator('.fit-trace')).toContainText('identify exercise');
});

test('integrated atlas responds to muscle selection without leaving the camera',async({page})=>{
  await ready(page);
  await expect(page.locator('.anatomy-loading')).toHaveCount(0,{timeout:60000});
  await page.getByLabel('Choose an exercise').selectOption('curl');
  const frame=page.frameLocator('iframe[title="Interactive muscle anatomy"]');
  await expect(frame.locator('.detail-sheet')).toContainText(/biceps/i,{timeout:30000});
  await expect(frame.locator('canvas')).toBeVisible();
  await expect(page.locator('.fit-stage canvas')).toBeVisible();
  await page.getByLabel('Choose an exercise').selectOption('press');
  await expect(frame.locator('.detail-sheet')).toContainText(/zone of deltoid/i);
  await page.screenshot({path:'docs/opencv/evidence/integrated-anatomy.png',fullPage:true});
});

test('goal coaching selects a supported exercise and set review receives measurements',async({page})=>{
  await ready(page);
  await page.getByLabel('Ask your coach').fill('I want to train shoulders');
  await page.getByRole('button',{name:'Send to coach',exact:true}).click();
  await expect(page.locator('.coach-coach')).toContainText('Shoulder press');
  await page.locator('.coach-suggestions').getByRole('button',{name:'Shoulder press',exact:true}).click();
  await expect(page.getByLabel('Choose an exercise')).toHaveValue('press');
  await demo(page);
  await expect(page.locator('.coach-coach').last()).toContainText('observed reps');
  await expect(page.locator('.joint-readings')).toContainText('elbow');
  await page.getByText('Rep-by-rep measurements',{exact:true}).click();
  await expect(page.locator('.angle-card')).toContainText('Rep 1');
  await page.locator('.training-bottom').scrollIntoViewIfNeeded();
  await page.screenshot({path:'docs/opencv/evidence/movement-coach.png',fullPage:true});
});

test('voice transcript reaches coach, spoken response works, and stop command releases capture',async({page})=>{
  await page.addInitScript(()=>{
    window.__spoken=[];window.__voiceText='I want to train biceps';
    Object.defineProperty(window,'speechSynthesis',{value:{cancel(){},speak(u){window.__spoken.push(u.text);}},configurable:true});
    window.SpeechRecognition=class{
      start(){queueMicrotask(()=>{this.onresult({results:[[{transcript:window.__voiceText}]]});this.onend();});}
      abort(){this.onend?.();}
    };
  });
  await ready(page);
  await page.getByRole('button',{name:'Voice off',exact:true}).click();
  await page.getByRole('button',{name:'Speak to coach',exact:true}).click();
  await expect(page.locator('.coach-coach')).toContainText('Biceps curl');
  await expect.poll(()=>page.evaluate(()=>window.__spoken.join(' '))).toContain('Biceps curl');
  await page.getByRole('button',{name:'Try synthetic demo',exact:true}).click();
  await page.evaluate(()=>{window.__voiceText='stop session';});
  await page.getByRole('button',{name:'Speak to coach',exact:true}).click();
  await expect(page.getByRole('button',{name:'Stop session',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Try synthetic demo',exact:true})).toBeEnabled();
});

test('daily history persists across reload and can be cleared; synthetic demos are excluded',async({page})=>{
  await ready(page);await demo(page);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('repanatomy.workouts.v1')||'[]'))).toHaveLength(0);
  await page.evaluate(()=>localStorage.setItem('repanatomy.workouts.v1',JSON.stringify([{id:'fixture',date:new Date().toLocaleDateString('en-CA'),exercise:'curl',source:'camera',reps:8,review:2,duration:24}])));
  await page.reload();await page.getByRole('button',{name:'My practice plan',exact:true}).click();
  await expect(page.locator('.daily-totals')).toContainText('8');
  await expect(page.locator('.daily-report li')).toContainText('8 reps · 2 to review');
  await page.getByRole('button',{name:'Clear saved history',exact:true}).click();
  await expect(page.locator('.daily-report li')).toHaveCount(0);
  expect(await page.evaluate(()=>localStorage.getItem('repanatomy.workouts.v1'))).toBe(null);
});
