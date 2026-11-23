import {existsSync, readdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {chromium} from '@playwright/test';

export function findBrowser() {
  if(process.env.NEWDESKTAB_BROWSER_PATH){
    if(!existsSync(process.env.NEWDESKTAB_BROWSER_PATH)) throw new Error('NEWDESKTAB_BROWSER_PATH does not exist.');
    return process.env.NEWDESKTAB_BROWSER_PATH;
  }
  const expected=chromium.executablePath();
  if(existsSync(expected)) return expected;
  const roots=[process.env.PLAYWRIGHT_BROWSERS_PATH,join(homedir(),'AppData/Local/ms-playwright'),join(homedir(),'.cache/ms-playwright'),join(homedir(),'Library/Caches/ms-playwright')].filter(Boolean);
  for(const root of roots){
    if(!existsSync(root)) continue;
    for(const dir of readdirSync(root).filter(d=>/^chromium-\d+$/.test(d)).sort((a,b)=>Number(b.split('-')[1])-Number(a.split('-')[1]))){
      for(const suffix of ['chrome-win64/chrome.exe','chrome-win/chrome.exe','chrome-linux64/chrome','chrome-linux/chrome','chrome-mac/Chromium.app/Contents/MacOS/Chromium']){
        const file=join(root,dir,suffix);if(existsSync(file))return file;
      }
    }
  }
  return undefined; // Remotion can download its own Chrome if none is installed.
}
