import React from 'react';
import {Freeze, Img, OffthreadVideo, staticFile, useCurrentFrame} from 'remotion';
import {BRAND,CLIPS,FPS} from '../config';
import {ramp} from '../animations/motion';

type Props = {
  capture: string;
  clip?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  zoom?: number;
  origin?: string;
  style?: React.CSSProperties;
  enter?: boolean;
};

// Only the thin presentation bezel is drawn here. The entire app surface is
// an unmodified screenshot/video of New DeskTab, never a reconstructed UI.
export const ProductWindow: React.FC<Props> = ({capture,clip,x=526,y=152,width=1304,height,zoom=1,origin='50% 50%',style,enter=true}) => {
  const f = useCurrentFrame();
  const p = enter ? ramp(f, 0, 65) : 1;
  const timing=clip?CLIPS[clip]:undefined;
  return <div style={{position:'absolute',left:x,top:y,width,borderRadius:19,overflow:'hidden',background:'#111924',border:'1px solid #b6d6f331',boxShadow:'0 38px 90px #0008, 0 0 0 7px #94b5db06',transform:`translateY(${(1-p)*34}px) scale(${.985 + p*.015})`,transformOrigin:'50% 50%',...style}}>
    <div style={{height:40,display:'flex',alignItems:'center',padding:'0 17px',gap:7,background:'linear-gradient(180deg,#1d293b,#172232)',borderBottom:'1px solid #b0c8df16'}}>
      {[0,1,2].map(n=><span key={n} style={{width:7,height:7,borderRadius:8,background:n===0?'#7c98b8':'#41516a'}}/>)}
      <div style={{display:'flex',alignItems:'center',gap:8,marginLeft:25,fontSize:12,color:'#b7c4d6'}}><Img src={staticFile('branding/brand-mark.svg')} style={{width:16,height:16}}/>{BRAND.name}</div>
      <span style={{marginLeft:'auto',fontSize:19,color:'#8395ad',lineHeight:1}}>＋</span>
    </div>
    <div style={{position:'relative',width:'100%',height:height ?? width*900/1440,overflow:'hidden',background:BRAND.ink}}>
      <div style={{width:'100%',height:'100%',transform:`scale(${zoom})`,transformOrigin:origin}}>
        {clip ? <Freeze frame={Math.min(f,Math.floor((timing?.seconds??5)*FPS/(timing?.speed??1))-3)}><OffthreadVideo muted playbackRate={timing?.speed??1} src={staticFile(`captures/${clip}`)} style={{width:'100%',height:'100%',objectFit:'cover'}}/></Freeze> : <Img src={staticFile(`captures/${capture}`)} style={{width:'100%',height:'100%',objectFit:'cover'}}/>}
      </div>
    </div>
  </div>;
};
