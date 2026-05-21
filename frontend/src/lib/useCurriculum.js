import { useState } from 'react';

// Use built-in crypto.randomUUID() - no external package needed
const uid = () => crypto.randomUUID();

export function useCurriculum(initialData = []) {
  const [sections, setSections] = useState(initialData);

  const addSection = (title = 'New Section') => {
    setSections(prev => [...prev, { id: uid(), title, lessons: [] }]);
  };

  const removeSection = (sectionId) => {
    setSections(prev => prev.filter(s => s.id !== sectionId));
  };

  const updateSectionTitle = (sectionId, newTitle) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, title: newTitle } : s));
  };

  const addLesson = (sectionId, type = 'video', title = '') => {
    const newLesson = {
      id: uid(),
      title: title || (type === 'quiz' ? 'New Quiz' : 'New Lesson'),
      type,
      content: '',
      videoUrl: '',
      duration: '',
      questions: type === 'quiz' ? [] : undefined,
    };
    setSections(prev => prev.map(section =>
      section.id === sectionId
        ? { ...section, lessons: [...section.lessons, newLesson] }
        : section
    ));
  };

  const updateLesson = (sectionId, lessonId, updates) => {
    setSections(prev => prev.map(section =>
      section.id === sectionId
        ? { ...section, lessons: section.lessons.map(l => l.id === lessonId ? { ...l, ...updates } : l) }
        : section
    ));
  };

  const removeLesson = (sectionId, lessonId) => {
    setSections(prev => prev.map(section =>
      section.id === sectionId
        ? { ...section, lessons: section.lessons.filter(l => l.id !== lessonId) }
        : section
    ));
  };

  return { sections, addSection, removeSection, updateSectionTitle, addLesson, updateLesson, removeLesson };
}
