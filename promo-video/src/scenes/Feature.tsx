import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {SceneSpec} from '../config';
import {Background, CornerNote, Description, Eyebrow, Lines} from '../components/Design';
import {ProductWindow} from '../components/ProductWindow';

export const Feature: React.FC<{scene: SceneSpec; index: string}> = ({scene,index}) => {
  const f = useCurrentFrame();
  // A slow camera drift keeps held captures alive without hiding controls.
  const drift = scene.clip ? 0 : Math.sin(f/230)*5;
  if(scene.id==='drag'||scene.id==='resize') return <AbsoluteFill>
    <Background/>
    <div style={{position:'absolute',left:98,top:147}}>
      <Eyebrow>{scene.eyebrow}</Eyebrow>
      <Lines lines={[(scene.title??[]).join(' ')]} size={78} style={{marginTop:21}}/>
    </div>
    <Description style={{position:'absolute',right:126,top:176,fontSize:23,textAlign:'right'}}>{scene.description}</Description>
    <ProductWindow capture={scene.capture!} clip={scene.clip} x={166} y={328} width={1588} height={660}/>
  </AbsoluteFill>;
  return <AbsoluteFill>
    <Background/>
    <div style={{position:'absolute',left:98,top:262,width:410}}>
      <Eyebrow style={{fontSize:12.5,letterSpacing:2.15,maxWidth:400}}>{scene.eyebrow}</Eyebrow>
      <Lines lines={scene.title ?? []} size={scene.id === 'discover' ? 72 : 77} style={{marginTop:28}}/>
      <Description style={{marginTop:30}}>{scene.description}</Description>
    </div>
    <ProductWindow capture={scene.capture!} clip={scene.clip} x={543} y={144+drift} width={1285} zoom={scene.zoom} origin={scene.origin}/>
    <CornerNote index={index} label={scene.id==='discover'?'VISUAL BOOKMARKS':scene.id==='folder'?'FOLDERS':scene.id==='workspace'?'WORKSPACES':scene.id==='search'?'BOOKMARK SEARCH':'PERSONALIZATION'}/>
  </AbsoluteFill>;
};
