import type { ReactNode } from 'react';
import type { Lesson } from '../entities/lesson/model.js';
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

export function lessonWorkspaceFixture(overrides: Partial<LessonWorkspace> = {}): LessonWorkspace {
  return {
    lesson: lessonFixture(), invalidations: [], proposals: [], methodology: null, contentContext: null,
    scenarioContext: null, artifacts: [], loading: false, error: null,
    refreshAll: async () => undefined,
    refreshLesson: async () => undefined,
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

export function TestProviders({ children }: { children: ReactNode }) {
  return (
    <ApiProvider config={{ baseUrl: 'http://api.test', workspaceId: 'workspace-1', csrfToken: 'csrf-test' }}>
      <SessionActionsProvider onSessionEnded={() => undefined}>
        <NotificationProvider>{children}</NotificationProvider>
      </SessionActionsProvider>
    </ApiProvider>
  );
}
