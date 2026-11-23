export const FPS = 60;
export const TRANSITION = 24;
export const CLIPS: Record<string, {seconds: number; speed: number}> = {
  'drag.mp4': {seconds: 5.4, speed: 1.25},
  'resize.mp4': {seconds: 5.1, speed: 1.4},
  'style.mp4': {seconds: 5.4, speed: 1.7},
  'folder.mp4': {seconds: 5.3, speed: 1.08},
  'workspace.mp4': {seconds: 6.2, speed: 1},
  'search.mp4': {seconds: 4.5, speed: 1.2},
};
export const BRAND = {
  name: 'New DeskTab',
  version: '1.0.0',
  slogan: 'Your browser. Your space.',
  cta: 'Discover New DeskTab',
  url: 'github.com/Alextc35/newdesktab',
  ink: '#080d18',
  surface: '#101929',
  text: '#f3f6fb',
  muted: '#9ba9bf',
  cyan: '#80e5f8',
  violet: '#a9a4ff',
};
export const COPY = {
  introEyebrow: 'MEET YOUR NEXT NEW TAB',
  introTitle: ['Your new tab.', 'Reimagined.'],
  beautyEyebrow: 'MORE THAN A NEW TAB',
  beautyTitle: ['A space that feels like you.'],
  beautyValues: ['Make it personal.', 'Keep it organized.', 'Feel at home.'],
  verticalIntroEyebrow: 'YOUR NEW TAB. REIMAGINED.',
  verticalIntroTitle: ['Your browser.', 'Your space.'],
  browserCompatibility: 'CHROME & COMPATIBLE BROWSERS',
};

export type SceneSpec = {
  id: string;
  start: number;
  end: number;
  eyebrow?: string;
  title?: string[];
  description?: string;
  capture?: string;
  clip?: string;
  zoom?: number;
  origin?: string;
};

// All times are seconds. Captures are authentic renders of the extension.
export const MAIN_SCENES: SceneSpec[] = [
  {id: 'intro', start: 0, end: 5},
  {id: 'discover', start: 5, end: 13, eyebrow: 'YOUR EVERYDAY WEB', title: ['Everything', 'you need.', 'In one place.'], description: 'Your favorite websites.\nA space of your own.', capture: 'overview.png'},
  {id: 'drag', start: 13, end: 17.5, eyebrow: 'MAKE IT YOURS', title: ['Find your', 'flow.'], description: 'Drag your bookmarks\ninto place.', capture: 'overview.png', clip: 'drag.mp4'},
  {id: 'resize', start: 17.5, end: 21.5, eyebrow: 'ROOM FOR WHAT MATTERS', title: ['A little', 'more space.'], description: 'Resize the cards\nyou use the most.', capture: 'arranged.png', clip: 'resize.mp4'},
  {id: 'style', start: 21.5, end: 25, eyebrow: 'YOUR OWN LOOK', title: ['Add your', 'signature.'], description: 'Colors. Icons. Covers.', capture: 'style.png', clip: 'style.mp4'},
  {id: 'folder', start: 25, end: 31, eyebrow: 'LESS CLUTTER. MORE CLARITY.', title: ['Keep good', 'things', 'together.'], description: 'Folders for the links\nthat belong together.', capture: 'folder.png', clip: 'folder.mp4'},
  {id: 'workspace', start: 31, end: 38, eyebrow: 'A SPACE FOR EVERY SIDE OF YOU', title: ['Work.', 'Life.', 'Your world.'], description: 'Switch between\nindependent workspaces.', capture: 'workspace-personal.png', clip: 'workspace.mp4'},
  {id: 'search', start: 38, end: 42, eyebrow: 'LESS SEARCHING. MORE DOING.', title: ['Find it.', 'Get to it.'], description: 'Search your bookmarks\nin a moment.', capture: 'search.png', clip: 'search.mp4'},
  {id: 'beauty', start: 42, end: 50},
  {id: 'outro', start: 50, end: 56},
];

export const VERTICAL_SCENES: SceneSpec[] = [
  {id: 'v-intro', start: 0, end: 3},
  {id: 'v-drag', start: 3, end: 8.5, eyebrow: 'MAKE IT YOURS', title: ['Find your flow.'], description: 'Drag. Resize. Arrange.', capture: 'overview.png', clip: 'drag.mp4'},
  {id: 'v-folder', start: 8.5, end: 14, eyebrow: 'BRING IT TOGETHER', title: ['Less clutter.', 'More clarity.'], description: 'Folders for your favorite links.', capture: 'folder.png', clip: 'folder.mp4'},
  {id: 'v-workspace', start: 14, end: 21, eyebrow: 'SWITCH YOUR SPACE', title: ['Work. Life.', 'Your world.'], description: 'Independent workspaces.', capture: 'workspace-personal.png', clip: 'workspace.mp4'},
  {id: 'v-outro', start: 21, end: 26},
];
