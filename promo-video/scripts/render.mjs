import {bundle} from '@remotion/bundler';
import {openBrowser, selectComposition, renderMedia, renderStill} from '@remotion/renderer';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {findBrowser} from './browser.mjs';
import {mixAudio} from './mix-audio.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const preview=process.argv.includes('--preview');
const stills=process.argv.includes('--stills');
const vertical=process.argv.includes('--vertical');
const browserExecutable=findBrowser();
const cacheRoot=resolve('node_modules/.cache/newdesktab-promo');
await mkdir('output/preview',{recursive:true});
await mkdir('output/frames',{recursive:true});
await mkdir(resolve(cacheRoot,'renders'),{recursive:true});
let lastBundle=-1;
const serveUrl=await bundle({entryPoint:resolve('src/index.ts'),publicDir:resolve('public'),outDir:resolve(cacheRoot,`bundle-${vertical?'vertical':'main'}`),onProgress:p=>{if(Math.floor(p/25)!==lastBundle){lastBundle=Math.floor(p/25);console.log(`Bundle ${p}%`);}}});
const browser=await openBrowser('chrome',{browserExecutable,logLevel:'warn'});
try {
  const id=vertical?'NewDeskTabVertical':'NewDeskTabPromo';
  const composition=await selectComposition({serveUrl,id,puppeteerInstance:browser});
  if(stills){
    for(const seconds of (process.env.QA_TIMES ? process.env.QA_TIMES.split(',').map(Number) : vertical?[1.7,5.8,11.5,17.5,24.4]:[2,6.7,10,15.3,19.4,23.3,28,34,39.5,46,53.7])){
      const frame=Math.round(seconds*60);
      const output=resolve('output/frames',`${vertical?'vertical':'main'}-${String(frame).padStart(4,'0')}.png`);
      await renderStill({serveUrl,composition,frame,output,puppeteerInstance:browser,imageFormat:'png',logLevel:'warn'});
      console.log(`Still ${seconds}s: ${output}`);
    }
  }else{
    const outputLocation=resolve('output',preview?`preview/${vertical?'vertical':'main'}-draft.mp4`:`newdesktab-promo-${vertical?'vertical':'1080p'}.mp4`);
    const silentOutput=resolve(cacheRoot,'renders',`${vertical?'vertical':'main'}${preview?'-preview':''}-silent.mp4`);
    let lastLog=0;
    const start=Date.now();
    await renderMedia({
      composition,serveUrl,puppeteerInstance:browser,outputLocation:silentOutput,codec:'h264',muted:true,
      pixelFormat:'yuv420p',crf:preview?23:17,audioBitrate:'320k',x264Preset:preview?'veryfast':'medium',
      scale:preview?.5:1,everyNthFrame:preview?2:1,concurrency:Number(process.env.RENDER_CONCURRENCY??6),
      imageFormat:'jpeg',jpegQuality:preview?85:95,colorSpace:'bt709',
      metadata:{title:'New DeskTab — Your browser. Your space.',artist:'Alextc35',comment:'Authentic New DeskTab product capture. Original procedural soundtrack.'},
      onProgress:({progress,renderedFrames,encodedFrames})=>{if(Date.now()-lastLog>15000||progress===1){lastLog=Date.now();console.log(`${(progress*100).toFixed(1)}% | rendered ${renderedFrames} | encoded ${encodedFrames} | ${Math.round((Date.now()-start)/1000)}s`);}},
      logLevel:'warn',timeoutInMilliseconds:120000,
    });
    await mixAudio({video:silentOutput,output:outputLocation,vertical});
    await writeFile(resolve('output',`${vertical?'vertical':'main'}${preview?'-preview':''}-render.json`),JSON.stringify({composition:id,width:preview?composition.width/2:composition.width,height:preview?composition.height/2:composition.height,fps:preview?composition.fps/2:composition.fps,durationSeconds:composition.durationInFrames/composition.fps,outputLocation,preview,renderSeconds:(Date.now()-start)/1000},null,2));
    console.log(`Rendered: ${outputLocation}`);
  }
}finally{await browser.close({silent:true});}
