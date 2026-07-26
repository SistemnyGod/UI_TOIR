import { z } from "zod";

const pushEntityTypeSchema = z.enum([
  "patrolRequest",
  "patrolAssignment",
  "patrolPoint",
  "workTask",
  "syncConflict"
]);

const pushPayloadSchema = z.object({
  entityType: pushEntityTypeSchema,
  entityId: z.string().min(1),
  assignmentId: z.string().min(1).optional()
}).passthrough();

export type PushNavigationTarget = {
  path: string;
  entityType: z.infer<typeof pushEntityTypeSchema>;
  entityId: string;
};

export function resolvePushNavigationTarget(value: unknown): PushNavigationTarget | null {
  const parsed = pushPayloadSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }

  const { entityType, entityId, assignmentId } = parsed.data;
  switch (entityType) {
    case "patrolRequest":
      return { path: `/patrol/request/${entityId}`, entityType, entityId };
    case "patrolAssignment":
      return { path: `/patrol/assignment/${entityId}`, entityType, entityId };
    case "patrolPoint":
      return assignmentId
        ? { path: `/patrol/assignment/${assignmentId}/point/${entityId}`, entityType, entityId }
        : null;
    case "workTask":
      return { path: "/(tabs)/work-accounting", entityType, entityId };
    case "syncConflict":
      return { path: "/settings/sync-queue", entityType, entityId };
  }
}