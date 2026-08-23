export type LessonNodeKind =
  | 'GOAL'
  | 'PROBLEM_QUESTION'
  | 'BIG_IDEA'
  | 'OUTCOME'
  | 'METHOD'
  | 'TECHNIQUE'
  | 'FORM'
  | 'CONTENT_ITEM'
  | 'STAGE'
  | 'MATERIAL'
  | 'ASSESSMENT'
  | 'HOMEWORK'
  | 'FINAL_CONCLUSION';

export type ArtifactFreshness = 'CURRENT' | 'STALE';

export interface LessonDependencyNode {
  nodeId: string;
  kind: LessonNodeKind;
  freshness: ArtifactFreshness;
  revision: number;
}

export interface LessonDependencyEdge {
  fromNodeId: string;
  toNodeId: string;
  relation:
    | 'CONSTRAINS'
    | 'INFORMS'
    | 'REQUIRES'
    | 'ASSESSES'
    | 'GENERATES_FROM';
}

export interface ChangeImpact {
  changedNodeIds: string[];
  staleNodeIds: string[];
  reason: string;
}

/**
 * Pure deterministic traversal used by application code to mark descendants stale.
 * It intentionally does not mutate state or invoke AI.
 */
export function calculateChangeImpact(
  changedNodeIds: readonly string[],
  edges: readonly LessonDependencyEdge[]
): ChangeImpact {
  const changed = new Set(changedNodeIds);
  const stale = new Set<string>();
  const queue = [...changedNodeIds];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    for (const edge of edges) {
      if (edge.fromNodeId !== current) continue;
      if (changed.has(edge.toNodeId) || stale.has(edge.toNodeId)) continue;
      stale.add(edge.toNodeId);
      queue.push(edge.toNodeId);
    }
  }

  return {
    changedNodeIds: [...changed],
    staleNodeIds: [...stale],
    reason: 'A parent pedagogical decision changed; dependent artifacts require explicit review or regeneration.'
  };
}
