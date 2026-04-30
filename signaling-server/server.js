'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const rooms = new Map();

function json(res, code, body) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,OPTIONS'
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return json(res, 200, { ok: true });
  if (req.url === '/' || req.url === '/health') {
    return json(res, 200, {
      ok: true,
      name: 'paint-rush-signaling-server',
      rooms: rooms.size,
      time: new Date().toISOString()
    });
  }
  json(res, 404, { ok: false, error: 'not found' });
});

const wss = new WebSocketServer({ server });

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}
function roomPeers(room, excludeId) {
  const peers = [];
  const r = rooms.get(room);
  if (!r) return peers;
  for (const [id, ws] of r.entries()) {
    if (id !== excludeId) peers.push({ id, name: ws.name || 'Friend' });
  }
  return peers;
}
function joinRoom(ws, room, id, name) {
  if (!room || !id) return;
  leaveRoom(ws);
  ws.room = String(room).toUpperCase().slice(0, 12);
  ws.id = String(id).slice(0, 64);
  ws.name = String(name || 'Friend').slice(0, 32);
  if (!rooms.has(ws.room)) rooms.set(ws.room, new Map());
  const r = rooms.get(ws.room);
  r.set(ws.id, ws);
  send(ws, { type: 'welcome', room: ws.room, id: ws.id, peers: roomPeers(ws.room, ws.id) });
  for (const [peerId, peer] of r.entries()) {
    if (peerId !== ws.id) send(peer, { type: 'peer-joined', room: ws.room, id: ws.id, name: ws.name });
  }
}
function leaveRoom(ws) {
  if (!ws.room || !rooms.has(ws.room)) return;
  const r = rooms.get(ws.room);
  r.delete(ws.id);
  for (const peer of r.values()) send(peer, { type: 'peer-left', room: ws.room, id: ws.id });
  if (r.size === 0) rooms.delete(ws.room);
  ws.room = null;
}
function forwardSignal(ws, msg) {
  const room = msg.room || ws.room;
  const r = rooms.get(room);
  if (!r) return;
  const out = {
    type: 'signal',
    room,
    from: ws.id || msg.from,
    to: msg.to,
    signal: msg.signal || { type: msg.signalType || msg.kind, data: msg.data || msg.sdp || msg.candidate }
  };
  if (msg.to && r.has(msg.to)) {
    send(r.get(msg.to), out);
  } else {
    for (const [peerId, peer] of r.entries()) if (peerId !== ws.id) send(peer, out);
  }
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (buf) => {
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch (_) { return; }
    if (msg.type === 'join' || msg.type === 'hello') joinRoom(ws, msg.room, msg.id, msg.name);
    else if (msg.type === 'signal' || msg.type === 'offer' || msg.type === 'answer' || msg.type === 'ice' || msg.type === 'candidate' || msg.type === 'ice-candidate') forwardSignal(ws, msg);
    else if (msg.type === 'ping') send(ws, { type: 'pong', t: Date.now() });
  });
  ws.on('close', () => leaveRoom(ws));
  send(ws, { type: 'hello', server: 'paint-rush-signaling-server' });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch (_) {}
  }
}, 25000);

server.listen(PORT, () => {
  console.log(`Paint Rush signaling server listening on :${PORT}`);
});
