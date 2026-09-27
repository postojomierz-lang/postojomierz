// The armies' nations. Stats are the same for everyone; a nation changes how its soldiers,
// vehicles, aircraft and headquarters look (see src/render/models.js) and the colour of its
// plastic (an id from TEAM_COLORS in catalog.js), after its uniforms or its flag.
export const NATIONS = [
  { id: 'us', name: 'United States', adj: 'American', color: 'green' },     // the classic army men
  { id: 'de', name: 'Germany', adj: 'German', color: 'grey' },              // feldgrau
  { id: 'su', name: 'Soviet Union', adj: 'Soviet', color: 'red' },          // the Red Army
  { id: 'gb', name: 'Great Britain', adj: 'British', color: 'tan' },        // khaki
  { id: 'jp', name: 'Japan', adj: 'Japanese', color: 'white' },             // the flag's white field
  { id: 'fr', name: 'France', adj: 'French', color: 'blue' },               // bleu horizon
  { id: 'it', name: 'Italy', adj: 'Italian', color: 'black' },              // the Blackshirts
];
export const nationById = id => NATIONS.find(n => n.id === id) || NATIONS[0];
// opponents for an army of `mine`: the other nations in turn (or the same one if it is the only one)
export function enemyNations(mine, n, choice = 'auto') {
  if (choice !== 'auto' && NATIONS.some(x => x.id === choice)) return Array(n).fill(choice);
  const others = NATIONS.filter(x => x.id !== mine).map(x => x.id);
  return Array.from({ length: n }, (_, i) => others.length ? others[i % others.length] : mine);
}
