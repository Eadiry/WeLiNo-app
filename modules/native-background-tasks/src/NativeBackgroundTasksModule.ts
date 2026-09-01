import { requireOptionalNativeModule } from 'expo-modules-core';

export type NativeBackgroundTaskRecord = {
  id: string;
  type: string;
  payload: string;
  title: string;
  description?: string;
  state: string;
  progress?: number;
  progressText?: string;
  checkpoint?: string;
  attempt: number;
  createdAt: number;
  updatedAt: number;
};

type NativeBackgroundTasksModule = {
  enqueue(
    type: string,
    payload: string,
    title: string,
    description: string,
    allowsDuplicates: boolean,
    queueName: string,
  ): Promise<string>;
  getTasks(): Promise<NativeBackgroundTaskRecord[]>;
  getTask(taskId: string): Promise<NativeBackgroundTaskRecord | null>;
  pause(taskId: string): Promise<void>;
  resume(taskId: string): Promise<void>;
  cancel(taskId: string): Promise<void>;
  updateProgress(
    taskId: string,
    progress: number,
    progressText: string,
  ): Promise<void>;
  updateCheckpoint(taskId: string, checkpoint: string): Promise<void>;
  complete(taskId: string, completionText: string): Promise<void>;
  fail(taskId: string, error: string, shouldRetry: boolean): Promise<void>;
  scheduleLibraryUpdates(
    intervalHours: number,
    title: string,
    description: string,
  ): Promise<void>;
  cancelLibraryUpdates(): Promise<void>;
  scheduleAutomaticBackups(
    intervalHours: number,
    title: string,
    description: string,
    directoryUri: string,
  ): Promise<void>;
  cancelAutomaticBackups(): Promise<void>;
};

const nativeModule = requireOptionalNativeModule<NativeBackgroundTasksModule>(
  'NativeBackgroundTasks',
);

/**
 * WeLiNo fork: iOS has no NativeBackgroundTasks implementation (the module
 * is Android-only). Fall back to a no-op so importing the download queue /
 * schedulers doesn't crash on iOS. Background downloads and scheduled
 * library updates are inert on iOS until a native module lands.
 * See docs/IOS_PORT.md.
 */
const noopModule: NativeBackgroundTasksModule = {
  async enqueue() {
    // No native queue on this platform — hand back a throwaway id.
    return `noop-${Date.now()}`;
  },
  async getTasks() {
    return [];
  },
  async getTask() {
    return null;
  },
  async pause() {},
  async resume() {},
  async cancel() {},
  async updateProgress() {},
  async updateCheckpoint() {},
  async complete() {},
  async fail() {},
  async scheduleLibraryUpdates() {},
  async cancelLibraryUpdates() {},
  async scheduleAutomaticBackups() {},
  async cancelAutomaticBackups() {},
};

export default nativeModule ?? noopModule;
