/**
 * Single source of truth for course categories across the app.
 * Used by:
 *  - Instructor: Create Course page (with custom category support)
 *  - Instructor: Edit Course page (with custom category support)
 *  - Public: Courses browse page filter dropdown
 *  - Demo seed courses (backend defines its own copies)
 */
export const PRESET_CATEGORIES = [
  'Web Development',
  'Data Science',
  'Mobile Development',
  'Marketing',
  'Design',
  'Cybersecurity',
  'Business',
  'Finance',
  'Health & Wellness',
  'Photography',
  'Music',
  'Language Learning',
  'Personal Development',
  'Other',
];

export const DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'];

/** Returns true when the value is a built-in category (not custom). */
export const isPresetCategory = (val) => PRESET_CATEGORIES.includes(val);
