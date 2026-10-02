export type PostepStatus = 'pending' | 'in_progress' | 'completed'

export type PostepStep = {
  id: string
  subject: string
  activeForm?: string
  status: PostepStatus
}

export type PostepRun = {
  startedAt: number
  /** When the last step was completed (for the time estimate). */
  lastDoneAt: number | null
  /** How many steps were completed by the time of lastDoneAt. */
  doneCount: number
  now: number
  steps: PostepStep[]
  /** Weekly limit (seven_day) used, in percent, when the task started. */
  weekStart: number | null
  weekNow: number | null
  state: 'working' | 'done' | 'aborted'
  finishedAt: number | null
}

declare module 'claude-code' {
  interface PluginState {
    postep: { run: PostepRun | null; isHidden: boolean }
  }
}
