import React from 'react';
import {Composition} from 'remotion';
import {Promo} from './compositions/Promo';
import {FPS} from './config';

export const Root = () => <>
  <Composition id="NewDeskTabPromo" component={Promo} durationInFrames={56*FPS} fps={FPS} width={1920} height={1080} defaultProps={{vertical:false}}/>
  <Composition id="NewDeskTabVertical" component={Promo} durationInFrames={26*FPS} fps={FPS} width={1080} height={1920} defaultProps={{vertical:true}}/>
</>;
