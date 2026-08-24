import type { ReactNode } from 'react';
import type { GovernedField, Lesson } from '../entities/lesson/model.js';
import type { LessonWorkspace } from '../features/lesson-designer/model/useLessonWorkspace.js';
import { ApiProvider } from '../shared/api/ApiProvider.js';
import { SessionActionsProvider } from '../shared/auth/SessionActions.js';
import { NotificationProvider } from '../shared/notifications/NotificationProvider.js';

export function lessonFixture(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: 'lesson-1', workspaceId: 'workspace-1', version: 3, courseId: 'course-1', sectionId: 'section-1', order: 1,
    title: 'Проверочный урок', durationMinutes: 45,
    pedagogicalProfile: {},
    designFreedom: { mode: 'BALANCED', contentFreedom: 'TEXTBOOK_PLUS', methodFreedom: 'FLEXIBLE' },
    outcomes: [], selectedMethods: [], selectedTechniques: [], selectedForms: [], contentItems: [],
    ...overrides
  };
}

export function approvedField(value: string, fieldId: string = crypto.randomUUID()): GovernedField<string> {
  return {
    fieldId,
    value,
    meta: { revision: 1, source: 'TEACHER', status: 'APPROVED', updatedAt: '2026-08-24T00:00:00.000Z' }
  };
}

export function lessonWorkspaceFixture(overrides: Partial<LessonWorkspace> = {}): LessonWorkspace {
  return {
    lesson: lessonFixture(), invalidations: [], proposals: [], methodology: null, contentContext: null,
    scenarioContext: null, artifacts: [], loading: false, error: null,
    refreshAll: async () => undefined,
    refreshLesson: async () => undefined,
    refreshProposals: async () => undefined,
    refreshMethodology: async () => undefined,
    refreshContent: async () => undefined,
    refreshScenario: async () => undefined,
    refreshArtifacts: async () => undefined,
    applyGovernance: () => undefined,
    putProposal: () => undefined,
    putArtifact: () => undefined,
    setMethodology: () => undefined,
    setContentContext: () => undefined,
    setScenarioContext: () => undefined,
    ...overrides
  };
}

export function TestProviders({ children, onSessionEnded = () => undefined }: { children: ReactNode; onSessionEnded?: () => void }) {
  return (
    <ApiProvider config={{ baseUrl: 'http://api.test', workspaceId: 'workspace-1', csrfToken: 'csrf-test' }}>
      <SessionActionsProvider onSessionEnded={onSessionEnded}>
        <NotificationProvider>{children}</NotificationProvider>
      </SessionActionsProvider>
    </ApiProvider>
  );
}
