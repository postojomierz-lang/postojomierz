// Dragging the route line, as in Google Maps: press on the drawn route (finger or mouse), drag, and on
// release a new point is put in that leg of the route, on the nearest trail; while dragging, the route
// that would come of it is drawn dashed. On a computer a small handle on the line shows where it can be
// taken. Works on the map's container (the map draws on a canvas, whose layers get no touch events).
import L from 'leaflet';

export function setupRouteDrag({ map, G, ll, getPath, getStops, setStops, onDragged = () => {} }) {
  const el = map.getContainer();
  const handle = L.circleMarker([0, 0], { radius: 6, color: '#222', weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false });
  const preview = L.polyline([], { color: '#222', weight: 4, dashArray: '6 8', opacity: 0.8, interactive: false });
  let drag = null, suppress = 0;

  // the point of the route nearest to the screen point, if within tol pixels: { i (path index), d }
  function nearest(pt, tol) {
    const path = getPath();
    if (!path || path.length < 2) return null;
    let best = null;
    let a = map.latLngToContainerPoint(ll(path[0]));
    for (let i = 1; i < path.length; i++) {
      const b = map.latLngToContainerPoint(ll(path[i]));
      const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / l2)) : 0;
      const d = Math.hypot(a.x + dx * t - pt.x, a.y + dy * t - pt.y);
      if (d < tol && (!best || d < best.d)) best = { i: t < 0.5 ? i - 1 : i, d, x: a.x + dx * t, y: a.y + dy * t };
      a = b;
    }
    return best;
  }
  // which leg (between stop j and j+1) a path index is in
  function legAt(i) {
    const path = getPath(), stops = getStops();
    let k = 1;
    for (let p = 0; p < path.length && k < stops.length; p++) {
      if (path[p] === stops[k] && p > 0) { if (i <= p) return k - 1; k++; }
    }
    return stops.length - 2;
  }
  const onMarker = (t) => t.closest && t.closest('.leaflet-marker-icon, .leaflet-control, .leaflet-popup');

  el.addEventListener('pointerdown', (ev) => {
    if (ev.button > 0 || onMarker(ev.target)) return;
    const n = nearest(map.mouseEventToContainerPoint(ev), ev.pointerType === 'touch' ? 20 : 10);
    if (!n) return;
    ev.stopPropagation(); ev.preventDefault();
    map.dragging.disable();
    drag = { leg: legAt(n.i), v: -1, id: ev.pointerId };
    handle.setLatLng(map.containerPointToLatLng([n.x, n.y])).addTo(map);
    preview.setLatLngs([]).addTo(map);
    try { el.setPointerCapture(ev.pointerId); } catch (e) { /* ok */ }
  }, true);

  el.addEventListener('pointermove', (ev) => {
    if (!drag) {
      // a computer: the handle on the line under the mouse
      if (ev.pointerType !== 'mouse' || ev.buttons) return;
      const n = nearest(map.mouseEventToContainerPoint(ev), 10);
      if (n) { handle.setLatLng(map.containerPointToLatLng([n.x, n.y])).addTo(map); el.style.cursor = 'grab'; }
      else if (map.hasLayer(handle)) { handle.remove(); el.style.cursor = ''; }
      return;
    }
    if (ev.pointerId !== drag.id) return;
    ev.stopPropagation();
    const p = map.mouseEventToLatLng(ev);
    handle.setLatLng(p);
    const v = G.snap(p.lng, p.lat, 600);
    if (v >= 0 && v !== drag.v) {
      drag.v = v;
      const s = getStops().slice(); s.splice(drag.leg + 1, 0, v);
      const path = G.routeVia(s);
      preview.setLatLngs(path ? path.map(ll) : []);
    }
  }, true);

  function end(ev) {
    if (!drag || (ev && ev.pointerId !== drag.id)) return;
    const d = drag; drag = null;
    map.dragging.enable(); handle.remove(); preview.remove(); el.style.cursor = '';
    suppress = Date.now();                      // the click that ends a drag does not add a point
    if (d.v >= 0) { const s = getStops().slice(); s.splice(d.leg + 1, 0, d.v); setStops(s); onDragged(); }
  }
  el.addEventListener('pointerup', end, true);
  el.addEventListener('pointercancel', end, true);
  return { get busy() { return !!drag || Date.now() - suppress < 400; } };
}
