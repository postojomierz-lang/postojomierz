// Battlefields designed by Claude, from a text description or a photo of a real floor/table.
// Runs in the browser with the player's own API key (stored only in their browser).
import { THEMES, STYLES } from './sim/map.js';

let sdk = null;
async function loadSDK() {
  sdk ||= import('@anthropic-ai/sdk').then(m => m.default || m.Anthropic);
  return sdk;
}

const ALL_STYLES = [...STYLES.tall, ...STYLES.low, ...STYLES.water];
const LAYOUT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['title', 'briefing', 'theme', 'floorColor', 'objects', 'decor'],
  properties: {
    title: { type: 'string' },
    briefing: { type: 'string' },
    theme: { type: 'string', enum: THEMES },
    floorColor: { type: 'string' },
    objects: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['kind', 'style', 'label', 'x', 'y', 'w', 'h'],
        properties: {
          kind: { type: 'string', enum: ['tall', 'low', 'water'] },
          style: { type: 'string', enum: ALL_STYLES },
          label: { type: 'string' },
          x: { type: 'integer' }, y: { type: 'integer' }, w: { type: 'integer' }, h: { type: 'integer' },
        },
      },
    },
    decor: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['kind', 'x', 'y'],
        properties: { kind: { type: 'string', enum: ['palm', 'pine', 'bush'] }, x: { type: 'integer' }, y: { type: 'integer' } },
      },
    },
  },
};

function systemPrompt(W, H, zones) {
  return `You lay out battlefields for "Plastic Front", a game where armies of plastic toy soldiers fight on real household surfaces.

The battlefield is a grid of ${W} columns (x = 0..${W - 1}, left to right) by ${H} rows (y = 0..${H - 1}, top to bottom), seen from above. One cell is about 5 cm: a toy soldier stands on one cell.

Household objects are rectangles (x, y = top-left cell; w, h = size in cells) of one kind:
- tall: blocks movement and line of sight. Styles: ${STYLES.tall.join(', ')}. Typical sizes: mug/bottle/bucket/pot 2x2 to 3x3, books 4x3 to 6x4, boxes 3x3 to 6x5, lego 2x2 to 4x2, rock 2x2 to 3x3.
- low: blocks movement but soldiers can shoot over it. Long and 1 cell thin (w=1 or h=1). Styles: ${STYLES.low.join(', ')}. Length 3 to 8.
- water: spills and puddles, only amphibians cross them. Styles: ${STYLES.water.join(', ')}. Size 3x3 to 10x8.
Decorations (palm, pine, bush) are single points and do not block anything.

These army deployment zones must stay completely free of objects (keep one empty cell around them too): ${zones.map(z => `x ${z.x}..${z.x + z.w - 1}, y ${z.y}..${z.y + z.h - 1}`).join('; ')}.
Objects must not overlap. Leave open lanes between the zones so armies can reach each other, and cover roughly 10-25% of the open middle with objects.

Also choose the floor theme closest to the surface (${THEMES.join(', ')}), its main colour as a hex string like #b98a55, a short punchy battle title and a 1-2 sentence briefing in a war-movie voice from the toys' point of view. Keep it kid-friendly.`;
}

async function shrinkImage(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85).split(',')[1];
}

// Returns a layout object for makeMap({ layout }).
export async function designBattlefield({ apiKey, model, map, prompt, photo }) {
  const Anthropic = await loadSDK();
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const content = [];
  if (photo) {
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: await shrinkImage(photo) } });
    content.push({ type: 'text', text: `This is a photo of a real surface the player wants to fight on. Identify the objects on it and recreate its layout on the ${map.W}x${map.H} grid as seen from above: keep objects in the same relative positions and proportions (stretch the photo's play area over the whole grid), map each object to the closest style, and read the floor colour from the photo. Move anything that would land in a deployment zone just outside it.${prompt ? ' The player adds: ' + prompt : ''}` });
  } else {
    content.push({ type: 'text', text: prompt ? `Design this battlefield: ${prompt}` : 'Surprise the player with an imaginative household battlefield.' });
  }
  const params = {
    model, max_tokens: 16000,
    system: systemPrompt(map.W, map.H, map.zones),
    messages: [{ role: 'user', content }],
    output_config: { format: { type: 'json_schema', schema: LAYOUT_SCHEMA } },
  };
  if (model !== 'claude-haiku-4-5') params.output_config.effort = 'medium';
  let msg;
  if (model === 'claude-opus-5') {
    // if Opus declines, the API retries the request on another model instead of failing
    try { msg = await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }); }
    catch (e) { if (e instanceof Anthropic.BadRequestError) msg = await client.messages.create(params); else throw e; }
  } else msg = await client.messages.create(params);
  if (msg.stop_reason === 'refusal') throw new Error('Claude declined to design this battlefield. Try another description or photo.');
  if (msg.stop_reason === 'max_tokens') throw new Error('The answer was cut off before it finished.');
  const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return JSON.parse(text);
}

export async function explainError(e) {
  try {
    const A = await loadSDK();
    if (e instanceof A.AuthenticationError) return 'the API key was rejected';
    if (e instanceof A.PermissionDeniedError) return 'this API key may not use that model';
    if (e instanceof A.NotFoundError) return 'that model is not available to this key';
    if (e instanceof A.RateLimitError) return 'rate limited, try again in a moment';
    if (e instanceof A.APIConnectionError) return 'could not reach the Claude API';
    if (e instanceof A.APIError) return e.message;
  } catch {}
  return e && e.message ? e.message : String(e);
}
