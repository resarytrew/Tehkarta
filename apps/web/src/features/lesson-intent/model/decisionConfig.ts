import type { Lesson } from '../../../entities/lesson/model.js';
import type { CoreDecisionKey } from '../../../entities/lesson/model.js';

export const decisionCopy: Record<CoreDecisionKey, { title: string; description: string }> = {
  goal: {
    title: 'Цель урока',
    description: 'Что должно измениться в понимании и деятельности ученика к концу урока.'
  },
  problemQuestion: {
    title: 'Проблемный вопрос',
    description: 'Главный интеллектуальный вопрос, вокруг которого строится логика урока.'
  },
  bigIdea: {
    title: 'Большая идея',
    description: 'Смысловой вывод, связывающий предметное содержание с целостным пониманием темы.'
  }
};

export function coreDecisionsApproved(lesson: Lesson): boolean {
  return (Object.keys(decisionCopy) as CoreDecisionKey[]).every(
    (semanticKey) => lesson[semanticKey]?.meta.status === 'APPROVED'
  );
}
