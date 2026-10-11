import { rankManualTopics } from './manualSearch.js';

/** Stable destinations shared by the manual, welcome guide and daily tips. */
export const MANUAL_GROUPS = ['start', 'organize', 'personalize', 'protect'];

export const MANUAL_TOPICS = [
  { id: 'bookmarks', group: 'start', related: ['quick-save', 'editing'] },
  { id: 'quick-save', group: 'start', related: ['bookmarks', 'workspaces'] },
  { id: 'keyboard', group: 'start', related: ['shortcuts', 'selection'] },
  { id: 'shortcuts', group: 'start', related: ['keyboard', 'editing'] },
  { id: 'search', group: 'start', related: ['folders', 'workspaces'] },
  { id: 'editing', group: 'organize', related: ['movement', 'appearance'] },
  { id: 'movement', group: 'organize', related: ['drag-modes', 'keyboard'] },
  { id: 'resizing', group: 'organize', related: ['movement', 'drag-modes'] },
  { id: 'drag-modes', group: 'organize', related: ['movement', 'resizing'] },
  { id: 'folders', group: 'organize', related: ['workspaces', 'appearance'] },
  { id: 'workspaces', group: 'organize', related: ['selection', 'folders'] },
  { id: 'selection', group: 'organize', related: ['keyboard', 'history'] },
  { id: 'history', group: 'organize', related: ['trash', 'backup'] },
  { id: 'appearance', group: 'personalize', related: ['presets', 'wallpapers'] },
  { id: 'presets', group: 'personalize', related: ['appearance', 'selection'] },
  { id: 'wallpapers', group: 'personalize', related: ['interface', 'sync'] },
  { id: 'clock', group: 'personalize', related: ['resizing', 'workspaces'] },
  { id: 'interface', group: 'personalize', related: ['wallpapers', 'shortcuts'] },
  { id: 'trash', group: 'protect', related: ['history', 'backup'] },
  { id: 'backup', group: 'protect', related: ['sync', 'data'] },
  { id: 'sync', group: 'protect', related: ['backup', 'wallpapers'] },
  { id: 'compact', group: 'protect', related: ['keyboard', 'search'] },
  { id: 'data', group: 'protect', related: ['backup', 'trash'] },
  { id: 'learning', group: 'protect', related: ['keyboard', 'shortcuts'] }
];

export function getManualTopic(id) {
  return MANUAL_TOPICS.find(topic => topic.id === id);
}

export function searchManual(query, translate) {
  return rankManualTopics(MANUAL_TOPICS, query, translate);
}
