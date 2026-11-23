import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Background, Eyebrow, Lines} from '../components/Design';
import {ProductWindow} from '../components/ProductWindow';
import {ramp, fade} from '../animations/motion';
import {BRAND,COPY} from '../config';

export const Beauty: React.FC = () => {
  const f=useCurrentFrame();
  const p=ramp(f,0,90);
  return <AbsoluteFill>
    <Background/>
    <div style={{position:'absolute',top:138,width:'100%',textAlign:'center'}}>
      <Eyebrow>{COPY.beautyEyebrow}</Eyebrow>
      <Lines lines={COPY.beautyTitle} size={65} accentLast={false} style={{marginTop:17}}/>
    </div>
    <ProductWindow capture="overview.png" x={370} y={292-(p*7)} width={1180} style={{transform:`scale(${.98 + p*.02 + f*.00001})`,transformOrigin:'50% 70%'}}/>
    <div style={{position:'absolute',top:247,left:0,right:0,display:'flex',justifyContent:'center',gap:36,fontSize:16,color:BRAND.muted,opacity:fade(f,50,35)}}>
      {COPY.beautyValues.map((value,i)=><React.Fragment key={value}>{i>0&&<span style={{color:'#51647f'}}>·</span>}<span>{value}</span></React.Fragment>)}
    </div>
  </AbsoluteFill>;
};
