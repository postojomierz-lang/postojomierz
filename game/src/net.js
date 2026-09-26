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

function openPeer(id) {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id) : new Peer();
    const t = setTimeout(() => { peer.destroy(); reject(new Error('the connection service did not answer')); }, 15000);
    peer.on('open', () => { clearTimeout(t); resolve(peer); });
    peer.on('error', e => { clearTimeout(t); reject(e); });
  });
}

// The host: accepts players, receives their messages and can send to one or all.
export class Host {
  constructor({ onHello, onMessage, onLeave }) {
    Object.assign(this, { onHello, onMessage, onLeave });
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
    for (let attempt = 0; attempt < 4; attempt++) {
      this.code = makeCode();
      try { this.peer = await openPeer(PREFIX + this.code); break; }
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
  constructor({ onMessage, onClose }) { Object.assign(this, { onMessage, onClose }); }
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
    this.peer = await openPeer(null);
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
