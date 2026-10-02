import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, SessionUsage } from 'claude-code'

import { applyUpdate, estimateLeft, formatLeft, formatWeek, nextLine, withLine, withSteps } from '../hooks/register'
import type { PostepRun } from '../types'

const MIN = 60_000

/** The world beneath the plugin: usage readings, tools, turns, toasts and sounds. */
const world = (on: On) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  const seen = { week: 10, toasts: [] as string[], sounds: 0, nextId: 1 }

  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: {} as SessionUsage['context'],
      rateLimits: [{ kind: 'seven_day', percentUsed: seen.week }],
    },
  }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>silnik</Text>
  })
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'intro', scope: 'shared' as const }] }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.toast', ($, e) => {
    seen.toasts.push(e.text)

    return { value: undefined }
  })
  on('audio.play', () => {
    seen.sounds += 1

    return { value: undefined }
  })
  on('tool.call', ($, e) => {
    if (e.tool === 'TaskCreate') {
      return { result: { task: { id: String(seen.nextId++), subject: e.subject } } }
    }

    if (e.tool === 'TaskUpdate') {
      return { result: { success: true, taskId: e.taskId, updatedFields: ['status'] } }
    }

    return { result: { oldTodos: [], newTodos: [] } }
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))

  return { clock, seen }
}

const finishTurn = ($: Engine, isAborted = false) =>
  $.turn.complete({
    answer: 'gotowe',
    durationMs: 1,
    isAborted,
    turnId: 't1',
    reason: isAborted ? 'aborted' : 'answer',
  })

const band = ($: Engine, surface: 'terminal' | 'desktop') =>
  $.ui.mount({
    plugin: 'postep',
    surface,
    component: 'AbovePrompt',
    props: {
      hasSurvey: false,
      isWorking: true,
      maxRows: 10,
      bodyColumns: 100,
      scroll: { offset: 0, bodyRows: 10, contentRows: 0 },
      view: {},
    } as never,
  })

const text = async (ui: { drawn: () => Promise<unknown> }) => JSON.stringify(await ui.drawn())

describe('postęp zadania', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`pasek, szacunek czasu i zakończenie (${surface})`, async ($, on) => {
      const { clock, seen } = world(on)

      await $.prompt.submit({ text: 'zbuduj grę', origin: { kind: 'composer' }, wait: false })
      for (const subject of ['Analiza', 'Zmiana', 'Build', 'Push']) {
        await $.tool.call({ tool: 'TaskCreate', subject, description: subject, activeForm: `Robię: ${subject}` })
      }
      await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'in_progress' })
      await clock.advance(2 * MIN)
      await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' })
      await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'in_progress' })
      seen.week = 10.4
      await clock.advance(2_000)

      const ui = await band($, surface)
      const drawn = await text(ui)
      expect(drawn).toContain('1/4')
      expect(drawn).toContain('25%')
      expect(drawn).toContain('~6 min')
      expect(drawn).toContain('Robię: Zmiana')
      expect(drawn).toContain('limit tyg. +0.4%')

      await finishTurn($)
      await ui.redraw()
      expect(await text(ui)).toContain('✓ Gotowe')
      expect(seen.toasts.join()).toContain('🟢 Gotowe: 1/4 kroków')
      expect(seen.sounds).toBe(1)
    })
  }

  test('jednokrokowe zadanie nie pokazuje paska ani dymka', async ($, on) => {
    const { seen } = world(on)

    await $.prompt.submit({ text: 'pytanie', origin: { kind: 'composer' }, wait: false })
    await $.tool.call({ tool: 'TaskCreate', subject: 'Jedno', description: 'Jedno' })
    const ui = await band($, 'terminal')
    expect(await text(ui)).toContain('silnik')
    await finishTurn($)
    expect(seen.toasts).toEqual([])
    expect(seen.sounds).toBe(0)
  })

  test('TodoWrite też liczy kroki, przerwanie bez dźwięku', async ($, on) => {
    const { seen } = world(on)

    await $.prompt.submit({ text: 'zadanie', origin: { kind: 'composer' }, wait: false })
    await $.tool.call({
      tool: 'TodoWrite',
      todos: [
        { content: 'A', status: 'completed', activeForm: 'A' },
        { content: 'B', status: 'in_progress', activeForm: 'Robię B' },
        { content: 'C', status: 'pending', activeForm: 'C' },
      ],
    })
    const ui = await band($, 'terminal')
    expect(await text(ui)).toContain('1/3')
    await finishTurn($, true)
    await ui.redraw()
    expect(await text(ui)).toContain('Przerwane')
    expect(seen.sounds).toBe(0)
  })

  test('/postep wyłącza pasek i instrukcję planowania', async ($, on) => {
    world(on)

    const off = await $.command.run({
      command: 'postep',
      args: 'off',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 100 },
    } as never)
    expect(off.text).toContain('wyłączony')
    const composed = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] })
    expect(composed.sections.map(section => section.id)).not.toContain('postep:plan')

    await $.command.run({
      command: 'postep',
      args: '',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 100 },
    } as never)
    const again = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] })
    expect(again.sections.map(section => section.id)).toContain('postep:plan')
  })

  test('/postep czat on|off nie rusza paska', async ($, on) => {
    world(on)

    const quiet = await $.command.run({
      command: 'postep',
      args: 'czat on',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 100 },
    } as never)
    expect(quiet.text).toBe('Postęp w czacie włączony.')
    const composed = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] })
    expect(composed.sections.map(section => section.id)).toContain('postep:plan')
  })
})

describe('obliczenia', () => {
  const base: PostepRun = {
    startedAt: 0,
    lastDoneAt: null,
    doneCount: 0,
    now: 0,
    steps: [],
    weekStart: 10,
    weekNow: 10,
    state: 'working',
    finishedAt: null,
  }
  const steps = (done: number, total: number) =>
    Array.from({ length: total }, (_, i) => ({
      id: String(i),
      subject: `s${i}`,
      status: i < done ? ('completed' as const) : ('pending' as const),
    }))

  test('szacunek: średni czas kroku razy kroki do zrobienia', () => {
    const run = withSteps(withSteps(base, steps(0, 5), 0), steps(2, 5), 4 * MIN)
    expect(estimateLeft(run)).toBe(6 * MIN)
    expect(estimateLeft({ ...run, now: 5 * MIN })).toBe(5 * MIN)
    expect(formatLeft(estimateLeft(run))).toBe('~6 min')
    expect(formatLeft(null)).toBe('szacuję…')
  })

  test('limit tygodniowy', () => {
    expect(formatWeek(base)).toBe('limit tyg. <0.1%')
    expect(formatWeek({ ...base, weekNow: 10.6 })).toBe('limit tyg. +0.6%')
    expect(formatWeek({ ...base, weekStart: null })).toBe(null)
  })

  test('linia pod odpowiedzią tylko przy postępie, krótka, podsumowanie raz', () => {
    const fresh = { done: 0, isSummarized: false }
    const none = withSteps(base, steps(0, 2), 0)
    expect(nextLine(none, MIN, fresh)).toBe(null)

    const half = withSteps(none, steps(1, 2), 3 * MIN)
    expect(nextLine(half, 3 * MIN, fresh)).toBe('🟡 1/2 · ~3 min · 3:00')
    expect(nextLine(half, 3 * MIN, { done: 1, isSummarized: false })).toBe(null)
    expect(nextLine({ ...half, weekNow: 10.3 }, 3 * MIN, fresh)).toBe('🟡 1/2 · ~3 min · 3:00 · limit tyg. +0.3%')

    const done = { ...withSteps(half, steps(2, 2), 5 * MIN), weekNow: 10.5 }
    expect(nextLine(done, 5 * MIN, { done: 1, isSummarized: false })).toBe(
      '🟢 Gotowe: 2/2 kroków w 5:00 · limit tyg. +0.5%',
    )
    expect(nextLine(done, 5 * MIN, { done: 2, isSummarized: true })).toBe(null)
  })

  test('spóźnione in_progress nie cofa zrobionego kroku', () => {
    const one = [{ id: '1', subject: 'A', status: 'completed' as const }]
    expect(applyUpdate(one, { taskId: '1', status: 'in_progress' })[0]?.status).toBe('completed')
    expect(applyUpdate(one, { taskId: '1', subject: 'B' })[0]?.subject).toBe('B')
  })

  test('linia trafia pod ostatni blok tekstu', () => {
    const content = [
      { type: 'text', text: 'Najpierw.' },
      { type: 'text', text: 'Potem.' },
      { type: 'tool_use', id: 't', name: 'Bash', input: {} },
    ]
    expect(withLine(content, 'L')).toEqual([
      { type: 'text', text: 'Najpierw.' },
      { type: 'text', text: 'Potem.\n\nL' },
      { type: 'tool_use', id: 't', name: 'Bash', input: {} },
    ])
    expect(withLine([{ type: 'tool_use' }], 'L')).toEqual([{ type: 'tool_use' }])
    expect(withLine([{ type: 'text', text: 'Dwa.\n\n🟡 1/3 · 0:40' }], '🟡 2/3')).toEqual([{ type: 'text', text: 'Dwa.\n\n🟡 2/3' }])
    expect(withLine([{ type: 'text', text: 'Raz.\n\n⏱ ███ 1/3 · 0:40' }], '⏱ 2/3')).toEqual([
      { type: 'text', text: 'Raz.\n\n⏱ 2/3' },
    ])
  })
})
