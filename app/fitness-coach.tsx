import { useEffect, useRef, useState } from 'react';
import { Mic, Send, Volume2 } from 'lucide-react';
import catalog from '../data/fitness/exercises.json';

interface Recognition {
  lang:string; continuous:boolean; interimResults:boolean;
  onresult:((event:{results:{[key:number]:{[key:number]:{transcript:string}}}})=>void)|null;
  onerror:((event:{error:string})=>void)|null; onend:(()=>void)|null;
  start:()=>void; abort:()=>void;
}
type VoiceWindow=Window & {SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};
export function speak(message:string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance=new SpeechSynthesisUtterance(message);
  utterance.rate=1; window.speechSynthesis.speak(utterance);
}

export default function FitnessCoach({sessionId, onExercise, onStop, onPain, cue, reps, active, planning=false, preferences}:{
  sessionId:string; onExercise:(id:string)=>void; onStop:()=>void; onPain:()=>void;
  cue:string; reps:number; active:boolean; planning?:boolean; preferences?:{days:number;diet:string;goal:string;restricted_foods:string[];needs_clinical_review:boolean};
}) {
  const [input,setInput]=useState(''),[busy,setBusy]=useState(false),[voice,setVoice]=useState(false),[listening,setListening]=useState(false);
  const [error,setError]=useState('');
  const [messages,setMessages]=useState<{role:string;text:string}[]>([]);
  const [suggestions,setSuggestions]=useState<string[]>([]),[provider,setProvider]=useState('');
  const wasActive=useRef(false);
  const requestVersion=useRef(0);
  const recognition=useRef<Recognition|null>(null),lastSpoken=useRef({cue:'',reps:0,time:0});
  const mounted=useRef(true),pending=useRef<AbortController|null>(null),busyRef=useRef(false);
  const voiceSupported=!!((window as VoiceWindow).SpeechRecognition||(window as VoiceWindow).webkitSpeechRecognition);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;recognition.current?.abort();pending.current?.abort();window.speechSynthesis?.cancel();};},[]);
  useEffect(()=>{
    if(!active||!voice||listening||busy)return;
    const previous=lastSpoken.current;
    if(reps>previous.reps){speak(`Rep ${reps}. ${cue}`);lastSpoken.current={cue,reps,time:Date.now()};}
    else if(cue&&cue!==previous.cue&&Date.now()-previous.time>8000){speak(cue);lastSpoken.current={cue,reps,time:Date.now()};}
  },[cue,reps,active,voice,listening,busy]);
  useEffect(()=>{lastSpoken.current={cue:'',reps:0,time:0};requestVersion.current++;pending.current?.abort();busyRef.current=false;setBusy(false);},[sessionId]);
  const send=async(text:string)=>{
    if(!text.trim()||busyRef.current)return;
    const command=text.trim().toLowerCase();
    if(/^(stop|stop session|pause|pause session)[.!]?$/.test(command)){onStop();setInput('');return;}
    if(/\b(pain|dizzy|dizziness|hurts)\b/.test(command)){onPain();setMessages(old=>[...old,{role:'coach',text:'Capture stopped. Do not continue while uncomfortable.'}]);setInput('');return;}
    const version=++requestVersion.current;
    busyRef.current=true;setBusy(true);setError('');setInput('');setMessages(old=>[...old.slice(-9),{role:'you',text}]);
    try{
      const controller=new AbortController();pending.current=controller;
      const response=await fetch('/api/fitness/coach',{method:'POST',headers:{'Content-Type':'application/json'},
        signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)]),body:JSON.stringify({message:text,...preferences?{preferences}:{},...sessionId?{session_id:sessionId}:{}})});
      const data=await response.json();
      if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:'Coach is unavailable. Try again.');
      if(!mounted.current||version!==requestVersion.current)return;
      setMessages(old=>[...old.slice(-9),{role:'coach',text:data.message}]);setSuggestions(data.recommendations);setProvider(data.provider);if(data.provider_error)setError(data.provider_error);
      if(voice)speak(data.message);
    }catch(cause){if(mounted.current&&version===requestVersion.current)setError(cause instanceof Error?cause.message:'Coach unavailable.');}
    finally{if(version===requestVersion.current){busyRef.current=false;if(mounted.current)setBusy(false);}}
  };
  useEffect(()=>{
    if(wasActive.current&&!active&&sessionId&&reps>0&&!planning)void send('Review my completed set using my recorded joint angles. Explain one observed form correction, or say when evidence is insufficient.');
    wasActive.current=active;
  },[active]);
  const listen=()=>{
    if(listening){recognition.current?.abort();return;}
    const Constructor=(window as VoiceWindow).SpeechRecognition||(window as VoiceWindow).webkitSpeechRecognition;
    if(!Constructor)return;
    window.speechSynthesis?.cancel();setError('');
    const instance=new Constructor();recognition.current=instance;instance.lang='en-IN';instance.continuous=false;instance.interimResults=false;
    instance.onresult=event=>{const text=event.results[0][0].transcript;setInput(text);void send(text);};
    instance.onerror=event=>setError(`Microphone: ${event.error}. You can type your message below.`);
    instance.onend=()=>setListening(false);
    try{instance.start();setListening(true);}catch{setError('Microphone could not start. Try typing instead.');}
  };
  return <section className="coach-card" aria-label="Movement coach">
    <div className="coach-heading"><div><span className="fit-caption">YOUR MOVEMENT COACH</span><h2>{planning?'Plan your next step.':'What would you like to train?'}</h2></div>
      <button aria-pressed={voice} onClick={()=>{setVoice(!voice);if(voice)window.speechSynthesis?.cancel();}}><Volume2 size={16}/>{voice?'Voice on':'Voice off'}</button></div>
    {!messages.length&&<p className="fit-muted">{planning?'Ask about your exercise schedule, meal ideas and food restrictions, or what to practice next.':'Try “I want to train my shoulders” or “Review the angles from my last set.”'}</p>}
    <div className="coach-messages" aria-live="polite">{messages.map((m,i)=><p key={i} className={`coach-${m.role}`}><strong>{m.role==='you'?'You':'Coach'}</strong>{m.text}</p>)}{busy&&<p role="status">Reviewing your observations…</p>}</div>
    {error&&<p role="alert" className="fit-error">{error}</p>}
    <form onSubmit={e=>{e.preventDefault();void send(input);}} className="coach-input"><input aria-label="Ask your coach" placeholder="Your goal, a question, or a form review…" maxLength={1200} value={input} onChange={e=>setInput(e.target.value)}/>
      <button type="button" aria-label={listening?'Stop listening':'Speak to coach'} disabled={!voiceSupported||busy} onClick={listen}><Mic size={18}/>{listening?'Listening…':''}</button><button className="fit-primary" aria-label="Send to coach" disabled={busy||!input.trim()}><Send size={18}/></button></form>
    <div className="coach-suggestions">{suggestions.map(id=><button key={id} disabled={active} onClick={()=>onExercise(id)}>{catalog.find(x=>x.id===id)?.name}</button>)}</div>
    <small className="fit-muted">{provider==='configured_ai'?'AI coach · ':provider?'Local coach · ':''}Questions and completed-set reviews send recent angle measurements to the configured AI service. Video does not. {voiceSupported?'Microphone uses your browser’s speech service; tap to speak.':'Speech input is unavailable in this browser; typing and spoken replies remain available.'}</small>
  </section>;
}

export interface DailySet {id:string;date:string;exercise:string;source:string;reps:number;review:number;duration:number}
export const dailyKey='repanatomy.workouts.v1';
export function readDaily():DailySet[]{
  try{const raw=JSON.parse(localStorage.getItem(dailyKey)||'[]');return Array.isArray(raw)?raw.filter(x=>x&&typeof x.id==='string'&&typeof x.date==='string'&&typeof x.reps==='number'&&Number.isFinite(x.reps)).slice(-100):[];}catch{return [];}
}
export function DailyReport(){
  const [sets,setSets]=useState(readDaily);
  const today=new Date().toLocaleDateString('en-CA');
  const rows=sets.filter(x=>x.date===today);
  return <section className="daily-report"><div><span className="fit-caption">TODAY · {today}</span><h2>Your practice, recorded.</h2><p className="fit-muted">Saved on this device. Synthetic demonstrations are excluded.</p></div>
    <div className="daily-totals"><strong>{rows.reduce((n,x)=>n+x.reps,0)}<small>observed reps</small></strong><strong>{rows.length}<small>sets</small></strong><strong>{rows.reduce((n,x)=>n+x.review,0)}<small>reps to review</small></strong></div>
    {rows.length?<ul>{rows.map(x=><li key={x.id}>{catalog.find(e=>e.id===x.exercise)?.name||x.exercise}<span>{x.reps} reps · {x.review} to review · {x.source==='video'?'video':'camera'}</span></li>)}</ul>:<p>No camera or video sets recorded today. Your first set will appear here.</p>}
    <button disabled={!sets.length} onClick={()=>{localStorage.removeItem(dailyKey);setSets([]);}}>Clear saved history</button>
  </section>;
}
