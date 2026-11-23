import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {BRAND,COPY,SceneSpec} from '../config';
import {Background, Description, Eyebrow, Lines} from '../components/Design';
import {ProductWindow} from '../components/ProductWindow';
import {ramp} from '../animations/motion';

export const VerticalIntro: React.FC = () => {
  const f=useCurrentFrame();
  return <AbsoluteFill>
    <Background vertical/>
    <div style={{position:'absolute',left:76,top:340,width:950}}>
      <Eyebrow style={{fontSize:20,letterSpacing:4}}>{COPY.verticalIntroEyebrow}</Eyebrow>
      <Lines lines={COPY.verticalIntroTitle} size={109} style={{marginTop:41}}/>
    </div>
    <ProductWindow capture="overview.png" x={80} y={920} width={1160} height={790} style={{transform:`rotate(-4deg) translateX(${-ramp(f,10,130)*60}px)`}}/>
  </AbsoluteFill>;
};

export const VerticalFeature: React.FC<{scene: SceneSpec}> = ({scene}) => {
  const f=useCurrentFrame();
  const folder=scene.id==='v-folder';
  return <AbsoluteFill>
    <Background vertical/>
    <div style={{position:'absolute',left:76,top:292,width:940}}>
      <Eyebrow style={{fontSize:19,letterSpacing:3}}>{scene.eyebrow}</Eyebrow>
      <Lines lines={scene.title!} size={97} style={{marginTop:29}}/>
      <Description style={{fontSize:29,marginTop:28}}>{scene.description}</Description>
    </div>
    <ProductWindow capture={scene.capture!} clip={scene.clip} x={64} y={folder?850:820} width={952} height={780} zoom={1} origin="50% 50%" style={{transform:`translateY(${Math.sin(f/190)*6}px)`}}/>
    <div style={{position:'absolute',bottom:112,left:76,fontSize:20,letterSpacing:2,color:'#758ca8'}}>{BRAND.slogan.toUpperCase()}</div>
  </AbsoluteFill>;
};
