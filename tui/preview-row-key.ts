export function buildPreviewRowKey(agentId: number, rowIndex: number): string {
  return `${agentId}:${rowIndex}`;
}
