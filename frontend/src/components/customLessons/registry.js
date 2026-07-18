/**
 * Custom lesson registry.
 *
 * Maps a stable string key (stored in the database as `component_key`) to a
 * React component + a human-readable label shown in the instructor UI.
 *
 * Every component listed here MUST accept these props:
 *   - student: { id, name, email, avatar, role, ... }
 *   - lesson:  { id, title, order, is_final, component_key, ... }
 *
 * Adding a new custom page over time is a 3-step frontend-only change:
 *   1. Create the component file in this folder
 *   2. Import it below
 *   3. Add an entry to `customLessonRegistry` with a unique key + label
 *
 * No database migration is needed — only the string key is stored server-side.
 */
import HowToStudyGuide from './HowToStudyGuide';

export const customLessonRegistry = {
  'how-to-study': {
    label: 'How to Get the Most Out of This Course',
    component: HowToStudyGuide,
  },
};

/**
 * Look up a component by its key. Returns null if the key is unknown
 * (e.g. the key existed in an older version of the registry).
 */
export function getCustomLesson(key) {
  if (!key) return null;
  return customLessonRegistry[key] || null;
}

/**
 * Array shape convenient for populating a <select> in the instructor UI.
 */
export function listCustomLessons() {
  return Object.entries(customLessonRegistry).map(([key, entry]) => ({
    key,
    label: entry.label,
  }));
}
