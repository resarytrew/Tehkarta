import type { OutcomeKind } from '@tehkarta/domain';

export interface MethodologyTechnique {
  id: string;
  name: string;
  description: string;
  instructions: string[];
  typicalMinutes: { min: number; max: number };
}

export interface MethodologyForm {
  id: string;
  name: string;
  participantPattern: string;
  constraints: string[];
}

export interface MethodologyRecommendation {
  id: string;
  packRef: { id: string; version: string };
  technology: { id: string; name: string };
  technologyPhase: { id: string; name: string };
  targetOutcome: {
    fieldId: string;
    revision: number;
    value: string;
    inferredKinds: OutcomeKind[];
  };
  method: {
    id: string;
    name: string;
    description: string;
    preparation: string[];
    constraints: string[];
    antiPatterns: string[];
  };
  suggestedTechniques: MethodologyTechnique[];
  compatibleForms: MethodologyForm[];
  rationale: string;
  estimatedMinutes: { min: number; max: number };
  constraintNotes: string[];
}

export interface MethodologyRecommendationBundle {
  pack: {
    id: string;
    version: string;
    title: string;
    technology: {
      id: string;
      name: string;
      description: string;
      antiPatterns: string[];
    };
  };
  recommendations: MethodologyRecommendation[];
  courseContext?: {
    planRevision: number;
    contextRevision: string;
    previousLessonCount: number;
    masteredConcepts: string[];
    currentTopic?: string;
    nextTopics: string[];
    approvedSourceCount: number;
  };
}
