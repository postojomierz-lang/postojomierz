// Online play over WebRTC. PeerJS's free public broker only introduces the browsers to each other;
// after that every message goes directly between players. One player hosts: everyone connects to
// the host, and the host relays (a star). Messages are small JSON objects.
import { Peer } from 'peerjs';

const PREFIX = 'plasticfront-v1-';
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I lookalikes
export function makeCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  return s;
}
export const cleanCode = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

// ?localnet: players are tabs of one browser talking over a BroadcastChannel instead of WebRTC
// (same messages; handy for testing on one machine without the internet).
const LOCAL = typeof location !== 'undefined' && new URLSearchParams(location.search).has('localnet');
const localId = () => 'tab-' + Math.random().toString(36).slice(2, 10);

// ---- ICE servers: how two browsers find a path to each other ----------------------------------
// STUN lets them connect directly through most home routers. When a network forbids that
// (some corporate, school or mobile networks), a TURN server relays the (tiny) game messages.
// Default relay: the free Open Relay by Metered (https://www.metered.ca/tools/openrelay/) in its
// "static auth" mode: short-lived credentials are the standard TURN REST scheme, an HMAC-SHA1 of
// "<expiry>:<name>" with the relay's published secret, computed right here in the browser.
// net: { relay: 'auto' | 'always' | 'off', turnUrls, turnUser, turnPass, meteredApp, meteredKey }
const OPEN_RELAY = { host: 'staticauth.openrelay.metered.ca', secret: 'openrelayprojectsecret' };
async function hmacSha1Base64(secret, text) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
  let bin = ''; for (const b of sig) bin += String.fromCharCode(b);
  return btoa(bin);
}
export async function iceConfig(net = {}) {
  const iceServers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.relay.metered.ca:80'] }];
  if (net.relay !== 'off') {
    const urls = (net.turnUrls || '').split(/[\s,]+/).filter(u => /^turns?:/.test(u));
    if (urls.length) iceServers.push({ urls, username: net.turnUser || '', credential: net.turnPass || '' });   // your own relay
    else if (net.meteredApp && net.meteredKey) {                                                               // your Metered account
      try {
        const r = await fetch(`https://${encodeURIComponent(net.meteredApp)}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(net.meteredKey)}`);
        if (r.ok) iceServers.push(...await r.json());
      } catch (e) { console.warn('Metered TURN credentials:', e); }
    } else {                                                                                                   // free Open Relay
      const username = `${Math.floor(Date.now() / 1000) + 24 * 3600}:plasticfront`;
      const credential = await hmacSha1Base64(OPEN_RELAY.secret, username);
      const h = OPEN_RELAY.host;
      iceServers.push({ urls: [`turn:${h}:80`, `turn:${h}:80?transport=tcp`, `turn:${h}:443`, `turns:${h}:443?transport=tcp`], username, credential });
    }
  }
  return { iceServers, iceTransportPolicy: net.relay === 'always' ? 'relay' : 'all' };
}

// How did this connection end up: directly between the two browsers, or through the relay?
export async function routeOf(conn) {
  try {
    const stats = await conn.peerConnection.getStats();
    let pair = null;
    stats.forEach(s => { if (s.type === 'transport' && s.selectedCandidatePairId) pair = stats.get(s.selectedCandidatePairId); });
    if (!pair) stats.forEach(s => { if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') pair = s; });
    if (!pair) return '';
    const loc = stats.get(pair.localCandidateId), rem = stats.get(pair.remoteCandidateId);
    return (loc && loc.candidateType === 'relay') || (rem && rem.candidateType === 'relay') ? 'relay' : 'direct';
  } catch { return ''; }
}

function openPeer(id, config) {
  return new Promise((resolve, reject) => {
    const opts = { config };
    const peer = id ? new Peer(id, opts) : new Peer(opts);
    const t = setTimeout(() => { peer.destroy(); reject(new Error('the connection service did not answer')); }, 15000);
    peer.on('open', () => { clearTimeout(t); resolve(peer); });
    peer.on('error', e => { clearTimeout(t); reject(e); });
  });
}

// The host: accepts players, receives their messages and can send to one or all.
export class Host {
  constructor({ onHello, onMessage, onLeave, net }) {
    Object.assign(this, { onHello, onMessage, onLeave, net });
    this.conns = new Map();   // peer id -> DataConnection
  }
  async open() {
    if (LOCAL) {
      this.code = makeCode();
      this.ch = new BroadcastChannel('plasticfront-' + this.code);
      this.ch.onmessage = ({ data: d }) => {
        if (d.to !== 'host') return;
        if (d.kind === 'hello' && !this.conns.has(d.from)) { this.conns.set(d.from, { open: true, send: m => this.ch.postMessage({ to: d.from, msg: m }), close: () => this.ch.postMessage({ to: d.from, kind: 'bye' }) }); this.onHello(d.from, d.msg); }
        else if (d.kind === 'bye') { if (this.conns.delete(d.from)) this.onLeave(d.from); }
        else if (this.conns.has(d.from)) this.onMessage(d.from, d.msg);
      };
      return this.code;
    }
    const config = await iceConfig(this.net);
    for (let attempt = 0; attempt < 4; attempt++) {
      this.code = makeCode();
      try { this.peer = await openPeer(PREFIX + this.code, config); break; }
      catch (e) { if (e.type !== 'unavailable-id' || attempt === 3) throw e; }
    }
    this.peer.on('connection', conn => {
      conn.on('data', msg => {
        if (msg && msg.t === 'hello' && !this.conns.has(conn.peer)) { this.conns.set(conn.peer, conn); this.onHello(conn.peer, msg); }
        else if (this.conns.has(conn.peer)) this.onMessage(conn.peer, msg);
      });
      const gone = () => { if (this.conns.delete(conn.peer)) this.onLeave(conn.peer); };
      conn.on('close', gone); conn.on('error', gone);
    });
    return this.code;
  }
  route(id) { const c = this.conns.get(id); return c && c.peerConnection ? routeOf(c) : Promise.resolve(''); }
  send(id, msg) { const c = this.conns.get(id); if (c && c.open) c.send(msg); }
  broadcast(msg) { for (const c of this.conns.values()) if (c.open) c.send(msg); }
  kick(id) { const c = this.conns.get(id); if (c) c.close(); }
  close() {
    if (this.ch) { this.ch.postMessage({ to: '*', kind: 'bye' }); this.ch.close(); }
    if (this.peer) this.peer.destroy();
  }
}

// A player joining someone's game.
export class Client {
  constructor({ onMessage, onClose, net }) { Object.assign(this, { onMessage, onClose, net }); }
  route() { return this.conn && this.conn.peerConnection ? routeOf(this.conn) : Promise.resolve(''); }
  async join(code, hello) {
    if (LOCAL) {
      const id = localId();
      this.ch = new BroadcastChannel('plasticfront-' + cleanCode(code));
      this.ch.onmessage = ({ data: d }) => {
        if (d.to !== id && d.to !== '*') return;
        if (d.kind === 'bye') this.onClose(); else this.onMessage(d.msg);
      };
      this.conn = { open: true, send: m => this.ch.postMessage({ to: 'host', from: id, msg: m }) };
      this.ch.postMessage({ to: 'host', from: id, kind: 'hello', msg: { t: 'hello', ...hello } });
      this.id = id;
      return;
    }
    this.peer = await openPeer(null, await iceConfig(this.net));
    return new Promise((resolve, reject) => {
      const conn = this.peer.connect(PREFIX + cleanCode(code), { reliable: true });
      const t = setTimeout(() => reject(new Error('no game with that code answered')), 15000);
      conn.on('open', () => { clearTimeout(t); this.conn = conn; conn.send({ t: 'hello', ...hello }); resolve(); });
      conn.on('data', msg => this.onMessage(msg));
      conn.on('close', () => this.onClose());
      conn.on('error', e => { clearTimeout(t); reject(e); });
      this.peer.on('error', e => { clearTimeout(t); reject(e); });
    });
  }
  send(msg) { if (this.conn && this.conn.open) this.conn.send(msg); }
  close() {
    if (this.ch) { this.ch.postMessage({ to: 'host', from: this.id, kind: 'bye' }); this.ch.close(); }
    if (this.peer) this.peer.destroy();
  }
}
