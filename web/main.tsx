import {createRoot} from 'react-dom/client';
import {lazy, Suspense} from 'react';
import '../app/globals.css';
import '../app/studio-design.css';
import { startPwa } from '../app/pwa';
const Home=lazy(()=>import('../app/page'));
import VoiceCompanion from '../app/voice-companion';
const FitnessStudio=lazy(()=>import('../app/fitness-studio'));
startPwa();
createRoot(document.getElementById('root')!).render(<Suspense fallback={<p role="status" style={{padding:32}}>Preparing RepAnatomy…</p>}>
  {new URLSearchParams(location.search).has('gym') ? <FitnessStudio /> :
  new URLSearchParams(location.search).has('companion') ? <VoiceCompanion companion /> : <Home/>}
</Suspense>
);
