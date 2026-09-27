// The armies' nations. Stats are the same for everyone; a nation changes how its soldiers,
// vehicles, aircraft and headquarters look (see src/render/models.js). More are on the way.
export const NATIONS = [
  { id: 'us', name: 'United States', adj: 'American' },
  { id: 'de', name: 'Germany', adj: 'German' },
  { id: 'su', name: 'Soviet Union', adj: 'Soviet' },
];
export const nationById = id => NATIONS.find(n => n.id === id) || NATIONS[0];
// opponents for an army of `mine`: the other nations in turn (or the same one if it is the only one)
export function enemyNations(mine, n, choice = 'auto') {
  if (choice !== 'auto' && NATIONS.some(x => x.id === choice)) return Array(n).fill(choice);
  const others = NATIONS.filter(x => x.id !== mine).map(x => x.id);
  return Array.from({ length: n }, (_, i) => others.length ? others[i % others.length] : mine);
}
