import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTaste,
  humorProfile,
  rankForYou,
  reasonFor,
  splitStyledPrompt,
  topicsOf,
  withStyle,
} from '../src/lib/taste.ts'

const NOW = Date.parse('2026-11-22T12:00:00Z')
let nextId = 1
const make = (prompt, style, extra = {}) => ({
  id: nextId++,
  prompt,
  caption: `caption about ${prompt}`,
  style,
  upvotes: 0,
  downvotes: 0,
  created_at: '2026-11-20T12:00:00Z',
  ...extra,
})

test('style is added for the AI and can be read back', () => {
  const input = withStyle('Waiting in the Butler line at 1am', 'sarcastic')
  assert.match(input, /Humor style: Sarcastic/)
  assert.deepEqual(splitStyledPrompt(input), {
    situation: 'Waiting in the Butler line at 1am',
    style: 'sarcastic',
  })
  assert.deepEqual(splitStyledPrompt('plain prompt'), { situation: 'plain prompt', style: null })
  assert.equal(withStyle('x', null), 'x')
})

test('topics are found from campus words', () => {
  assert.deepEqual(topicsOf('Waiting in the Butler Library line before finals'), ['butler', 'exams'])
  assert.deepEqual(topicsOf('My roommate ate my Ferris pizza'), ['food', 'dorms'])
  assert.deepEqual(topicsOf('Nothing in particular'), [])
})

test('votes teach the feed, and it explains why', () => {
  const liked = [
    make('Butler at 2am', 'sarcastic'),
    make('Butler wifi died', 'sarcastic'),
    make('Butler seats all taken', 'sarcastic'),
  ]
  const passed = [make('the 1 train is late', 'wholesome'), make('subway again', 'wholesome')]
  const votes = Object.fromEntries([
    ...liked.map((c) => [c.id, 1]),
    ...passed.map((c) => [c.id, -1]),
  ])
  const taste = buildTaste([...liked, ...passed], votes)
  assert.equal(taste.votes, 5)
  assert.equal(taste.laughs, 3)

  const fresh = [
    make('subway delays', 'wholesome', { upvotes: 4, downvotes: 0 }),
    make('Butler printer jammed', 'sarcastic'),
  ]
  const ranked = rankForYou(fresh, taste, NOW)
  assert.equal(ranked[0].prompt, 'Butler printer jammed')
  assert.equal(
    reasonFor(ranked[0], taste),
    'Because you laugh at sarcastic captions about Butler & libraries'
  )

  const profile = humorProfile(taste)
  assert.equal(profile.headline, 'You laugh most at sarcastic captions about Butler & libraries.')
  assert.deepEqual(profile.loves.map((t) => t.text), ['🙄 Sarcastic', '📚 Butler & libraries'])
  assert.deepEqual(profile.passes.map((t) => t.text), ['🥹 Wholesome', '🚇 NYC life'])
})

test('with no votes there is no profile and popular captions rise', () => {
  const taste = buildTaste([], {})
  assert.equal(humorProfile(taste).headline, null)
  const crowd = make('anything', null, { upvotes: 8, downvotes: 1 })
  const quiet = make('anything else', null)
  assert.equal(rankForYou([quiet, crowd], taste, NOW)[0], crowd)
  assert.equal(reasonFor(crowd, taste), 'Crowd favorite: 89% laughed')
})
