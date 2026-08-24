import type { GovernedField } from './index.js';

export type PedagogicalStyle = 'CLASSICAL' | 'CONSTRUCTIVIST' | 'HUMANISTIC' | 'GAME_BASED';
export type CommunicationTone = 'ACADEMIC' | 'SUPPORTIVE' | 'DIRECT' | 'CREATIVE';
export type PedagogicalFocus = 'ENGAGEMENT' | 'DEPTH' | 'META_SKILLS' | 'PRACTICAL_APPLICATION';

export interface PedagogicalProfile {
  creed?: GovernedField<string>;
  style?: GovernedField<PedagogicalStyle>;
  communicationTone?: GovernedField<CommunicationTone>;
  focus?: GovernedField<PedagogicalFocus>;
}

export interface ApprovedPedagogicalProfile {
  style: PedagogicalStyle;
  communicationTone: CommunicationTone;
  focus: PedagogicalFocus;
}

export interface PedagogicalTechnologySelection {
  technologyId: string;
  name: string;
  methodologyPackId: string;
  methodologyPackVersion: string;
}

export interface MethodSelection {
  methodId: string;
  name: string;
  technologyId: string;
  methodologyPackId: string;
  methodologyPackVersion: string;
  targetOutcomeFieldId: string;
  targetOutcomeRevision: number;
  technologyRevision: number;
  pedagogicalProfileRevision: string;
}

export interface TechniqueSelection {
  techniqueId: string;
  name: string;
  methodId: string;
  methodologyPackId: string;
  methodologyPackVersion: string;
}

export interface OrganizationalFormSelection {
  formId: string;
  name: string;
  methodId: string;
  methodologyPackId: string;
  methodologyPackVersion: string;
}

export function approvedPedagogicalProfile(profile: PedagogicalProfile): ApprovedPedagogicalProfile | undefined {
  const style = profile.style?.meta.status === 'APPROVED' ? profile.style.value : undefined;
  const communicationTone = profile.communicationTone?.meta.status === 'APPROVED' ? profile.communicationTone.value : undefined;
  const focus = profile.focus?.meta.status === 'APPROVED' ? profile.focus.value : undefined;
  return style && communicationTone && focus ? { style, communicationTone, focus } : undefined;
}
