import type {
  AiProposalAction,
  ApiData,
  ApiErrorPayload,
  ApplyAiProposalResponse,
  ContentSelectionDecision,
  CoreDecisionKey,
  Course,
  CourseSummary,
  CoursePlanningSnapshot,
  CourseLessonProgression,
  CourseSourceRole,
  GovernanceResponse,
  Lesson,
  LessonAiProposal,
  LessonDesignArtifact,
  LessonDesignArtifactKind,
  ApprovedScenarioContext,
  LessonContentContext,
  LessonInvalidation,
  LessonSummary,
  LoginResponse,
  MeResponse,
  MethodologyRecommendationBundle,
  SetContentSelectionResponse
} from './types.js';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly payload: ApiErrorPayload
  ) {
    super(payload.message ?? `API request failed with status ${status}.`);
    this.name = 'ApiRequestError';
  }
}

export interface ApiClientConfig {
  baseUrl: string;
  workspaceId: string;
  csrfToken?: string;
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/$/, '');
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let payload: ApiErrorPayload = {};
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      payload = { message: response.statusText || 'Unknown API error.' };
    }
    throw new ApiRequestError(response.status, payload);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function loginWithPassword(
  baseUrl: string,
  input: { email: string; password: string }
): Promise<LoginResponse> {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/api/v1/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json'
    },
    body: JSON.stringify(input)
  });
  return parseResponse<LoginResponse>(response);
}

export class TehkartaApiClient {
  private readonly baseUrl: string;

  constructor(private readonly config: ApiClientConfig) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    options: { csrf?: boolean } = {}
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('x-workspace-id', this.config.workspaceId);
    headers.set('accept', 'application/json');

    if (init.body !== undefined && !(init.body instanceof FormData) && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    if (options.csrf) {
      if (!this.config.csrfToken) {
        throw new ApiRequestError(403, {
          code: 'CSRF_REQUIRED',
          message: 'Для изменения урока нужен CSRF-токен активной сессии.'
        });
      }
      headers.set('x-csrf-token', this.config.csrfToken);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      credentials: 'include'
    });

    return parseResponse<T>(response);
  }

  me(): Promise<MeResponse> {
    return this.request<MeResponse>('/api/v1/me');
  }

  async listCourses(): Promise<CourseSummary[]> {
    const response = await this.request<ApiData<CourseSummary[]>>('/api/v1/courses');
    return response.data;
  }

  async getCourse(courseId: string): Promise<Course> {
    const response = await this.request<ApiData<Course>>(
      `/api/v1/courses/${encodeURIComponent(courseId)}`
    );
    return response.data;
  }

  async listLessons(courseId: string): Promise<LessonSummary[]> {
    const response = await this.request<ApiData<LessonSummary[]>>(
      `/api/v1/courses/${encodeURIComponent(courseId)}/lessons`
    );
    return response.data;
  }

  async getLesson(lessonId: string): Promise<Lesson> {
    const response = await this.request<ApiData<Lesson>>(
      `/api/v1/lessons/${encodeURIComponent(lessonId)}`
    );
    return response.data;
  }

  async getLessonContentContext(lessonId: string): Promise<LessonContentContext> {
    const response = await this.request<ApiData<LessonContentContext>>(
      `/api/v1/lessons/${encodeURIComponent(lessonId)}/content-context`
    );
    return response.data;
  }

  async getCoursePlanning(courseId: string): Promise<CoursePlanningSnapshot> {
    const response = await this.request<ApiData<CoursePlanningSnapshot>>(
      `/api/v1/courses/${encodeURIComponent(courseId)}/planning-context`
    );
    return response.data;
  }

  async saveCoursePlan(input: {
    courseId: string;
    expectedRevision: number;
    goals: string[];
    plannedOutcomes: string[];
    contentSummary: string;
    lessons: CourseLessonProgression[];
  }): Promise<CoursePlanningSnapshot> {
    const response = await this.request<ApiData<CoursePlanningSnapshot>>(
      `/api/v1/courses/${encodeURIComponent(input.courseId)}/plan`,
      {
        method: 'PUT',
        body: JSON.stringify({
          expectedRevision: input.expectedRevision,
          goals: input.goals,
          plannedOutcomes: input.plannedOutcomes,
          contentSummary: input.contentSummary,
          lessons: input.lessons
        })
      },
      { csrf: true }
    );
    return response.data;
  }

  async approveCoursePlan(courseId: string, expectedRevision: number): Promise<CoursePlanningSnapshot> {
    const response = await this.request<ApiData<CoursePlanningSnapshot>>(
      `/api/v1/courses/${encodeURIComponent(courseId)}/plan/approve`,
      { method: 'POST', body: JSON.stringify({ expectedRevision }) },
      { csrf: true }
    );
    return response.data;
  }

  async uploadCourseSource(input: {
    courseId: string;
    file: File;
    title: string;
    sourceRole: CourseSourceRole;
    rightsBasis: string;
  }): Promise<CoursePlanningSnapshot> {
    const query = new URLSearchParams({
      title: input.title,
      sourceRole: input.sourceRole,
      rightsBasis: input.rightsBasis
    });
    const form = new FormData();
    form.append('file', input.file);
    const response = await this.request<ApiData<CoursePlanningSnapshot>>(
      `/api/v1/courses/${encodeURIComponent(input.courseId)}/sources?${query.toString()}`,
      { method: 'POST', body: form },
      { csrf: true }
    );
    return response.data;
  }

  async approveCourseSource(courseId: string, bindingId: string): Promise<CoursePlanningSnapshot> {
    const response = await this.request<ApiData<CoursePlanningSnapshot>>(
      `/api/v1/courses/${encodeURIComponent(courseId)}/sources/${encodeURIComponent(bindingId)}/approve`,
      { method: 'POST' },
      { csrf: true }
    );
    return response.data;
  }

  async getScenarioContext(lessonId: string): Promise<ApprovedScenarioContext> {
    const response = await this.request<ApiData<ApprovedScenarioContext>>(
      `/api/v1/lessons/${encodeURIComponent(lessonId)}/scenario-context`
    );
    return response.data;
  }

  async listDesignArtifacts(lessonId: string): Promise<LessonDesignArtifact[]> {
    const response = await this.request<ApiData<LessonDesignArtifact[]>>(
      `/api/v1/lessons/${encodeURIComponent(lessonId)}/design-artifacts`
    );
    return response.data;
  }

  async saveDesignArtifact(input: {
    lessonId: string;
    kind: LessonDesignArtifactKind;
    expectedLessonVersion: number;
    expectedRevision: number;
    payload: Readonly<Record<string, unknown>>;
  }): Promise<LessonDesignArtifact> {
    const response = await this.request<ApiData<LessonDesignArtifact>>(
      `/api/v1/lessons/${encodeURIComponent(input.lessonId)}/design-artifacts/${encodeURIComponent(input.kind)}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          expectedLessonVersion: input.expectedLessonVersion,
          expectedRevision: input.expectedRevision,
          payload: input.payload
        })
      },
      { csrf: true }
    );
    return response.data;
  }

  setUmkContentDecision(input: {
    lessonId: string;
    mappingId: string;
    decision: ContentSelectionDecision;
    expectedLessonVersion: number;
  }): Promise<SetContentSelectionResponse> {
    return this.request<SetContentSelectionResponse>(
      `/api/v1/lessons/${encodeURIComponent(input.lessonId)}/content-selection/umk/${encodeURIComponent(input.mappingId)}`,
      {
        method: 'POST',
        body: JSON.stringify({
          decision: input.decision,
          expectedLessonVersion: input.expectedLessonVersion
        })
      },
      { csrf: true }
    );
  }

  async listInvalidations(lessonId: string): Promise<LessonInvalidation[]> {
    const response = await this.request<ApiData<LessonInvalidation[]>>(
      `/api/v1/lessons/${encodeURIComponent(lessonId)}/invalidations`
    );
    return response.data;
  }

  async getMethodologyRecommendations(lessonId: string): Promise<MethodologyRecommendationBundle> {
    const response = await this.request<ApiData<MethodologyRecommendationBundle>>(
      `/api/v1/lessons/${encodeURIComponent(lessonId)}/methodology/recommendations`
    );
    return response.data;
  }

  addApprovedOutcome(input: {
    lessonId: string;
    value: string;
    expectedLessonVersion: number;
  }): Promise<GovernanceResponse> {
    return this.request<GovernanceResponse>(
      `/api/v1/lessons/${encodeURIComponent(input.lessonId)}/outcomes`,
      {
        method: 'POST',
        body: JSON.stringify({
          value: input.value,
          expectedLessonVersion: input.expectedLessonVersion
        })
      },
      { csrf: true }
    );
  }

  useMethodologyRecommendation(input: {
    lessonId: string;
    recommendationId: string;
    formId: string;
    techniqueIds: string[];
    expectedLessonVersion: number;
  }): Promise<GovernanceResponse> {
    return this.request<GovernanceResponse>(
      `/api/v1/lessons/${encodeURIComponent(input.lessonId)}/methodology/recommendations/${encodeURIComponent(input.recommendationId)}/use`,
      {
        method: 'POST',
        body: JSON.stringify({
          expectedLessonVersion: input.expectedLessonVersion,
          formId: input.formId,
          techniqueIds: input.techniqueIds
        })
      },
      { csrf: true }
    );
  }

  rejectMethodologyRecommendation(lessonId: string, recommendationId: string): Promise<void> {
    return this.request<{ accepted: true }>(
      `/api/v1/lessons/${encodeURIComponent(lessonId)}/methodology/recommendations/${encodeURIComponent(recommendationId)}/reject`,
      { method: 'POST' },
      { csrf: true }
    ).then(() => undefined);
  }

  async listAiProposals(
    lessonId: string,
    semanticKey?: CoreDecisionKey
  ): Promise<LessonAiProposal[]> {
    const query = semanticKey ? `?semanticKey=${encodeURIComponent(semanticKey)}` : '';
    const response = await this.request<ApiData<LessonAiProposal[]>>(
      `/api/v1/lessons/${encodeURIComponent(lessonId)}/ai-proposals${query}`
    );
    return response.data;
  }

  async getAiProposal(lessonId: string, proposalId: string): Promise<LessonAiProposal> {
    const response = await this.request<ApiData<LessonAiProposal>>(
      `/api/v1/lessons/${encodeURIComponent(lessonId)}/ai-proposals/${encodeURIComponent(proposalId)}`
    );
    return response.data;
  }

  applyAiProposalCandidate(input: {
    lessonId: string;
    proposalId: string;
    candidateId: string;
    expectedLessonVersion: number;
  }): Promise<ApplyAiProposalResponse> {
    return this.request<ApplyAiProposalResponse>(
      `/api/v1/lessons/${encodeURIComponent(input.lessonId)}/ai-proposals/${encodeURIComponent(input.proposalId)}/apply`,
      {
        method: 'POST',
        body: JSON.stringify({
          candidateId: input.candidateId,
          expectedLessonVersion: input.expectedLessonVersion
        })
      },
      { csrf: true }
    );
  }

  async dismissAiProposal(lessonId: string, proposalId: string): Promise<LessonAiProposal> {
    const response = await this.request<ApiData<LessonAiProposal>>(
      `/api/v1/lessons/${encodeURIComponent(lessonId)}/ai-proposals/${encodeURIComponent(proposalId)}/dismiss`,
      { method: 'POST' },
      { csrf: true }
    );
    return response.data;
  }

  async requestAiProposal(input: {
    lessonId: string;
    semanticKey: CoreDecisionKey;
    action: AiProposalAction;
    expectedLessonVersion: number;
    requestKey: string;
    candidateCount?: number;
    teacherInstruction?: string;
  }): Promise<LessonAiProposal> {
    const response = await this.request<ApiData<LessonAiProposal>>(
      `/api/v1/lessons/${encodeURIComponent(input.lessonId)}/ai-proposals`,
      {
        method: 'POST',
        body: JSON.stringify({
          semanticKey: input.semanticKey,
          action: input.action,
          expectedLessonVersion: input.expectedLessonVersion,
          requestKey: input.requestKey,
          candidateCount: input.candidateCount,
          teacherInstruction: input.teacherInstruction
        })
      },
      { csrf: true }
    );
    return response.data;
  }

  editDecision(input: {
    lessonId: string;
    semanticKey: CoreDecisionKey;
    value: string;
    expectedLessonVersion: number;
    expectedFieldRevision?: number;
  }): Promise<GovernanceResponse> {
    return this.request<GovernanceResponse>(
      `/api/v1/lessons/${encodeURIComponent(input.lessonId)}/decisions/${encodeURIComponent(input.semanticKey)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          value: input.value,
          expectedLessonVersion: input.expectedLessonVersion,
          expectedFieldRevision: input.expectedFieldRevision
        })
      },
      { csrf: true }
    );
  }

  approveDecision(input: {
    lessonId: string;
    semanticKey: CoreDecisionKey;
    expectedLessonVersion: number;
    expectedFieldRevision: number;
  }): Promise<GovernanceResponse> {
    return this.request<GovernanceResponse>(
      `/api/v1/lessons/${encodeURIComponent(input.lessonId)}/decisions/${encodeURIComponent(input.semanticKey)}/approve`,
      {
        method: 'POST',
        body: JSON.stringify({
          expectedLessonVersion: input.expectedLessonVersion,
          expectedFieldRevision: input.expectedFieldRevision
        })
      },
      { csrf: true }
    );
  }

  logout(): Promise<void> {
    return this.request<void>('/api/v1/auth/logout', { method: 'POST' }, { csrf: true });
  }
}
