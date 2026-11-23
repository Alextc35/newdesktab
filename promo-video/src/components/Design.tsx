import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from 'remotion';
import {BRAND} from '../config';
import {fade, ramp} from '../animations/motion';

export const Background: React.FC<{vertical?: boolean}> = ({vertical = false}) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{background: BRAND.ink, overflow: 'hidden'}}>
    <AbsoluteFill style={{background: `radial-gradient(ellipse at ${72 + Math.sin(f / 360) * 5}% 36%, #17375255 0%, transparent 55%), radial-gradient(ellipse at 9% 100%, #30234b44, transparent 48%)`}}/>
    <AbsoluteFill style={{opacity: .16, backgroundImage: 'linear-gradient(#8ca2c514 1px, transparent 1px), linear-gradient(90deg, #8ca2c514 1px, transparent 1px)', backgroundSize: vertical ? '108px 108px' : '96px 96px', maskImage: 'linear-gradient(130deg, black, transparent 75%)'}}/>
    <div style={{position:'absolute', width: vertical ? 840 : 1440, height: vertical ? 840 : 1440, border: '1px solid #8acde611', borderRadius: '50%', left: vertical ? 300 : 800, top: vertical ? 700 : -300, transform: `translateY(${Math.sin(f / 240) * 12}px)`}}/>
  </AbsoluteFill>;
};

export const Brand: React.FC<{vertical?: boolean}> = ({vertical}) =>
  <div style={{position: 'absolute', zIndex:20, left: vertical ? 76 : 96, top: vertical ? 88 : 54, display: 'flex', alignItems: 'center', gap: 16, color: BRAND.text}}>
    <Img src={staticFile('branding/brand-mark.svg')} style={{width: 41, height: 41}}/>
    <span style={{fontSize: 25, fontWeight: 650, letterSpacing: -.8}}>{BRAND.name}</span>
  </div>;

export const Eyebrow: React.FC<{children: React.ReactNode; delay?: number; style?: React.CSSProperties}> = ({children, delay = 7, style}) => {
  const f = useCurrentFrame();
  return <div style={{fontSize: 15, letterSpacing: 3.5, fontWeight: 650, color: BRAND.cyan, opacity: fade(f, delay), transform: `translateY(${(1-ramp(f, delay))*14}px)`, ...style}}>{children}</div>;
};

export const Lines: React.FC<{lines: string[]; size?: number; delay?: number; accentLast?: boolean; style?: React.CSSProperties}> = ({lines, size = 76, delay = 13, accentLast = true, style}) => {
  const f = useCurrentFrame();
  return <div style={{fontSize: size, lineHeight: 1.065, letterSpacing: -size * .055, fontWeight: 570, ...style}}>
    {lines.map((line, i) => <div key={line} style={{paddingBottom: 8, opacity: fade(f, delay + i * 7, 22), transform: `translateY(${(1-ramp(f, delay+i*7, 46))*35}px)`, color: accentLast && i === lines.length - 1 ? BRAND.cyan : BRAND.text}}>{line}</div>)}
  </div>;
};

export const Description: React.FC<{children: React.ReactNode; delay?: number; style?: React.CSSProperties}> = ({children, delay = 36, style}) => {
  const f = useCurrentFrame();
  return <div style={{fontSize: 23, lineHeight: 1.65, color: BRAND.muted, whiteSpace: 'pre-line', letterSpacing: -.3, opacity: fade(f, delay), transform: `translateY(${(1-ramp(f, delay))*14}px)`, ...style}}>{children}</div>;
};

export const Arrow = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;

export const Pill: React.FC<{children: React.ReactNode; style?: React.CSSProperties}> = ({children, style}) =>
  <div style={{display:'inline-flex',alignItems:'center',gap:18,padding:'20px 29px',borderRadius:50,background:BRAND.text,color:BRAND.ink,fontSize:23,fontWeight:700,letterSpacing:-.5,...style}}>{children}<Arrow/></div>;

export const CornerNote: React.FC<{index: string; label: string}> = ({index,label}) =>
  <div style={{position:'absolute',left:98,bottom:54,display:'flex',alignItems:'center',gap:18,fontSize:13,letterSpacing:2.1,color:'#75869e'}}>
    <span style={{color:BRAND.cyan}}>{index}</span><span style={{width:38,height:1,background:'#344459'}}/>{label}
  </div>;
