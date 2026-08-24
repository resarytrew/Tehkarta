import type { Lesson } from './model.js';

export const designModeLabels: Record<Lesson['designFreedom']['mode'], string> = {
  REGULATED: 'Регламентированный',
  BALANCED: 'Сбалансированный',
  CREATIVE: 'Творческий'
};

export const contentFreedomLabels: Record<Lesson['designFreedom']['contentFreedom'], string> = {
  TEXTBOOK_STRICT: 'Строго по УМК',
  TEXTBOOK_PLUS: 'УМК + проверенные материалы',
  EXPANDED: 'Расширенный курс'
};
