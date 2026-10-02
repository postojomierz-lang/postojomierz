import { atom, read, update } from 'claude-code'
import type { EngineInterface, PromptOrigin, Register, SessionRateLimit, Timer } from 'claude-code'

import type { PostepRun, PostepStep } from '../types'

const run = atom({ plugin: 'postep', key: 'run' } as const, null)
const isHidden = atom({ plugin: 'postep', key: 'isHidden' } as const, false)

const COMMAND = 'postep'
const TICK_MS = 2000
const MIN_STEPS = 2

/** Prompts that come from the owner, not from a notification, a peer or a timer. */
const OWNER_ORIGINS: ReadonlySet<PromptOrigin['kind']> = new Set(['composer', 'bridge', 'sdk', 'unclassified'])

const PLAN_SECTION = {
  id: 'postep:plan',
  scope: 'session',
  text: [
    '# Progress tracking',
    'When the user gives you a task that takes several distinct steps, write the steps down first with the task tools ' +
      '(TaskCreate for each step, or TodoWrite), then keep them current: mark a step in_progress when you start it and ' +
      'completed as soon as it is done, and add steps you discover along the way. The user watches a progress bar and a ' +
      'time estimate built from this list. Skip the list for questions and one-step tasks.',
  ].join('\n'),
} as const

export const weekPercent = (limits: readonly SessionRateLimit[]): number | null =>
  limits.find(limit => limit.kind === 'seven_day')?.percentUsed ?? null

export const countDone = (steps: readonly PostepStep[]): number =>
  steps.filter(step => step.status === 'completed').length

/** Applies a new list of steps, noting when the count of completed ones grew. */
export const withSteps = (current: PostepRun, steps: PostepStep[], now: number): PostepRun => {
  const done = countDone(steps)
  const hasGrown = done > current.doneCount

  return {
    ...current,
    steps,
    now,
    doneCount: done,
    lastDoneAt: hasGrown ? now : done === 0 ? null : current.lastDoneAt,
  }
}

/** Milliseconds left: the average time per completed step times the steps left. */
export const estimateLeft = (current: PostepRun): number | null => {
  const total = current.steps.length
  const done = countDone(current.steps)

  if (current.lastDoneAt === null || current.doneCount === 0 || done >= total) {
    return null
  }

  const perStep = (current.lastDoneAt - current.startedAt) / current.doneCount
  const sinceLast = current.now - current.lastDoneAt

  return Math.max(0, perStep * (total - done) - sinceLast)
}

export const formatClock = (ms: number): string => {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = String(seconds % 60).padStart(2, '0')

  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

export const formatLeft = (ms: number | null): string => {
  if (ms === null) {
    return 'szacuję…'
  }

  const minutes = Math.round(ms / 60000)

  return minutes < 1 ? '~<1 min' : `~${minutes} min`
}

export const formatWeek = (current: PostepRun): string | null => {
  if (current.weekStart === null || current.weekNow === null) {
    return null
  }

  const delta = current.weekNow - current.weekStart

  return delta < 0.1 ? 'limit tyg. <0.1%' : `limit tyg. +${delta.toFixed(1)}%`
}

export const bar = (done: number, total: number, width: number): string => {
  const filled = total === 0 ? 0 : Math.round((done / total) * width)

  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

const currentStep = (current: PostepRun): PostepStep | undefined =>
  current.steps.find(step => step.status === 'in_progress') ??
  current.steps.find(step => step.status === 'pending')

let tick: Timer | undefined

const stopTicking = () => {
  tick?.cancel()
  tick = undefined
}

/** The weekly limit used now, in percent; null where there is no reading. */
async function readWeek($: EngineInterface): Promise<number | null> {
  try {
    return weekPercent((await $.session.usage()).rateLimits)
  } catch {
    return null
  }
}

async function measure($: EngineInterface) {
  const week = await readWeek($)
  const now = await $.clock.now()

  await update($, run, current =>
    current === null || current.state !== 'working'
      ? current
      : { ...current, now, weekNow: week ?? current.weekNow, weekStart: current.weekStart ?? week },
  )
}

async function setSteps($: EngineInterface, change: (steps: PostepStep[]) => PostepStep[]) {
  const now = await $.clock.now()

  await update($, run, current =>
    current === null || current.state !== 'working' ? current : withSteps(current, change(current.steps), now),
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Włącza lub wyłącza pasek postępu zadania (/postep on, /postep off)',
    })
    const stored = await $.store.get('isHidden')
    await update($, isHidden, () => stored === true)

    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const wasHidden = await read($, isHidden)
    const hide = arg === 'off' ? true : arg === 'on' ? false : !wasHidden

    await update($, isHidden, () => hide)
    await $.store.set('isHidden', hide)

    return { text: hide ? 'Pasek postępu wyłączony.' : 'Pasek postępu włączony.' }
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)

    if (await read($, isHidden)) {
      return composed
    }

    return { ...composed, sections: [...composed.sections, PLAN_SECTION] }
  })

  on('prompt.submit', async ($, e, next) => {
    // A message typed into a running turn continues the same task.
    if (OWNER_ORIGINS.has(e.origin.kind) && e.turnId === undefined) {
      const now = await $.clock.now()
      const week = await readWeek($)
      const fresh: PostepRun = {
        startedAt: now,
        lastDoneAt: null,
        doneCount: 0,
        now,
        steps: [],
        weekStart: week,
        weekNow: week,
        state: 'working',
        finishedAt: null,
      }

      await update($, run, () => fresh)
      stopTicking()
      tick = $.clock.every(TICK_MS, () => void measure($))
    }

    return next(e)
  })

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)

    if (e.agentId === undefined && ran.deny === undefined && ran.isError !== true) {
      await setSteps($, () =>
        e.todos.map((todo, index) => ({
          id: `todo-${index}`,
          subject: todo.content,
          activeForm: todo.activeForm,
          status: todo.status,
        })),
      )
    }

    return ran
  })

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)

    if (e.agentId === undefined && ran.deny === undefined && ran.isError !== true) {
      const id = ran.result.task.id
      const step: PostepStep = { id, subject: e.subject, activeForm: e.activeForm, status: 'pending' }
      await setSteps($, steps => [...steps.filter(one => one.id !== id), step])
    }

    return ran
  })

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)

    if (e.agentId === undefined && ran.deny === undefined && ran.isError !== true && ran.result.success) {
      await setSteps($, steps => {
        if (e.status === 'deleted') {
          return steps.filter(step => step.id !== e.taskId)
        }

        const known = steps.some(step => step.id === e.taskId)
        const base = known
          ? steps
          : [...steps, { id: e.taskId, subject: e.subject ?? `krok ${e.taskId}`, status: 'pending' as const }]

        const status = e.status

        return base.map(step =>
          step.id === e.taskId
            ? {
                ...step,
                subject: e.subject ?? step.subject,
                activeForm: e.activeForm ?? step.activeForm,
                status: status ?? step.status,
              }
            : step,
        )
      })
    }

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)

    if (e.agentId !== undefined) {
      return result
    }

    const current = await read($, run)

    if (current === null || current.state !== 'working') {
      return result
    }

    stopTicking()
    await measure($)
    const now = await $.clock.now()
    const measured = (await read($, run)) ?? current

    if (measured.steps.length < MIN_STEPS) {
      await update($, run, () => null)

      return result
    }

    const finished: PostepRun = {
      ...measured,
      now,
      finishedAt: now,
      state: e.isAborted ? 'aborted' : 'done',
    }
    await update($, run, () => finished)

    if (!e.isAborted && !(await read($, isHidden))) {
      const week = formatWeek(finished)
      const done = countDone(finished.steps)
      $.ui.toast(
        `✓ Gotowe: ${done}/${finished.steps.length} kroków w ${formatClock(now - finished.startedAt)}` +
          (week === null ? '' : ` · ${week}`),
      )
      void $.audio.play({ asset: 'sounds/done.wav' }).catch(() => undefined)
    }

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, run)

    if (e.props.hasSurvey || current === null || current.steps.length < MIN_STEPS || (await read($, isHidden))) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const total = current.steps.length
    const done = countDone(current.steps)
    const percent = Math.round((done / total) * 100)
    const width = Math.max(8, Math.min(24, e.props.bodyColumns - 60))
    const week = formatWeek(current)
    const elapsed = formatClock((current.finishedAt ?? current.now) - current.startedAt)

    if (current.state !== 'working') {
      const label = current.state === 'done' ? '✓ Gotowe' : '■ Przerwane'

      return (
        <Box flexDirection="column">
          <Text color={current.state === 'done' ? 'green' : 'yellow'} wrap="truncate-end">
            {label} · {done}/{total} kroków · {elapsed}
            {week === null ? '' : ` · ${week}`}
          </Text>
        </Box>
      )
    }

    const step = currentStep(current)
    const details = [`${done}/${total}`, `${percent}%`, formatLeft(estimateLeft(current)), elapsed, week].filter(
      (part): part is string => part !== null,
    )

    return (
      <Box flexDirection="column">
        <Text wrap="truncate-end">
          <Text color="cyan">{bar(done, total, width)}</Text> {details.join(' · ')}
        </Text>
        {step !== undefined && (
          <Text dimColor wrap="truncate-end">
            ▸ {step.status === 'in_progress' ? (step.activeForm ?? step.subject) : `dalej: ${step.subject}`}
          </Text>
        )}
      </Box>
    )
  })
}
