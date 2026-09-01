export type DatasetExampleStatus = "raw" | "verified" | "training_ready" | "rejected";
export type DatasetSplit = "train" | "validation";
export interface AiEventInput { projectId: string; eventType: string; source?: string; payload: Record<string, unknown>; occurredAt?: string; }
export interface DatasetExampleInput { projectId: string; sourceKind: "event" | "interaction" | "manual" | "import"; sourceId?: string | null; input: unknown; output?: unknown; metadata?: Record<string, unknown>; }
export interface DatasetExample { id: string; projectId: string; sourceKind: string; sourceId: string | null; input: unknown; output: unknown | null; metadata: Record<string, unknown>; status: DatasetExampleStatus; qualityScore: number | null; verifiedBy: string | null; verifiedAt: string | null; createdAt: string; }
export interface DatasetVersionManifest { schemaVersion: 1; projectId: string; datasetVersion: number; createdAt: string; exampleCount: number; trainCount: number; validationCount: number; trainRatio: number; sourceStatuses: DatasetExampleStatus[]; formats: string[]; note: string; }
export interface DatasetStats { raw: number; verified: number; trainingReady: number; rejected: number; total: number; }
