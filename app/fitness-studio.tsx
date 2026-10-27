import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowUpRight, Camera, Check, ChevronRight, Download, Dumbbell, FileVideo, Leaf, Play, ShieldCheck, Square, X } from 'lucide-react';
import catalog from '../data/fitness/exercises.json';
import { drawDemo, drawSkeleton, type FitnessLandmark } from './fitness-demo';
import './fitness-studio.css';
import FitnessCoach, {DailyReport, dailyKey, readDaily} from './fitness-coach';

type Tab = 'train' | 'plan';
type Source = 'synthetic' | 'camera' | 'video' | 'body25';
interface Result {
  exercise:string; source:string; reps:number; accepted_reps:number; review_reps:number; frames:number; phase:string;
  action:string; message:string; stopped:boolean; opencv_version:string; latency_ms:number; next_capture_ms:number;
  recognition?:{status:string;candidate:string|null;agreement:number;locked:boolean;mode:string};
  rep_records?:{rep:number;duration_s:number;review:boolean;angle_ranges:Record<string,{min:number;max:number;range:number}>}[];
  angle_ranges?:Record<string,{min:number;max:number;range:number}>;
  metrics:{angles?:Record<string,number|null>;angle?:number; confidence?:number; side?:string; suggestion?:string};
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
async function request<T>(path:string, body?:unknown, method = body === undefined ? 'GET' : 'POST', signal?:AbortSignal):Promise<T> {
  const options:RequestInit={method,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)};
  if(body!==undefined){options.headers={'Content-Type':'application/json'};options.body=JSON.stringify(body);}
  const response = await fetch(API+path,options);
  if(!response.ok) { const error = await response.json().catch(()=>({})); throw new Error(typeof error.detail === 'string' ? error.detail : `Request failed (${response.status}). Check the backend and your input.`); }
  return response.status===204 ? undefined as T : response.json();
}
// Encode away from the synchronous preview/pose path. Only sampled frames are encoded.
async function frameImage(surface:HTMLCanvasElement):Promise<string> {
  const blob=await new Promise<Blob>((resolve,reject)=>surface.toBlob(value=>value?resolve(value):reject(new Error('Could not encode camera frame.')),'image/jpeg',.75));
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();reader.onload=()=>resolve(reader.result as string);reader.onerror=()=>reject(new Error('Could not read camera frame.'));reader.readAsDataURL(blob);
  });
}
function download(value:unknown, name:string) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export default function FitnessStudio() {
  const [tab,setTab]=useState<Tab>('train');
  const [exercise,setExercise]=useState('auto');
  const [chart,setChart]=useState<{time:number;angle:number|null}[]>([]);
  const atlasFrame=useRef<HTMLIFrameElement>(null);
  const [atlasReady,setAtlasReady]=useState(false);
  const [muscleQuery,setMuscleQuery]=useState('rectus femoris');
  const [running,setRunning]=useState(false), [starting,setStarting]=useState(false);
  const [preview,setPreview]=useState(false);
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
  const captureRequest=useRef<AbortController|null>(null);
  const pain=useRef(false), lastResult=useRef<Result|null>(null);
  const mainContent=useRef<HTMLDivElement>(null);
  useEffect(()=>{mainContent.current?.scrollTo({top:0});},[tab]);
  const selected=catalog.find(item=>item.id===(exercise==='auto'?(result?.exercise||'squat'):exercise))!;
  const targetKnown=exercise!=='auto'||source==='synthetic'||!!result?.recognition?.locked;
  const active=running||starting;
  const stop=() => {
    generation.current++;
    captureRequest.current?.abort();captureRequest.current=null;
    window.speechSynthesis?.cancel();
    if(timer.current) clearTimeout(timer.current);
    stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;
    worker.current?.terminate();worker.current=null;
    if(video.current){
      // Preserve the final preview when capture stops.
      if(video.current.readyState>=2&&canvas.current)canvas.current.getContext('2d')?.drawImage(video.current,0,0,canvas.current.width,canvas.current.height);
      video.current.pause();video.current.srcObject=null;video.current.removeAttribute('src');video.current.load();
    }
    if(videoUrl.current) URL.revokeObjectURL(videoUrl.current);videoUrl.current='';
    setRunning(false);setStarting(false);setPreview(false);
  };
  useEffect(()=>{
    request<{opencv_version:string}>('/capabilities').then(setCapability).catch(()=>setError('Vision service is offline. Start the Python backend, then reload this page.'));
    const target=canvas.current?.getContext('2d');if(target) drawDemo(target,'squat',0);
    return ()=>{
      generation.current++; if(timer.current)clearTimeout(timer.current);
      captureRequest.current?.abort();
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
  const workerCall=(message:unknown, signal:AbortSignal, transfer:Transferable[]=[])=>new Promise<{landmarks:FitnessLandmark[];people?:number}>((resolve,reject)=>{
    const instance=worker.current;
    if(!instance)return reject(new Error('Pose worker is not available.'));
    if(signal.aborted)return reject(signal.reason);
    const cleanup=()=>{clearTimeout(timeout);signal.removeEventListener('abort',abort);instance.onmessage=null;instance.onerror=null;};
    const abort=()=>{cleanup();reject(signal.reason);};
    const timeout=setTimeout(()=>{cleanup();reject(new Error('Pose processing timed out. Stop and restart.'));},25000);
    signal.addEventListener('abort',abort,{once:true});
    instance.onmessage=({data})=>{cleanup();if(data.error)reject(new Error(data.error));else resolve(data);};
    instance.onerror=()=>{cleanup();reject(new Error('Pose worker could not load. Run npm run prepare:pose.'));};
    instance.postMessage(message,transfer);
  });
  const start=async(nextSource:Source, file?:File)=>{
    stop();const run=++generation.current;
    const controller=new AbortController();captureRequest.current=controller;
    setStarting(true);setChart([]);setError('');setPlan(null);setApproved(false);setResult(null);lastResult.current=null;pain.current=false;setSource(nextSource);
    try {
      if(nextSource!=='synthetic'&&!consent)throw new Error('Confirm frame processing consent before using your camera or video.');
      if(session.current){await request('/sessions/'+session.current,undefined,'DELETE');session.current='';}
      const created=await request<{session_id:string}>('/sessions',{exercise:nextSource==='synthetic'&&exercise==='auto'?'squat':exercise,source:nextSource});
      if(run!==generation.current){await request('/sessions/'+created.session_id,undefined,'DELETE');return;}
      session.current=created.session_id;
      if(nextSource==='camera'||nextSource==='video') {
        if(!video.current)throw new Error('Video surface is unavailable.');
        if(nextSource==='camera') {
          const captured=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:30,max:30}},audio:false});
          if(run!==generation.current){captured.getTracks().forEach(track=>track.stop());return;}
          stream.current=captured;video.current.srcObject=captured;
        } else {videoUrl.current=URL.createObjectURL(file!);video.current.src=videoUrl.current;}
        // Show live camera playback immediately; uploaded videos wait for the model
        // so their first movement is still analyzed.
        await new Promise<void>((resolve,reject)=>{
          if(video.current!.readyState>=2)return resolve();
          video.current!.onloadeddata=()=>resolve();video.current!.onerror=()=>reject(new Error('This video format is unsupported by your browser. Try MP4 or WebM.'));
          setTimeout(()=>reject(new Error('Video did not load. Try another file.')),15000);
        });
        if(run!==generation.current)return;
        const media=video.current;
        const scale=Math.min(640/media.videoWidth,480/media.videoHeight,1);
        canvas.current!.width=Math.max(32,Math.round(media.videoWidth*scale));
        canvas.current!.height=Math.max(32,Math.round(media.videoHeight*scale));
        if(nextSource==='camera'){await media.play();if(run!==generation.current)return;setPreview(true);}
        worker.current=new Worker(new URL('./fitness-pose.worker.ts',import.meta.url),{type:'module'});
        const base=new URL(import.meta.env.BASE_URL,location.origin);
        await workerCall({type:'init',wasm:new URL('pose/wasm',base).href,model:new URL('pose/pose_landmarker_lite.task',base).href},controller.signal);
        if(run!==generation.current)return;
        if(nextSource==='video'){await media.play();if(run!==generation.current)return;setPreview(true);}
      }
      if(run!==generation.current)return;
      setStarting(false);setRunning(true);
      let frame=0,lastVideoTime=-1,nextSubmission=0,submissionInterval=200,submitting=false;
      const started=performance.now();
      // The visible video is composited by the browser at its native frame rate.
      // Pose detection and one bounded backend request run independently of it.
      const sample=document.createElement('canvas');
      const sampleContext=sample.getContext('2d')!;
      const fail=(cause:unknown)=>{if(run===generation.current){setError(cause instanceof Error?cause.message:String(cause));stop();}};
      const submit=async(surface:HTMLCanvasElement,landmarks:FitnessLandmark[],timestamp:number)=>{
        submitting=true;
        const submittedAt=performance.now();
        try{
          const image=await frameImage(surface);
          if(run!==generation.current)return;
          const response=await request<Result>('/sessions/'+created.session_id+'/frames',{
            image,landmarks,timestamp_ms:timestamp,pain:pain.current,
          },'POST',controller.signal);
          if(run!==generation.current)return;
          submissionInterval=Math.max(200,response.next_capture_ms);
          // Allow recovery time after a slow request as well as spacing captures;
          // the server's rate limit is measured from when it receives the frame.
          nextSubmission=Math.max(submittedAt+submissionInterval,performance.now()+100);
          setResult(response);lastResult.current=response;
          setChart(old=>[...old.slice(-79),{time:performance.now()-started,angle:['coach','correct_form','count_rep','review_rep'].includes(response.action)?response.metrics.angle??null:null}]);
          if(response.reps>0 && (nextSource==='camera'||nextSource==='video')){
            try {const records=readDaily().filter(x=>x.id!==created.session_id);records.push({id:created.session_id,date:new Date().toLocaleDateString('en-CA'),exercise:response.exercise,source:nextSource,reps:response.reps,review:response.review_reps,duration:Math.round((performance.now()-started)/1000)});localStorage.setItem(dailyKey,JSON.stringify(records.slice(-100)));}
            catch { /* Recording can be unavailable in private browsing. Capture remains usable. */ }
          }
          if(response.stopped)stop();
        }catch(cause){fail(cause);}
        finally{submitting=false;}
      };
      const tick=async()=>{
        if(run!==generation.current)return;
        const tickStarted=performance.now();
        try {
          const surface=canvas.current!, context=surface.getContext('2d')!;
          let landmarks:FitnessLandmark[]=[];
          let mediaTime=0;
          if(nextSource==='synthetic') {
            if(surface.width!==640||surface.height!==480){surface.width=640;surface.height=480;}
            landmarks=drawDemo(context,exercise==='auto'?'squat':exercise,frame++);
            await submit(surface,landmarks,(frame-1)*250);
          }
          else {
            const media=video.current!;
            if(media.ended){stop();return;}
            if(media.currentTime===lastVideoTime){timer.current=setTimeout(tick,100);return;}
            lastVideoTime=media.currentTime;mediaTime=media.currentTime*1000;
            const scale=Math.min(640/media.videoWidth,480/media.videoHeight,1);
            const width=Math.max(32,Math.round(media.videoWidth*scale)),height=Math.max(32,Math.round(media.videoHeight*scale));
            if(sample.width!==width||sample.height!==height){sample.width=width;sample.height=height;surface.width=width;surface.height=height;}
            sampleContext.drawImage(media,0,0,width,height);
            const timestamp=nextSource==='video'?mediaTime:performance.now()-started;
            const bitmap=await createImageBitmap(sample);
            if(run!==generation.current){bitmap.close();return;}
            const detection=await workerCall({type:'frame',bitmap,timestamp:performance.now()},controller.signal,[bitmap]);
            if(run!==generation.current)return;
            landmarks=detection.landmarks;
            // The overlay contains only landmarks, never a stale camera snapshot.
            context.clearRect(0,0,width,height);drawSkeleton(context,landmarks,width,height);
            const response=lastResult.current;
            if(response&&landmarks.length){
              context.font='bold 13px sans-serif';context.fillStyle='#fff7c4';
              for(const [name,index] of Object.entries({left_elbow:13,right_elbow:14,left_knee:25,right_knee:26,left_hip:23,right_hip:24})){
                const value=response.metrics.angles?.[name], point=landmarks[index];
                if(value!=null&&point?.visibility>=.6&&name.startsWith(response.metrics.side||'left'))context.fillText(`${Math.round(value)}°`,point.x*surface.width+8,point.y*surface.height-8);
              }
            }
            // Skip analysis samples while the backend is busy; never queue old frames.
            // Keep this unannotated so skeleton lines cannot inflate sharpness.
            if(!submitting&&performance.now()>=nextSubmission)void submit(sample,landmarks,timestamp);
          }
          if(run===generation.current)timer.current=setTimeout(tick,nextSource==='synthetic'?Math.max(0,nextSubmission-performance.now()):Math.max(0,100-(performance.now()-tickStarted)));
        }catch(cause){fail(cause);}
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
    try{if(session.current)await request('/sessions/'+session.current,undefined,'DELETE');session.current='';setResult(null);setChart([]);lastResult.current=null;setPlan(null);setApproved(false);setError('');}
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
    pain.current=true;stop();
    if(!session.current)return;setPlan(null);setApproved(false);
    try {
      const stopped=await request<Partial<Result>>('/sessions/'+session.current+'/stop',{});
      if(lastResult.current){const update={...lastResult.current,...stopped};setResult(update);lastResult.current=update;}
    } catch { setError('Capture stopped. The backend could not record your stop request. Do not resume while uncomfortable.'); }
  };
  useEffect(()=>{setMuscleQuery(targetKnown?selected.atlas_query:'');},[selected.atlas_query,targetKnown]);
  useEffect(()=>{
    const send=()=>atlasFrame.current?.contentWindow?.postMessage({type:'repanatomy:muscle',query:muscleQuery},location.origin);
    const ready=(event:MessageEvent)=>{if(event.origin===location.origin&&event.source===atlasFrame.current?.contentWindow&&event.data?.type==='repanatomy:atlas-ready'){setAtlasReady(true);send();}};
    window.addEventListener('message',ready);send();return()=>window.removeEventListener('message',ready);
  },[muscleQuery]);
  const changeExercise=(id:string)=>{setExercise(id);setResult(null);setChart([]);};
  return <main className="fitness-studio fitness-workspace">
    <header className="training-header"><a href="?gym=1" className="fit-brand"><span className="fit-mark">R</span><span>RepAnatomy<small>See your movement. Understand your body.</small></span></a>
      <nav aria-label="RepAnatomy workspace"><button aria-label="Gym Studio" aria-current={tab==='train'?'page':undefined} className={tab==='train'?'selected':''} onClick={()=>setTab('train')}><Dumbbell size={17}/>Train + anatomy</button><button aria-label="My practice plan" className={tab==='plan'?'selected':''} onClick={()=>{stop();setTab('plan');}}><Leaf size={17}/>My practice</button></nav>
      <span className="training-status"><span className={`fit-dot ${capability?'online':''}`}/>{capability?'Ready to move':'Service offline'}</span>
    </header>
    <div className="fit-main" ref={mainContent}>
      <div className="training-title"><div><span className="fit-caption">{tab==='train'?'YOUR BODY, IN MOTION':'PLAN · PRACTICE · REFLECT'}</span><h1>{tab==='train'?<>Make every rep <em>more intentional.</em></>:<>A little progress, <em>every day.</em></>}</h1></div><p>{tab==='train'?'Choose a movement or let us recognize it. Your camera, anatomy and coach stay together.':'Review your sets, shape your next session, and make a plan that fits.'}</p></div>
      {error&&<div className="fit-error" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={()=>setError('')}><X size={16}/></button></div>}
      <div className="training-space" hidden={tab!=='train'}>
        <div className="training-setup"><label>Movement<select aria-label="Choose an exercise" value={exercise} disabled={active} onChange={e=>changeExercise(e.target.value)}><option value="auto">Recognize my exercise</option>{catalog.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><span>{result?.recognition?.locked?`Recognized: ${selected.name}`:exercise==='auto'?'Five supported movements · choose manually if uncertain':selected.pattern} · side view</span></div>
        <div className="training-pair">
          <section className="fit-camera-card" aria-label="Movement capture">
            <div className="fit-card-top"><span><span className="fit-dot online"/>{active?'LIVE MOVEMENT':'YOUR CAMERA'}</span><span>{source==='synthetic'?'SYNTHETIC DEMO':source.toUpperCase()}</span></div>
            <div className={`fit-stage${preview?' fit-stage-live':''}`}><video ref={video} muted playsInline className="fit-source-video" aria-label="Live exercise video"/><canvas ref={canvas} width={640} height={480} aria-label="Exercise video and pose skeleton"/><span className="fit-stage-label">{exercise==='auto'&&!result?.recognition?.locked&&source!=='synthetic'?'Recognizing movement…':selected.name}</span>{starting&&<div className="fit-loading" role="status">Loading your camera and pose model…</div>}</div>
            <div className="fit-metrics"><div><strong>{result?.reps??'—'}</strong><span>Observed reps</span></div><div><strong>{result?.accepted_reps??'—'}</strong><span>Without form cues</span></div><div><strong>{result?.metrics.angle==null?'—':`${result.metrics.angle}°`}</strong><span>{selected.joint} angle</span></div><div><strong>{result?.phase.replaceAll('_',' ')??'ready'}</strong><span>Movement phase</span></div></div>
            <div className="fit-live-cue" role="status"><Activity size={18}/><div><strong>{result?result.action.replaceAll('_',' '):'Position yourself side-on.'}</strong><p>{result?.message??'Keep one person and the whole body visible. Begin slowly, in a comfortable range.'}</p></div></div>
            <div className="fit-capture-controls"><button className="fit-primary" onClick={()=>active?stop():start('camera')} disabled={!capability||(!active&&!consent)}>{active?<Square size={16}/>:<Camera size={16}/>} {active?'Stop session':'Use camera'}</button><label className={`fit-file-button ${active||!consent?'disabled':''}`}><FileVideo size={16}/>Open video<input aria-label="Open exercise video" type="file" accept="video/mp4,video/webm,video/quicktime" disabled={active||!consent||!capability} onChange={e=>{const file=e.target.files?.[0];if(file)void start('video',file);e.target.value='';}}/></label><button onClick={()=>start('synthetic')} disabled={active||!capability}><Play size={16}/>Try synthetic demo</button></div>
            <label className="fit-consent"><input type="checkbox" checked={consent} disabled={active} onChange={e=>setConsent(e.target.checked)}/><span>Analyze sampled frames on this app’s backend. Frames stay in memory and are not saved.</span></label>
            {active&&<button className="fit-pain" onClick={reportPain}>I feel pain or dizziness — stop coaching</button>}
          </section>
          <section className="training-anatomy" aria-label="Anatomy beside your camera"><div className="fit-card-top"><span>ANATOMY IN CONTEXT</span><a href={`?atlas=1&fitness-muscle=${encodeURIComponent(muscleQuery)}`} target="_blank" rel="noreferrer">Expand atlas <ArrowUpRight size={14}/></a></div>
            <div className="anatomy-frame"><iframe ref={atlasFrame} title="Interactive muscle anatomy" src="?atlas=1&embedded=1&fitness-muscle=rectus%20femoris"/>{!atlasReady&&<div className="anatomy-loading">Loading interactive anatomy…</div>}</div>
            <div className="anatomy-legend"><span className="fit-caption">{targetKnown?'EXPECTED PRIMARY TARGETS':'WAITING FOR MOVEMENT RECOGNITION'}</span>{targetKnown?<><div className="muscle-buttons">{selected.primary.map(m=><button key={m} onClick={()=>setMuscleQuery(m)}>{m}</button>)}</div><p>Supporting: {selected.secondary.join(' · ')}</p></>:<p>Targets appear after recognition. Choose your exercise manually if needed.</p>}<small>Highlight = selected anatomy, not measured activation. Tap a muscle to explore.</small></div>
          </section>
        </div>
        <div className="training-bottom"><FitnessCoach sessionId={session.current} onExercise={changeExercise} onStop={stop} onPain={reportPain} cue={result?.message||''} reps={result?.reps||0} active={active}/>
          <section className="angle-card"><span className="fit-caption">YOUR RANGE, OVER TIME</span><h2>Follow the movement.</h2><p className="fit-muted">{selected.joint} angle · 2D projection · degrees</p><svg viewBox="0 0 400 110" role="img" aria-label="Recent joint angle history"><path d="M0 10H400 M0 55H400 M0 100H400" stroke="#dedfce" fill="none"/><path fill="none" stroke="#61764b" strokeWidth="3" d={chart.map((p,i)=>p.angle===null?'':`${i===0||chart[i-1].angle===null?'M':'L'}${i*400/Math.max(1,chart.length-1)},${100-p.angle/180*90}`).join(' ')}/><text x="2" y="20" fontSize="10" fill="#65695b">180°</text><text x="2" y="98" fontSize="10" fill="#65695b">0°</text></svg><div className="joint-readings">{Object.entries(result?.metrics.angles||{}).filter(([name])=>name.startsWith(result?.metrics.side||'left')).map(([name,value])=><span key={name}>{name.replaceAll('_',' ')}<strong>{value==null?'not visible':`${value}°`}</strong></span>)}</div><details><summary>Rep-by-rep measurements</summary>{result?.rep_records?.length?result.rep_records.map(rep=><p key={rep.rep}>Rep {rep.rep} · {rep.duration_s}s · {rep.review?'review form':'no cues'} · {Object.entries(rep.angle_ranges).filter(([name])=>name===(result.metrics.side||'left')+'_'+selected.joint).map(([,v])=>`${v.min}–${v.max}°`)}</p>):<p>Complete a rep to record its duration and angle range.</p>}</details></section>
        </div>
      </div>
      {tab==='plan'&&<><DailyReport/><FitnessCoach planning preferences={{days,diet,goal,restricted_foods:restricted,needs_clinical_review:clinical}} sessionId={session.current} onExercise={id=>{changeExercise(id);setTab('train');}} onStop={stop} onPain={reportPain} cue={result?.message||''} reps={result?.reps||0} active={false}/></>}
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
      {tab==='plan'&&<details className="session-details"><summary>Session measurements & diagnostics</summary><section className="fit-evidence"><article className="fit-form-card"><span className="fit-caption">OBSERVABILITY</span><h2>Every cue has a reason.</h2><p>OpenCV measures sharpness, exposure and tracking consistency before projecting pose landmarks into pixel geometry. Poor evidence pauses rep counting and changes the next capture interval.</p><dl className="fit-evidence-stats"><div><dt>OpenCV runtime</dt><dd>{capability?.opencv_version??'Offline'}</dd></div><div><dt>Frames analyzed</dt><dd>{result?.frames??0}</dd></div><div><dt>Last processing time</dt><dd>{result?`${result.latency_ms} ms`:'—'}</dd></div><div><dt>Sharpness / exposure</dt><dd>{result?`${result.quality.sharpness} / ${result.quality.exposure}`:'—'}</dd></div><div><dt>Session source</dt><dd>{source}</dd></div></dl>
          <p className="fit-muted">The synthetic demo tests control flow and counting. It does not validate detection accuracy on people. Automatic recognition uses temporal geometry rules. It locks once recognized; select a movement manually when uncertain.</p>
          <div className="fit-plan-actions"><button disabled={!result} onClick={async()=>{try{download(await request('/sessions/'+session.current+'/telemetry'),'RepAnatomy-vision-trace.json');}catch{setError('Session expired. Start a new session to record measurements.');}}}><Download size={16}/>Export trace</button><button disabled={!result} onClick={clear}>Delete session</button></div>
          <label className="fit-file-button"><FileVideo size={16}/>Import BODY_25 frame<input type="file" accept="application/json,.json" aria-label="Import BODY_25 frame" disabled={active||!consent} onChange={e=>{const file=e.target.files?.[0];if(file)void importBody(file);e.target.value='';}}/></label><p className="fit-muted">Enable frame processing consent in Gym Studio. Import JSON with image (JPEG data URL) and people[0].pose_keypoints_2d (75 pixel-coordinate values).</p>
        </article><article className="fit-trace"><span className="fit-caption">PERCEPTION / DECISION / ACTION</span><h2>The session trace</h2>{!result?.trace.length&&<p className="fit-muted">Start a session to see the coaching loop.</p>}<ol>{result?.trace.map((entry,i)=><li key={i}><span className="fit-trace-index">{String(i+1).padStart(2,'0')}</span><div><small>Frame {entry.step} · {(entry.timestamp_ms/1000).toFixed(1)}s · {entry.tool}</small><strong>{entry.decision.replaceAll('_',' ')}</strong><p>{entry.reason}</p></div></li>)}</ol></article></section></details>}

      <footer className="fit-footer"><ShieldCheck size={15}/><p>Movement guidance from visible joints. Use a comfortable range; stop if uncomfortable. Recognition and form cues need real-world validation.</p></footer>
    </div>
  </main>;
}
