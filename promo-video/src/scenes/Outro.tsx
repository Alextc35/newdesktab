import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from 'remotion';
import {BRAND,COPY} from '../config';
import {Background, Description, Pill} from '../components/Design';
import {fade,ramp} from '../animations/motion';

export const Outro: React.FC<{vertical?: boolean}> = ({vertical=false}) => {
  const f=useCurrentFrame();
  const [sloganStart,...sloganEnd]=BRAND.slogan.split('. ');
  return <AbsoluteFill>
    <Background vertical={vertical}/>
    <div style={{position:'absolute',left:0,right:0,top:vertical?370:165,textAlign:'center'}}>
      <div style={{opacity:fade(f,0,30),transform:`translateY(${(1-ramp(f))*25}px) scale(${.92+ramp(f)*.08})`}}>
        <Img src={staticFile('branding/brand-mark.svg')} style={{width:vertical?185:128,height:vertical?185:128,filter:'drop-shadow(0 12px 32px #2a9dfa25)'}}/>
      </div>
      <div style={{fontSize:vertical?91:80,letterSpacing:-4.5,fontWeight:600,marginTop:vertical?40:25,color:BRAND.text,opacity:fade(f,12,25),transform:`translateY(${(1-ramp(f,12))*22}px)`}}>{BRAND.name}</div>
      <div style={{fontSize:vertical?53:48,letterSpacing:-2,fontWeight:450,lineHeight:1.4,marginTop:vertical?30:17,opacity:fade(f,29,27)}}><span style={{color:BRAND.text}}>{sloganStart}.</span>{vertical?<br/>:' '}<span style={{color:BRAND.cyan}}>{sloganEnd.join('. ')}</span></div>
      <div style={{marginTop:vertical?88:51,opacity:fade(f,58,25),transform:`translateY(${(1-ramp(f,58))*18}px)`}}><Pill style={vertical?{fontSize:28,padding:'25px 36px'}:{}}>{BRAND.cta}</Pill></div>
      <Description delay={76} style={{fontSize:vertical?23:19,marginTop:vertical?36:26}}>{BRAND.url}</Description>
    </div>
    <div style={{position:'absolute',bottom:vertical?113:65,left:0,right:0,textAlign:'center',fontSize:vertical?20:14,letterSpacing:2,color:'#6b7f9b',opacity:fade(f,100,25)}}>{COPY.browserCompatibility}<span style={{padding:'0 20px',color:'#354661'}}>·</span>v{BRAND.version}</div>
  </AbsoluteFill>;
};
