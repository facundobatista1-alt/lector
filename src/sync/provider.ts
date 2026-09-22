export interface SyncProvider { exportState(): Promise<Blob>; importState(data: Blob): Promise<{ imported: number; conflicts: number }> }
