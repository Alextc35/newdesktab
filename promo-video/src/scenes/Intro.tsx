import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from 'remotion';
import {BRAND,COPY} from '../config';
import {fade, ramp} from '../animations/motion';
import {Background, Eyebrow, Lines} from '../components/Design';
import {ProductWindow} from '../components/ProductWindow';

export const Intro: React.FC = () => {
  const f = useCurrentFrame();
  const reveal = ramp(f, 125, 80);
  return <AbsoluteFill>
    <Background/>
    <div style={{position:'absolute',left:156,top:222}}>
      <Eyebrow>{COPY.introEyebrow}</Eyebrow>
      <Lines lines={COPY.introTitle} size={104} delay={15} style={{marginTop:31}}/>
    </div>
    <div style={{opacity:fade(f,90,40),transform:`translateX(${(1-reveal)*90}px)`,position:'absolute',inset:0}}>
      <ProductWindow capture="plain.png" x={910} y={400} width={1110} style={{transform:`rotate(-5deg) translateY(${(1-reveal)*25}px)`,opacity: .25 + reveal*.75}}/>
      <ProductWindow capture="overview.png" x={910} y={400} width={1110} style={{transform:`rotate(-5deg) translateY(${(1-reveal)*25}px)`,opacity: reveal}}/>
    </div>
    <div style={{position:'absolute',left:159,top:622,display:'flex',alignItems:'center',gap:21,opacity:fade(f,72,32),transform:`translateY(${(1-ramp(f,72))*18}px)`}}>
      <Img src={staticFile('branding/brand-mark.svg')} style={{width:71,height:71}}/>
      <div style={{fontSize:34,letterSpacing:-1,fontWeight:600,color:BRAND.text}}>{BRAND.name}</div>
    </div>
    <div style={{position:'absolute',left:160,bottom:101,display:'flex',alignItems:'center',gap:14,opacity:fade(f,105,30)}}>
      <span style={{width:30,height:1,background:BRAND.cyan}}/><span style={{color:BRAND.muted,fontSize:17}}>{BRAND.slogan}</span>
    </div>
  </AbsoluteFill>;
};
