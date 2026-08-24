import type { ReactNode } from 'react';
import type { Course } from '../entities/course/model.js';
import type { MeResponse } from '../entities/session/model.js';

export function AppShell({ me, course, sidebar, children, loading, error, onSignOut }: {
  me: MeResponse | null;
  course: Course | null;
  sidebar: ReactNode;
  children: ReactNode;
  loading: boolean;
  error: string | null;
  onSignOut(): void;
}) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Перейти к основному содержанию</a>
      <header className="topbar">
        <div className="topbar__brand"><div className="brand-mark">ТК</div><div><strong>Tehkarta</strong><span>AI-методист · решение за педагогом</span></div></div>
        <div className="topbar__context">{course ? <><span>{course.subject}</span><span>{course.grade} класс</span><span>{course.academicYear}</span></> : null}</div>
        <div className="topbar__user">
          <div className="user-avatar">{(me?.user.displayName ?? me?.user.email ?? 'П')[0]?.toUpperCase()}</div>
          <div className="topbar__user-copy"><strong>{me?.user.displayName ?? 'Педагог'}</strong><span>{me?.workspace.role ?? 'Рабочая область'}</span></div>
          <button className="icon-button" type="button" title="Выйти" aria-label="Выйти" onClick={onSignOut}>↪</button>
        </div>
      </header>
      <div className="workspace-layout">
        {sidebar}
        <main className="lesson-workspace" id="main-content">
          {loading ? <div className="loading-bar" aria-label="Загрузка" /> : null}
          {error ? <div className="page-error">{error}</div> : null}
          {children}
        </main>
      </div>
    </div>
  );
}
