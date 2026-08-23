import type { Course } from './index.js';

export const history9CourseSeed: Course = {
  id: 'history-9-world-modern-xix',
  workspaceId: 'system-reference-workspace',
  version: 1,
  subject: 'История',
  grade: 9,
  academicYear: '2026/27',
  title: 'Всеобщая история. История Нового времени. XIX — начало XX в.',
  curriculumPackId: 'curriculum-history-5-9-2026',
  curriculumPackVersion: '1.0.0',
  contentPackId: 'umk-history-9-2026',
  contentPackVersion: '1.0.0',
  sections: [
    {
      id: 'industrial-era',
      title: 'Начало индустриальной эпохи',
      plannedHours: 7,
      requirementIds: [],
      lessonIds: [
        'industrial-01-economy-leap',
        'industrial-02-society-motion',
        'industrial-03-ideologies',
        'industrial-04-reforms',
        'industrial-05-science-education',
        'industrial-06-artistic-search',
        'industrial-07-international-relations'
      ]
    }
  ]
};

export const history9IndustrialLessons = [
  'Экономика делает решающий рывок',
  'Общество в движении',
  '«Великие идеологии»',
  'Путём реформ: государство, парламенты, партии',
  'Наука и образование в XIX в.: сила, менявшая мир',
  'Век художественных исканий',
  'Международные отношения в XIX в.'
] as const;
