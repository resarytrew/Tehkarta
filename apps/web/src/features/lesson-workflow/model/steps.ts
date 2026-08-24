export type ActiveDesignStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const designSteps: ReadonlyArray<{ step: ActiveDesignStep; number: string; label: string }> = [
  { step: 1, number: '01', label: 'Замысел' },
  { step: 2, number: '02', label: 'Цель и результаты' },
  { step: 3, number: '03', label: 'Методический конструктор' },
  { step: 4, number: '04', label: 'Содержание УМК' },
  { step: 5, number: '05', label: 'Сценарий' },
  { step: 6, number: '06', label: 'Материалы' },
  { step: 7, number: '07', label: 'Экспертиза' },
  { step: 8, number: '08', label: 'Карта урока' }
];

export const stepContextLabels: Record<ActiveDesignStep, string> = {
  1: 'Контекст замысла',
  2: 'Контекст AI',
  3: 'Контекст методики',
  4: 'Контекст содержания',
  5: 'Контекст сценария',
  6: 'Контекст материалов',
  7: 'Контекст экспертизы',
  8: 'Контекст карты урока'
};
