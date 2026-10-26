import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowLeft, ArrowUpRight, Camera, Check, ChevronRight, Download, Dumbbell, FileVideo, Leaf, Play, ShieldCheck, Square, X } from 'lucide-react';
import catalog from '../data/fitness/exercises.json';
import { drawDemo, drawSkeleton, type FitnessLandmark } from './fitness-demo';
import './fitness-studio.css';

type Tab = 'train' | 'plan' | 'evidence';
type Source = 'synthetic' | 'camera' | 'video' | 'body25';
interface Result {
  exercise:string; source:string; reps:number; accepted_reps:number; review_reps:number; frames:number; phase:string;
  action:string; message:string; stopped:boolean; opencv_version:string; latency_ms:number; next_capture_ms:number;
  metrics:{angle?:number; confidence?:number; side?:string; suggestion?:string};
  quality:{sharpness:number; exposure:number; tracking_error_px:number|null};
  trace:{step:number; timestamp_ms:number; tool:string; decision:string; reason:string}[];
}
interface Plan {
  status:string; reason:string; requires_approval:boolean;
  basis?:{accepted_reps:number;review_reps:number;latest_vision_action:string};
  schedule:{day:string;focus:string;exercises:string[];dose:string;minutes:number}[];
  rest_days?:string[]; meals:string[]; nutrition_note?:string; nutrition_source?:string;
}
const API = '/api/fitness';
async function request<T>(path:string, body?:unknown, method = body === undefined ? 'GET' : 'POST'):Promise<T> {
  const options:RequestInit={method,signal:AbortSignal.timeout(15000)};
  if(body!==undefined){options.headers={'Content-Type':'application/json'};options.body=JSON.stringify(body);}
  const response = await fetch(API+path,options);
  if(!response.ok) { const error = await response.json().catch(()=>({})); throw new Error(typeof error.detail === 'string' ? error.detail : `Request failed (${response.status}). Check the backend and your input.`); }
  return response.status===204 ? undefined as T : response.json();
}
function download(value:unknown, name:string) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export default function FitnessStudio() {
  const [tab,setTab]=useState<Tab>('train');
  const [exercise,setExercise]=useState('squat');
  const [running,setRunning]=useState(false), [starting,setStarting]=useState(false);
  const [consent,setConsent]=useState(false), [error,setError]=useState('');
  const [result,setResult]=useState<Result|null>(null), [plan,setPlan]=useState<Plan|null>(null);
  const [approved,setApproved]=useState(false), [busy,setBusy]=useState(false);
  const [source,setSource]=useState<Source>('synthetic');
  const [capability,setCapability]=useState<{opencv_version:string}|null>(null);
  const [diet,setDiet]=useState('vegetarian'), [days,setDays]=useState(3), [goal,setGoal]=useState('build_consistency');
  const [restricted,setRestricted]=useState<string[]>([]), [clinical,setClinical]=useState(false);
  const canvas=useRef<HTMLCanvasElement>(null), video=useRef<HTMLVideoElement>(null);
  const session=useRef(''), stream=useRef<MediaStream|null>(null), worker=useRef<Worker|null>(null);
  const generation=useRef(0), timer=useRef<ReturnType<typeof setTimeout>|null>(null), videoUrl=useRef('');
  const pain=useRef(false), lastResult=useRef<Result|null>(null);
  const mainContent=useRef<HTMLDivElement>(null);
  useEffect(()=>{mainContent.current?.scrollTo({top:0});},[tab]);
  const selected=catalog.find(item=>item.id===exercise)!;
  const active=running||starting;
  const stop=() => {
    generation.current++;
    if(timer.current) clearTimeout(timer.current);
    stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;
    worker.current?.terminate();worker.current=null;
    if(video.current){video.current.pause();video.current.srcObject=null;video.current.removeAttribute('src');video.current.load();}
    if(videoUrl.current) URL.revokeObjectURL(videoUrl.current);videoUrl.current='';
    setRunning(false);setStarting(false);
  };
  useEffect(()=>{
    request<{opencv_version:string}>('/capabilities').then(setCapability).catch(()=>setError('Vision service is offline. Start the Python backend, then reload this page.'));
    const target=canvas.current?.getContext('2d');if(target) drawDemo(target,'squat',0);
    return ()=>{
      generation.current++; if(timer.current)clearTimeout(timer.current);
      stream.current?.getTracks().forEach(track=>track.stop());worker.current?.terminate();
      if(videoUrl.current)URL.revokeObjectURL(videoUrl.current);
      if(session.current)fetch(API+'/sessions/'+session.current,{method:'DELETE',keepalive:true}).catch(()=>{});
    };
  },[]);
  useEffect(()=>{
    const hide=()=>{ if(document.hidden)stop(); };
    document.addEventListener('visibilitychange',hide);
    return ()=>document.removeEventListener('visibilitychange',hide);
  },[]);
  const workerCall=(message:unknown, transfer:Transferable[]=[])=>new Promise<{landmarks:FitnessLandmark[];people?:number}>((resolve,reject)=>{
    const instance=worker.current;
    if(!instance)return reject(new Error('Pose worker is not available.'));
    const timeout=setTimeout(()=>reject(new Error('Pose processing timed out. Stop and restart.')),25000);
    instance.onmessage=({data})=>{clearTimeout(timeout);if(data.error)reject(new Error(data.error));else resolve(data);};
    instance.onerror=()=>{clearTimeout(timeout);reject(new Error('Pose worker could not load. Run npm run prepare:pose.'));};
    instance.postMessage(message,transfer);
  });
  const start=async(nextSource:Source, file?:File, body25?:number[])=>{
    stop();const run=++generation.current;
    setStarting(true);setError('');setPlan(null);setApproved(false);setResult(null);lastResult.current=null;pain.current=false;setSource(nextSource);
    try {
      if(nextSource!=='synthetic'&&!consent)throw new Error('Confirm frame processing consent before using your camera or video.');
      if(session.current){await request('/sessions/'+session.current,undefined,'DELETE');session.current='';}
      const created=await request<{session_id:string}>('/sessions',{exercise,source:nextSource});
      if(run!==generation.current){await request('/sessions/'+created.session_id,undefined,'DELETE');return;}
      session.current=created.session_id;
      if(nextSource==='camera'||nextSource==='video') {
        if(!video.current)throw new Error('Video surface is unavailable.');
        if(nextSource==='camera') {
          const captured=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480}},audio:false});
          if(run!==generation.current){captured.getTracks().forEach(track=>track.stop());return;}
          stream.current=captured;video.current.srcObject=captured;
        } else {videoUrl.current=URL.createObjectURL(file!);video.current.src=videoUrl.current;}
        // Keep the source paused until model initialization is complete.
        await new Promise<void>((resolve,reject)=>{
          if(video.current!.readyState>=2)return resolve();
          video.current!.onloadeddata=()=>resolve();video.current!.onerror=()=>reject(new Error('This video format is unsupported by your browser. Try MP4 or WebM.'));
          setTimeout(()=>reject(new Error('Video did not load. Try another file.')),15000);
        });
        if(run!==generation.current)return;
        worker.current=new Worker(new URL('./fitness-pose.worker.ts',import.meta.url),{type:'module'});
        const base=new URL(import.meta.env.BASE_URL,location.origin);
        await workerCall({type:'init',wasm:new URL('pose/wasm',base).href,model:new URL('pose/pose_landmarker_lite.task',base).href});
        if(run!==generation.current)return;
        await video.current.play();
      }
      if(run!==generation.current)return;
      setStarting(false);setRunning(true);
      let frame=0,lastVideoTime=-1;
      const started=performance.now();
      const tick=async()=>{
        if(run!==generation.current)return;
        try {
          const surface=canvas.current!, context=surface.getContext('2d')!;
          let landmarks:FitnessLandmark[]=[], imported:number[]|undefined;
          if(nextSource==='synthetic') {surface.width=640;surface.height=480;landmarks=drawDemo(context,exercise,frame++);}
          else {
            const media=video.current!;
            if(media.ended){stop();return;}
            if(media.currentTime===lastVideoTime){timer.current=setTimeout(tick,100);return;}
            lastVideoTime=media.currentTime;
            const scale=Math.min(640/media.videoWidth,480/media.videoHeight,1);
            surface.width=Math.max(32,Math.round(media.videoWidth*scale));surface.height=Math.max(32,Math.round(media.videoHeight*scale));
            context.drawImage(media,0,0,surface.width,surface.height);
            const bitmap=await createImageBitmap(surface);
            const detection=await workerCall({type:'frame',bitmap,timestamp:performance.now()},[bitmap]);
            if(run!==generation.current)return;
            landmarks=detection.landmarks;
            if(nextSource==='body25')imported=body25;
          }
          // Submit the unannotated frame; skeleton lines must not inflate sharpness.
          const image=surface.toDataURL('image/jpeg',.75);
          if(nextSource!=='synthetic')drawSkeleton(context,landmarks,surface.width,surface.height);
          const response=await request<Result>('/sessions/'+session.current+'/frames',{
            image,landmarks:imported?[]:landmarks,...(imported?{body25:imported}:{}),timestamp_ms:performance.now()-started,pain:pain.current,
          });
          if(run!==generation.current)return;
          setResult(response);lastResult.current=response;
          if(response.stopped){stop();return;}
          timer.current=setTimeout(tick,Math.max(200,response.next_capture_ms));
        }catch(cause){if(run===generation.current){setError(cause instanceof Error?cause.message:String(cause));stop();}}
      };
      await tick();
    }catch(cause){if(run===generation.current){setError(cause instanceof Error?cause.message:String(cause));stop();}}
  };
  const createPlan=async()=>{
    if(running)stop();setBusy(true);setError('');setApproved(false);
    try{setPlan(await request<Plan>('/sessions/'+session.current+'/plan',{days,diet,goal,restricted_foods:restricted,needs_clinical_review:clinical}));}
    catch(cause){setError(cause instanceof Error?cause.message:String(cause));}
    finally{setBusy(false);}
  };
  const clear=async()=>{
    stop();setSource('synthetic');
    if(canvas.current){canvas.current.width=640;canvas.current.height=480;const ctx=canvas.current.getContext('2d');if(ctx)drawDemo(ctx,exercise,0);}
    try{if(session.current)await request('/sessions/'+session.current,undefined,'DELETE');session.current='';setResult(null);lastResult.current=null;setPlan(null);setApproved(false);setError('');}
    catch(cause){setError(String(cause));}
  };
  const importBody=async(file:File)=>{
    // A frame and its BODY_25 observations are imported together; no detector is claimed.
    try {
      const body=JSON.parse(await file.text());
      if(!body.image||!Array.isArray(body.people)||body.people.length!==1||body.people[0]?.pose_keypoints_2d?.length!==75)throw new Error('Expected one person, 75 BODY_25 values and a JPEG data URL in image.');
      stop();setError('');setPlan(null);setApproved(false);setSource('body25');setResult(null);setStarting(true);
      if(!consent)throw new Error('Confirm frame processing consent first.');
      if(session.current)await request('/sessions/'+session.current,undefined,'DELETE');
      session.current=(await request<{session_id:string}>('/sessions',{exercise,source:'body25'})).session_id;
      const response=await request<Result>('/sessions/'+session.current+'/frames',{image:body.image,body25:body.people[0].pose_keypoints_2d,timestamp_ms:0});
      setResult(response);lastResult.current=response;
      const img=new Image();img.onload=()=>{if(canvas.current){canvas.current.width=img.width;canvas.current.height=img.height;canvas.current.getContext('2d')?.drawImage(img,0,0);}};img.src=body.image;
    }catch(cause){setError(cause instanceof Error?cause.message:String(cause));}finally{setStarting(false);}
  };
  const reportPain=async()=>{
    pain.current=true;stop();setPlan(null);setApproved(false);
    try {
      const stopped=await request<Partial<Result>>('/sessions/'+session.current+'/stop',{});
      if(lastResult.current){const update={...lastResult.current,...stopped};setResult(update);lastResult.current=update;}
    } catch { setError('Capture stopped. The backend could not record your stop request. Do not resume while uncomfortable.'); }
  };
  return <main className="fitness-studio">
    <aside className="fit-sidebar">
      <a href="?gym=1" className="fit-brand"><span className="fit-mark">R</span><span>RepAnatomy<small>Movement, understood.</small></span></a>
      <span className="fit-caption">YOUR WORKSPACE</span>
      <nav aria-label="RepAnatomy workspace">
        <a href="?" className="fit-nav"><Activity size={19}/>Anatomy atlas<ArrowUpRight size={14}/></a>
        <button className={`fit-nav ${tab==='train'?'selected':''}`} aria-label="Gym Studio" aria-current={tab==='train'?'page':undefined} onClick={()=>setTab('train')}><Dumbbell size={19}/>Gym Studio<span className="fit-new" aria-hidden="true">NEW</span></button>
        <button className={`fit-nav ${tab==='plan'?'selected':''}`} onClick={()=>setTab('plan')}><Leaf size={19}/>My practice plan</button>
        <button className={`fit-nav ${tab==='evidence'?'selected':''}`} onClick={()=>setTab('evidence')}><ShieldCheck size={19}/>Vision evidence</button>
      </nav>
      <div className="fit-sidebar-note"><span className={`fit-dot ${capability?'online':''}`}/><span>{capability?`OpenCV ${capability.opencv_version}`:'Vision service offline'}<small>Frames stay in memory · 30 min expiry</small></span></div>
      <a className="fit-back" href="?"><ArrowLeft size={15}/>Back to anatomy</a>
    </aside>
    <div className="fit-main" ref={mainContent}>
      <header className="fit-top"><span><span className="fit-dot online"/> THE MOVEMENT WORKSPACE</span><a href="?demo=1">Report companion <ArrowUpRight size={14}/></a></header>
      <div className="fit-title"><div><span className="fit-caption">MOVE WITH A LITTLE MORE UNDERSTANDING</span><h1>{tab==='train'?<>Every rep.<br/><em>A little clearer.</em></>:tab==='plan'?<>A rhythm<br/><em>that fits you.</em></>:<>See what<br/><em>the system sees.</em></>}</h1></div><p>{tab==='train'?'Connect your movement to your anatomy. Practice with visual cues, follow your reps, and understand the muscles behind each exercise.':tab==='plan'?'A conservative practice draft shaped by your movement observations. Review it before you make it yours.':'Inspect the observations, decisions and actions behind each coaching cue. Export the trace to review your session.'}</p></div>
      {error&&<div className="fit-error" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={()=>setError('')}><X size={16}/></button></div>}
      <div className="fit-content" hidden={tab!=='train'}>
        <section className="fit-camera-card" aria-label="Movement capture">
          <div className="fit-card-top"><span><span className="fit-dot online"/>{active?'SESSION IN PROGRESS':'YOUR PRACTICE SPACE'}</span><span>{source==='synthetic'?'SYNTHETIC DEMO':source==='body25'?'IMPORTED OBSERVATION':source.toUpperCase()}</span></div>
          <div className="fit-stage"><canvas ref={canvas} width={640} height={480} aria-label="Exercise video and pose skeleton"/><video ref={video} muted playsInline className="fit-source-video"/><span className="fit-stage-label">{selected.name} · side view</span>{starting&&<div className="fit-loading" role="status">Preparing your session…</div>}</div>
          <div className="fit-metrics"><div><strong>{result?.reps??'—'}</strong><span>Observed reps</span></div><div><strong>{result?.accepted_reps??'—'}</strong><span>Without form cues</span></div><div><strong>{result?.metrics.angle===undefined?'—':`${result.metrics.angle}°`}</strong><span>{selected.joint} angle</span></div><div><strong>{result?.metrics.confidence===undefined?'—':`${Math.round(result.metrics.confidence*100)}%`}</strong><span>Joint visibility</span></div></div>
          <div className="fit-live-cue" role="status"><Activity size={18}/><div><strong>{result?result.action.replaceAll('_',' '):'Make room for good movement.'}</strong><p>{result?.message??'Place your camera to the side. Keep one person and all required joints in view.'}</p></div></div>
          <div className="fit-capture-controls">
            <button className="fit-primary" onClick={()=>active?stop():start('synthetic')} disabled={!capability}>{active?<Square size={16}/>:<Play size={16}/>} {active?'Stop session':'Try synthetic demo'}</button>
            <button onClick={()=>start('camera')} disabled={active||!consent||!capability}><Camera size={16}/>Use camera</button>
            <label className={`fit-file-button ${active||!consent?'disabled':''}`}><FileVideo size={16}/>Open video<input aria-label="Open exercise video" type="file" accept="video/mp4,video/webm,video/quicktime" disabled={active||!consent||!capability} onChange={e=>{const file=e.target.files?.[0];if(file)void start('video',file);e.target.value='';}}/></label>
          </div>
          <label className="fit-consent"><input type="checkbox" checked={consent} disabled={active} onChange={e=>setConsent(e.target.checked)}/><span>I agree to send sampled camera or video frames to this app’s backend for analysis. Frames are not saved to disk.</span></label>
          {active&&<button className="fit-pain" onClick={reportPain}>I feel pain or dizziness — stop coaching</button>}
          {!active&&result&&<button className="fit-text-link" onClick={()=>setTab('plan')}>Build a practice draft from this session <ChevronRight size={15}/></button>}
        </section>
        <aside className="fit-exercise-card">
          <span className="fit-caption">TODAY’S MOVEMENT</span><h2>Start with<br/><em>the fundamentals.</em></h2>
          <label className="fit-label">Choose an exercise<select value={exercise} disabled={active} onChange={e=>{setExercise(e.target.value);void clear();const ctx=canvas.current?.getContext('2d');if(ctx)drawDemo(ctx,e.target.value,0);}}>{catalog.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <div className="fit-tags"><span>{selected.pattern}</span><span>Side camera</span><span>2D estimate</span></div>
          <h3>Muscles behind the movement</h3><p className="fit-muted">Expected roles from exercise anatomy. Camera video does not measure activation.</p>
          <span className="fit-caption">PRIMARY TARGETS</span><div className="fit-muscles">{selected.primary.map(m=><span key={m}><span/>{m}</span>)}</div>
          <span className="fit-caption">SUPPORTING MUSCLES</span><p className="fit-secondary-muscles">{selected.secondary.join(' · ')}</p>
          <a className="fit-anatomy-link" href={`?fitness-muscle=${encodeURIComponent(selected.atlas_query)}`}><Activity size={23}/><span>Meet the muscle<small>Explore it in the 3D atlas</small></span><ArrowUpRight size={18}/></a>
          <details><summary>What this exercise emphasizes less</summary><p className="fit-muted">{[...new Set(catalog.flatMap(item=>item.primary))].filter(m=>!([...selected.primary,...selected.secondary] as string[]).includes(m)).join(' · ')}. These are not primary targets here; this does not mean they are inactive.</p></details>
          <h3>Keep in mind</h3><ol className="fit-cues">{selected.cues.map(cue=><li key={cue}>{cue}</li>)}</ol>
          <a className="fit-source" href={selected.source} target="_blank" rel="noreferrer">Read the exercise reference <ArrowUpRight size={13}/></a>
        </aside>
      </div>
      {tab==='plan'&&<section className="fit-plan-layout">
        <article className="fit-form-card"><span className="fit-caption">YOUR PREFERENCES</span><h2>Make space for practice.</h2>
          <label className="fit-label">Your goal<select value={goal} onChange={e=>{setGoal(e.target.value);setPlan(null);setApproved(false);}}><option value="build_consistency">Build consistency</option><option value="strength">Strength practice</option><option value="general_fitness">General fitness</option></select></label>
          <label className="fit-label">Practice days per week<select value={days} onChange={e=>{setDays(Number(e.target.value));setPlan(null);setApproved(false);}}>{[2,3,4].map(n=><option key={n} value={n}>{n} days</option>)}</select></label>
          <label className="fit-label">Food preference<select value={diet} onChange={e=>{setDiet(e.target.value);setPlan(null);setApproved(false);}}><option value="vegetarian">Vegetarian</option><option value="vegan">Vegan</option><option value="omnivore">Omnivore</option></select></label>
          <fieldset><legend>Exclude ingredients</legend><div className="fit-restrictions">{['dairy','soy','gluten','nuts','eggs','legumes','fish'].map(food=><label key={food}><input type="checkbox" checked={restricted.includes(food)} onChange={e=>{setRestricted(old=>e.target.checked?[...old,food]:old.filter(x=>x!==food));setPlan(null);setApproved(false);}}/>{food}</label>)}</div></fieldset>
          <label className="fit-consent"><input type="checkbox" checked={clinical} onChange={e=>{setClinical(e.target.checked);setPlan(null);setApproved(false);}}/><span>I have a medical condition, injury, pregnancy, an eating disorder, or need individual clinical nutrition advice.</span></label>
          <button className="fit-primary" onClick={createPlan} disabled={busy||!result||result.frames<3}>{busy?'Preparing…':'Create my draft'}<ChevronRight size={16}/></button>
          {!result&&<p className="fit-muted">Run a session first so visual evidence can shape your draft.</p>}
        </article>
        <article className="fit-plan-result"><span className="fit-caption">EVIDENCE → DECISION → YOUR REVIEW</span><h2>{plan?plan.status==='human_review'?'A person should help with this.':approved?'Your reviewed practice draft.':'A draft, for your review.':'Your next step starts with a rep.'}</h2><p>{plan?.reason??'Your session observations decide whether this draft focuses on technique review or conservative practice. Meal ideas reflect your food preferences.'}</p>
          {plan?.basis&&<div className="fit-tags"><span>{plan.basis.accepted_reps} reps without cues</span><span>{plan.basis.review_reps} reps to review</span><span>{plan.basis.latest_vision_action.replaceAll('_',' ')}</span></div>}
          {plan?.schedule.map(day=><div className="fit-day" key={day.day}><strong>{day.day}<small>{day.minutes} min</small></strong><div><h3>{day.focus}</h3><p>{day.exercises.map(id=>catalog.find(e=>e.id===id)?.name).join(' · ')}</p><small>{day.dose}</small></div></div>)}
          {plan?.rest_days&&<p className="fit-muted">Recovery or gentle activity: {plan.rest_days.join(', ')}.</p>}
          {!!plan?.meals.length&&<><h3>A few meal ideas</h3><ul className="fit-meal-list">{plan.meals.map(meal=><li key={meal}><Leaf size={16}/>{meal}</li>)}</ul><p className="fit-muted">{plan.nutrition_note}</p><a className="fit-source" href={plan.nutrition_source} target="_blank" rel="noreferrer">Balanced eating reference <ArrowUpRight size={13}/></a></>}
          {plan?.status==='draft'&&<div className="fit-plan-actions"><button className="fit-primary" disabled={approved} onClick={()=>setApproved(true)}><Check size={16}/>{approved?'Reviewed by me':'I have reviewed this draft'}</button><button disabled={!approved} onClick={()=>download({...plan,reviewed_by_user:true},'RepAnatomy-practice-plan.json')}><Download size={16}/>Export plan</button></div>}
        </article>
      </section>}
      {tab==='evidence'&&<section className="fit-evidence"><article className="fit-form-card"><span className="fit-caption">OBSERVABILITY</span><h2>Every cue has a reason.</h2><p>OpenCV measures sharpness, exposure and tracking consistency before projecting pose landmarks into pixel geometry. Poor evidence pauses rep counting and changes the next capture interval.</p><dl className="fit-evidence-stats"><div><dt>OpenCV runtime</dt><dd>{capability?.opencv_version??'Offline'}</dd></div><div><dt>Frames analyzed</dt><dd>{result?.frames??0}</dd></div><div><dt>Last processing time</dt><dd>{result?`${result.latency_ms} ms`:'—'}</dd></div><div><dt>Sharpness / exposure</dt><dd>{result?`${result.quality.sharpness} / ${result.quality.exposure}`:'—'}</dd></div><div><dt>Session source</dt><dd>{source}</dd></div></dl>
          <p className="fit-muted">The synthetic demo tests control flow and counting. It does not validate detection accuracy on people. Exercise suggestions are heuristic and never switch your exercise automatically.</p>
          <div className="fit-plan-actions"><button disabled={!result} onClick={()=>download(lastResult.current,'RepAnatomy-vision-trace.json')}><Download size={16}/>Export trace</button><button disabled={!result} onClick={clear}>Delete session</button></div>
          <label className="fit-file-button"><FileVideo size={16}/>Import BODY_25 frame<input type="file" accept="application/json,.json" aria-label="Import BODY_25 frame" disabled={active||!consent} onChange={e=>{const file=e.target.files?.[0];if(file)void importBody(file);e.target.value='';}}/></label><p className="fit-muted">Enable frame processing consent in Gym Studio. Import JSON with image (JPEG data URL) and people[0].pose_keypoints_2d (75 pixel-coordinate values).</p>
        </article><article className="fit-trace"><span className="fit-caption">PERCEPTION / DECISION / ACTION</span><h2>The session trace</h2>{!result?.trace.length&&<p className="fit-muted">Start a session to see the coaching loop.</p>}<ol>{result?.trace.map((entry,i)=><li key={i}><span className="fit-trace-index">{String(i+1).padStart(2,'0')}</span><div><small>Frame {entry.step} · {(entry.timestamp_ms/1000).toFixed(1)}s · {entry.tool}</small><strong>{entry.decision.replaceAll('_',' ')}</strong><p>{entry.reason}</p></div></li>)}</ol></article></section>}
      <footer className="fit-footer"><ShieldCheck size={15}/><p>Educational movement feedback. 2D cues can miss depth, load and pain. Stop if uncomfortable and use a qualified trainer for technique review.</p><a href="?">Explore anatomy <ArrowUpRight size={13}/></a></footer>
    </div>
  </main>;
}
