import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {BRAND,FPS,MAIN_SCENES,VERTICAL_SCENES,TRANSITION,SceneSpec} from '../config';
import {fade} from '../animations/motion';
import {Intro} from '../scenes/Intro';
import {Feature} from '../scenes/Feature';
import {Beauty} from '../scenes/Beauty';
import {Outro} from '../scenes/Outro';
import {VerticalIntro,VerticalFeature} from '../scenes/Vertical';
import {Background,Brand} from '../components/Design';
import AUDIO_TIMELINE from '../audio-timeline.json';

const Crossfade: React.FC<{first: boolean;children: React.ReactNode}> = ({first,children}) => {
  const f=useCurrentFrame();
  return <AbsoluteFill style={{opacity:first?1:fade(f,0,TRANSITION)}}>{children}</AbsoluteFill>;
};

export const Promo: React.FC<{vertical?: boolean}> = ({vertical=false}) => {
  const scenes=vertical?VERTICAL_SCENES:MAIN_SCENES;
  const sound=vertical?AUDIO_TIMELINE.vertical:AUDIO_TIMELINE.main;
  const sceneElement=(scene: SceneSpec,i:number)=>{
    if(scene.id==='intro') return <Intro/>;
    if(scene.id==='beauty') return <Beauty/>;
    if(scene.id==='outro'||scene.id==='v-outro') return <Outro vertical={vertical}/>;
    if(scene.id==='v-intro') return <VerticalIntro/>;
    if(vertical) return <VerticalFeature scene={scene}/>;
    return <Feature scene={scene} index={String(Math.min(5,Math.floor(i/2)+1)).padStart(2,'0')}/>;
  };
  return <AbsoluteFill style={{fontFamily:'Manrope, Arial, sans-serif',color:BRAND.text,background:BRAND.ink}}>
    <style>{`@font-face{font-family:Manrope;src:url('${staticFile('assets/Manrope.ttf')}') format('truetype');font-weight:200 800;font-display:block}*{box-sizing:border-box}`}</style>
    <Background vertical={vertical}/>
    {scenes.map((scene,i)=><Sequence key={scene.id} name={scene.id} from={Math.round(scene.start*FPS)} durationInFrames={Math.round((scene.end-scene.start)*FPS)+(i<scenes.length-1?TRANSITION:0)}>
      <Crossfade first={i===0}>{sceneElement(scene,i)}</Crossfade>
    </Sequence>)}
    <Sequence durationInFrames={(vertical?21:50)*FPS}><Brand vertical={vertical}/></Sequence>
    <Audio src={staticFile(`audio/${sound.score}`)} volume={1}/>
    {sound.clicks.map(time=><Sequence key={time} from={Math.round(time*FPS)} durationInFrames={18}><Audio src={staticFile('audio/click.wav')} volume={sound.clickVolume}/></Sequence>)}
  </AbsoluteFill>;
};
