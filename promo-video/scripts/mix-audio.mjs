import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const run=promisify(execFile);
export async function mixAudio({video,output,vertical=false}){
  const timelines=JSON.parse(await readFile(resolve(root,'src/audio-timeline.json'),'utf8'));
  const cue=vertical?timelines.vertical:timelines.main;
  const score=resolve(root,'public/audio',cue.score);
  const click=resolve(root,'public/audio/click.wav');
  const split=cue.clicks.map((_,i)=>`[click${i}]`).join('');
  const chains=[`[1:a]atrim=0:${cue.duration},asetpts=PTS-STARTPTS[music]`,`[2:a]volume=${cue.clickVolume},asplit=${cue.clicks.length}${split}`];
  cue.clicks.forEach((time,i)=>chains.push(`[click${i}]adelay=${Math.round(time*1000)}|${Math.round(time*1000)}[cue${i}]`));
  chains.push(`[music]${cue.clicks.map((_,i)=>`[cue${i}]`).join('')}amix=inputs=${cue.clicks.length+1}:duration=first:normalize=0,atrim=0:${cue.duration},aresample=48000[mix]`);
  await run(process.env.FFMPEG_PATH??'ffmpeg',[
    '-hide_banner','-loglevel','error','-y','-i',video,'-i',score,'-i',click,
    '-filter_complex',chains.join(';'),'-map','0:v:0','-map','[mix]',
    '-c:v','copy','-c:a','aac','-b:a','320k','-ar','48000','-t',String(cue.duration),
    '-movflags','+faststart','-map_metadata','0',output,
  ],{windowsHide:true,maxBuffer:8*1024*1024});
  console.log(`Mixed ${cue.duration}s stereo score + ${cue.clicks.length} interaction cues: ${output}`);
}

if(process.argv.includes('--preview')){
  const vertical=process.argv.includes('--vertical');
  const video=resolve(root,`output/preview/${vertical?'vertical':'main'}-draft.mp4`);
  const output=resolve(root,`output/preview/${vertical?'vertical':'main'}-mixed.mp4`);
  await mixAudio({video,output,vertical});
  await rename(output,video);
}
