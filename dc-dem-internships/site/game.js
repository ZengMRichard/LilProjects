/* Run for It: an original endless runner for The Blue Ticket.
   The donkey jumps grumbling congressmen and ducks flying figures, and the city behind it
   repairs itself and greens as the distance grows. Drawn on a canvas; no image files. */
(function () {
  'use strict';
  var canvas = document.getElementById('game-canvas');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var statusEl = document.getElementById('g-status');
  var jumpBtn = document.getElementById('g-jump'), duckBtn = document.getElementById('g-duck');

  var H = 260, GROUND = 212, W = 800, view = 1;
  var INK = '#1A2238', PAPER = '#F8F2E2', BLUE = '#2A4BA0', RED = '#C8372D', GOLD = '#E0AE2A';
  var STAGES = [[0, 'Gridlock'], [120, 'Under Repair'], [320, 'Ribbon Cutting'], [600, 'Cherry Blossom Time']];
  var FULL = 600; // blocks at which the city is fully restored

  var state = 'ready'; // ready | running | paused | over
  var clock = 0, dist = 0, speed = 300, best = 0, lastTs = 0, overAt = 0, raf = 0;
  var donkey = { x: 62, y: GROUND, vy: 0, duck: false, ground: true };
  var obstacles = [], gap = 0, banner = null, stageIx = 0;

  try { best = +localStorage.getItem('blue-ticket-game-best') || 0; } catch (e) { best = 0; }

  // ───────────────────────────────────────── helpers
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
  function mix(a, b, t) { var x = hex(a), y = hex(b); t = clamp(t, 0, 1); return 'rgb(' + Math.round(x[0] + (y[0] - x[0]) * t) + ',' + Math.round(x[1] + (y[1] - x[1]) * t) + ',' + Math.round(x[2] + (y[2] - x[2]) * t) + ')'; }
  function box(x, y, w, h, fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h); }
  function blocks() { return Math.floor(dist / 40); }
  function green() { var t = clamp(blocks() / FULL, 0, 1); return t * t * (3 - 2 * t); }
  function say(text) { if (statusEl) statusEl.textContent = text; }

  function resize() {
    var cssW = canvas.clientWidth || 600;
    var cssH = cssW < 520 ? 230 : 300;
    canvas.style.height = cssH + 'px';
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    view = cssH / H;
    W = cssW / view;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr * view, 0, 0, dpr * view, 0, 0);
    draw();
  }

  // ───────────────────────────────────────── scenery
  function sky(g) {
    var grd = ctx.createLinearGradient(0, 0, 0, GROUND);
    grd.addColorStop(0, mix('#9A958B', '#7DB9E8', g));
    grd.addColorStop(1, mix('#CFC6B2', '#E6F2F6', g));
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, GROUND);
    // smog bands thin out; the sun comes through
    ctx.fillStyle = 'rgba(90,84,74,' + (0.22 * (1 - g)) + ')';
    ctx.fillRect(0, 54, W, 10); ctx.fillRect(0, 92, W, 6);
    if (g > 0.3) {
      ctx.globalAlpha = clamp((g - 0.3) / 0.4, 0, 1);
      ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(W - 70, 46, 20, 0, 6.3); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function capitol(x, y, g) {
    var stone = mix('#A29C91', '#F5F1E7', g);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
    box(x - 84, y - 24, 168, 24, stone);
    box(x - 36, y - 44, 72, 20, stone);
    ctx.beginPath();
    for (var i = -30; i <= 30; i += 10) { ctx.moveTo(x + i, y - 44); ctx.lineTo(x + i, y - 24); }
    for (var j = -76; j <= 76; j += 12) { if (Math.abs(j) > 40) { ctx.moveTo(x + j, y - 20); ctx.lineTo(x + j, y - 4); } }
    ctx.stroke();
    box(x - 22, y - 58, 44, 14, stone);
    ctx.fillStyle = stone; ctx.beginPath(); ctx.moveTo(x - 22, y - 58);
    ctx.bezierCurveTo(x - 22, y - 96, x - 8, y - 102, x, y - 102); ctx.bezierCurveTo(x + 8, y - 102, x + 22, y - 96, x + 22, y - 58);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    box(x - 4, y - 112, 8, 10, stone);
    ctx.beginPath(); ctx.moveTo(x, y - 112); ctx.lineTo(x, y - 122); ctx.stroke();
    if (g < 0.5) { // scaffolding and a crack while the dome is under repair
      ctx.globalAlpha = 1 - g / 0.5; ctx.strokeStyle = '#7A5B2E'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (var sx = -26; sx <= 26; sx += 13) { ctx.moveTo(x + sx, y - 104); ctx.lineTo(x + sx, y - 58); }
      for (var sy = -96; sy <= -62; sy += 11) { ctx.moveTo(x - 26, y + sy); ctx.lineTo(x + 26, y + sy); }
      ctx.stroke();
      ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.beginPath();
      ctx.moveTo(x - 60, y - 24); ctx.lineTo(x - 54, y - 15); ctx.lineTo(x - 61, y - 9); ctx.lineTo(x - 55, y); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (g > 0.55) { // the flag goes back up
      ctx.globalAlpha = clamp((g - 0.55) / 0.2, 0, 1);
      ctx.fillStyle = RED; ctx.fillRect(x + 1, y - 122, 12, 4); ctx.fillStyle = BLUE; ctx.fillRect(x + 1, y - 122, 5, 4);
      ctx.globalAlpha = 1;
    }
  }

  function monument(x, y, g) {
    ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.fillStyle = mix('#A8A297', '#F5F1E7', g);
    ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x - 4.5, y - 118); ctx.lineTo(x, y - 130); ctx.lineTo(x + 4.5, y - 118); ctx.lineTo(x + 8, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (g < 0.4) { // a crane beside it
      ctx.globalAlpha = 1 - g / 0.4; ctx.strokeStyle = '#7A5B2E'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x + 30, y); ctx.lineTo(x + 30, y - 112); ctx.lineTo(x - 8, y - 112); ctx.moveTo(x + 30, y - 112); ctx.lineTo(x + 44, y - 100); ctx.moveTo(x + 4, y - 112); ctx.lineTo(x + 4, y - 96); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function block(x, y, w, h, g, seed) {
    ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
    box(x, y - h, w, h, mix('#8E887D', '#E9E2D2', g));
    for (var wy = y - h + 7, r = 0; wy < y - 8; wy += 12, r++) {
      for (var wx = x + 5, c = 0; wx < x + w - 6; wx += 10, c++) {
        var lit = ((seed + r * 3 + c * 5) % 7) / 7 < g; // boarded windows light up one by one
        ctx.fillStyle = lit ? GOLD : '#4B4A4F'; ctx.fillRect(wx, wy, 5, 6);
      }
    }
  }

  function temple(x, y, g) {
    var stone = mix('#A29C91', '#F5F1E7', g);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.3;
    box(x - 44, y - 8, 88, 8, stone); box(x - 38, y - 40, 76, 32, stone); box(x - 42, y - 46, 84, 6, stone);
    ctx.beginPath(); for (var i = -30; i <= 30; i += 10) { ctx.moveTo(x + i, y - 40); ctx.lineTo(x + i, y - 8); } ctx.stroke();
  }

  function skyline(g) {
    var P = 1040, off = (dist * 0.12) % P, y = GROUND - 6;
    for (var k = -1; k * P - off < W; k++) {
      var o = k * P - off;
      block(o + 20, y, 46, 54, g, 1); block(o + 70, y, 34, 38, g, 4);
      capitol(o + 230, y, g);
      block(o + 350, y, 40, 48, g, 2); block(o + 394, y, 56, 66, g, 6); block(o + 454, y, 30, 34, g, 3);
      monument(o + 580, y, g);
      block(o + 660, y, 50, 44, g, 5);
      temple(o + 800, y, g);
      block(o + 880, y, 38, 58, g, 0); block(o + 922, y, 60, 40, g, 2);
    }
  }

  function tree(x, y, g, n) {
    ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
    box(x - 2.5, y - 26, 5, 26, '#6B5236');
    if (g < 0.22) { // bare branches
      ctx.beginPath(); ctx.moveTo(x, y - 26); ctx.lineTo(x - 10, y - 42); ctx.moveTo(x, y - 26); ctx.lineTo(x + 9, y - 44); ctx.moveTo(x, y - 30); ctx.lineTo(x + 2, y - 48); ctx.stroke();
      return;
    }
    var r = 7 + 13 * clamp((g - 0.22) / 0.4, 0, 1);
    ctx.fillStyle = mix('#8A8F4E', '#4F9A4B', g);
    ctx.beginPath(); ctx.arc(x, y - 26 - r * 0.7, r, 0, 6.3); ctx.fill(); ctx.stroke();
    if (g > 0.68) { // blossoms
      var count = Math.round(9 * clamp((g - 0.68) / 0.3, 0, 1));
      ctx.fillStyle = '#F2A9C4';
      for (var i = 0; i < count; i++) {
        var a = (i * 2.4 + n) % 6.28, d = r * (0.25 + ((i * 37 + n * 11) % 60) / 100);
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y - 26 - r * 0.7 + Math.sin(a) * d, 2.6, 0, 6.3); ctx.fill();
      }
    }
  }

  function lamp(x, y, g) {
    ctx.save(); ctx.translate(x, y); ctx.rotate((1 - clamp(g / 0.35, 0, 1)) * 0.22); // bent until someone fixes it
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -40); ctx.stroke();
    ctx.lineWidth = 1.2; ctx.fillStyle = g > 0.35 ? GOLD : '#55545A';
    ctx.beginPath(); ctx.arc(0, -44, 5, 0, 6.3); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function street(g) {
    var P = 340, off = (dist * 0.45) % P, y = GROUND - 4;
    for (var k = -1; k * P - off < W + 40; k++) { var o = k * P - off; tree(o + 60, y, g, k + 3); lamp(o + 200, y, g); tree(o + 290, y, g, k + 7); }
    // grass, kerb, road
    ctx.fillStyle = mix('#8B7E61', '#5FA354', g); ctx.fillRect(0, GROUND - 6, W, 6);
    ctx.fillStyle = mix('#7B766E', '#59606F', g); ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(W, GROUND); ctx.stroke();
    var R = 120, ro = dist % R;
    for (var x = -ro; x < W + R; x += R) {
      if (g < 0.6) { // potholes and cracks, filled in as the run goes on
        ctx.globalAlpha = 1 - g / 0.6; ctx.fillStyle = '#3A3836';
        ctx.beginPath(); ctx.ellipse(x + 30, GROUND + 22, 13, 4, 0, 0, 6.3); ctx.fill();
        ctx.strokeStyle = '#3A3836'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + 76, GROUND + 6); ctx.lineTo(x + 84, GROUND + 15); ctx.lineTo(x + 78, GROUND + 24); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.globalAlpha = clamp(g / 0.5, 0, 1); ctx.fillStyle = GOLD; ctx.fillRect(x + 8, GROUND + 33, 34, 3); ctx.globalAlpha = 1; // fresh lane paint
      if (g > 0.75) { ctx.fillStyle = '#F2A9C4'; ctx.beginPath(); ctx.arc(x + 96, GROUND - 7, 2, 0, 6.3); ctx.arc(x + 104, GROUND - 8, 2, 0, 6.3); ctx.fill(); }
    }
    if (g > 0.8) { // petals on the wind
      ctx.fillStyle = '#F2A9C4';
      for (var i = 0; i < 9; i++) {
        var px = (i * 131 - dist * 0.7 - clock * 30) % (W + 40); if (px < -10) px += W + 40;
        ctx.beginPath(); ctx.arc(px, 40 + ((i * 53 + clock * 22) % 150), 1.8, 0, 6.3); ctx.fill();
      }
    }
  }

  // ───────────────────────────────────────── characters
  function drawDonkey() {
    var d = donkey, x = d.x, y = d.y, duck = d.duck && d.ground;
    var top = duck ? 26 : 36, run = state === 'running' && d.ground ? clock * 16 : 0;
    ctx.save(); ctx.translate(x, y); ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.lineJoin = 'round';
    // legs
    var legs = [10, 17, 32, 39];
    for (var i = 0; i < 4; i++) {
      var sw = d.ground ? Math.sin(run + i * 1.7) * (duck ? 3 : 6) : (i < 2 ? -5 : 5);
      ctx.beginPath(); ctx.moveTo(legs[i], -top + 16); ctx.lineTo(legs[i] + sw, -1); ctx.lineWidth = 4.4; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = 2.2; ctx.strokeStyle = BLUE; ctx.stroke();
    }
    ctx.strokeStyle = INK; ctx.lineWidth = 1.8;
    // tail
    ctx.beginPath(); ctx.moveTo(6, -top + 6); ctx.quadraticCurveTo(-4, -top + 8, -3, -top + 20); ctx.stroke();
    ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(-3, -top + 21, 2.6, 0, 6.3); ctx.fill(); ctx.stroke();
    // body
    ctx.fillStyle = BLUE; ctx.beginPath(); ctx.ellipse(25, -top + 9, 21, 10, 0, 0, 6.3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = PAPER; // three stars on the flank
    for (var s = 0; s < 3; s++) star(15 + s * 8, -top + 7, 2.4);
    // neck and head: forward and low when ducking
    var hx = duck ? 52 : 45, hy = duck ? -top + 6 : -top - 8;
    ctx.fillStyle = BLUE; ctx.beginPath(); ctx.moveTo(36, -top + 3); ctx.lineTo(hx - 2, hy - 2); ctx.lineTo(hx + 4, hy + 8); ctx.lineTo(42, -top + 14); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = RED; ctx.beginPath(); ctx.moveTo(35, -top + 2); ctx.lineTo(hx - 4, hy - 3); ctx.lineTo(hx - 1, hy + 1); ctx.lineTo(38, -top + 5); ctx.closePath(); ctx.fill(); // mane
    // ears
    ctx.fillStyle = BLUE;
    var ex = duck ? -7 : 0, ey = duck ? 2 : -11;
    ctx.beginPath(); ctx.ellipse(hx - 1 + ex, hy - 4 + ey * 0.6, 2.6, 8, duck ? -1.2 : -0.25, 0, 6.3); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(hx + 4 + ex, hy - 4 + ey * 0.6, 2.6, 8, duck ? -1.0 : 0.2, 0, 6.3); ctx.fill(); ctx.stroke();
    // head and muzzle
    ctx.beginPath(); ctx.ellipse(hx + 5, hy + 3, 9, 6.5, 0.2, 0, 6.3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = PAPER; ctx.beginPath(); ctx.ellipse(hx + 11, hy + 5, 5, 4.2, 0.2, 0, 6.3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(hx + 4, hy + 1, 1.5, 0, 6.3); ctx.arc(hx + 13, hy + 4.5, 0.8, 0, 6.3); ctx.fill();
    ctx.restore();
  }

  function star(cx, cy, r) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) { var a = -1.5708 + i * 0.6283, rr = i % 2 ? r * 0.45 : r; ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
  }

  var SKIN = ['#E9C6A5', '#C99872', '#8A5A3C'], TIE = [RED, GOLD, '#3F7F5A'];
  function congressman(o) {
    var x = o.x, h = o.h, shake = Math.sin(clock * 14 + o.x * 0.05) * 2;
    ctx.save(); ctx.translate(x, GROUND); ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
    box(5, -14, 5, 14, '#2E313B'); box(14, -14, 5, 14, '#2E313B');            // legs
    box(2, -h + 16, 20, h - 30, '#3D414D');                                    // suit
    ctx.fillStyle = PAPER; ctx.beginPath(); ctx.moveTo(8, -h + 16); ctx.lineTo(16, -h + 16); ctx.lineTo(12, -h + 27); ctx.closePath(); ctx.fill();
    ctx.fillStyle = TIE[o.v % 3]; ctx.fillRect(11, -h + 18, 2.4, 11);          // tie
    ctx.fillStyle = SKIN[o.v % 3]; ctx.beginPath(); ctx.arc(12, -h + 8, 8, 0, 6.3); ctx.fill(); ctx.stroke();   // head
    ctx.fillStyle = '#D9D6CF'; ctx.beginPath(); ctx.arc(5.5, -h + 5, 3.2, 0, 6.3); ctx.arc(18.5, -h + 5, 3.2, 0, 6.3); ctx.fill(); // grey side hair
    ctx.beginPath(); ctx.moveTo(6.5, -h + 5.5); ctx.lineTo(10.5, -h + 7.5); ctx.moveTo(17.5, -h + 5.5); ctx.lineTo(13.5, -h + 7.5); ctx.stroke(); // brows
    ctx.beginPath(); ctx.arc(12, -h + 14, 3, 3.5, 5.9); ctx.stroke();           // frown
    if (o.tall) { // shaking a fist
      ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(3, -h + 20); ctx.lineTo(-4 + shake, -h + 6); ctx.stroke();
      ctx.lineWidth = 1.4; ctx.fillStyle = SKIN[o.v % 3]; ctx.beginPath(); ctx.arc(-4.5 + shake, -h + 3, 3.4, 0, 6.3); ctx.fill(); ctx.stroke();
    } else { // leaning on a cane, wagging a finger
      ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(24, -h + 26); ctx.lineTo(27, 0); ctx.stroke();
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(3, -h + 22); ctx.lineTo(-5, -h + 16 + shake); ctx.stroke();
    }
    ctx.restore();
  }

  function flyer(o) { // a suited figure flying on memo-paper wings
    var x = o.x, y = o.y, flap = Math.sin(clock * 12 + o.flap) * 9;
    ctx.save(); ctx.translate(x, y); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
    ctx.fillStyle = PAPER; // wings: sheets of paper
    ctx.beginPath(); ctx.moveTo(20, 9); ctx.lineTo(13, -6 - flap); ctx.lineTo(33, -9 - flap); ctx.lineTo(34, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(17, -1 - flap * 0.6); ctx.lineTo(30, -3 - flap * 0.6); ctx.moveTo(18, 3 - flap * 0.3); ctx.lineTo(31, 2 - flap * 0.3); ctx.lineWidth = 0.8; ctx.stroke(); ctx.lineWidth = 1.5;
    box(12, 8, 34, 10, '#2B2E38');                                               // suit, flying flat
    box(44, 9, 8, 4, '#2B2E38'); box(44, 14, 8, 4, '#2B2E38');                   // legs trailing
    ctx.fillStyle = RED; ctx.beginPath(); ctx.moveTo(13, 14); ctx.lineTo(22, 16 + flap * 0.15); ctx.lineTo(13, 18); ctx.closePath(); ctx.fill(); // tie in the wind
    ctx.fillStyle = '#E9C6A5'; ctx.beginPath(); ctx.arc(7, 12, 7.5, 0, 6.3); ctx.fill(); ctx.stroke();   // head
    ctx.strokeStyle = '#3B2F28'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(8.5, 11, 7, -1.2, 0.5); ctx.stroke(); // hair at the back
    ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(1.5, 9); ctx.lineTo(6, 10.5); ctx.stroke();      // brow
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(4.5, 12.5, 1, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.moveTo(2, 16.5); ctx.lineTo(6, 16); ctx.stroke();       // set mouth
    ctx.restore();
  }

  // ───────────────────────────────────────── frame
  function hud() {
    ctx.fillStyle = INK; ctx.textBaseline = 'top';
    ctx.font = "20px 'League Gothic', 'Arial Narrow', Impact, sans-serif";
    ctx.textAlign = 'left'; ctx.fillText('BLOCKS  ' + ('0000' + blocks()).slice(-4), 12, 10);
    ctx.textAlign = 'right'; ctx.fillText('BEST  ' + ('0000' + Math.max(best, blocks())).slice(-4), W - 12, 10);
    ctx.textAlign = 'center'; ctx.font = "15px 'League Gothic', 'Arial Narrow', Impact, sans-serif";
    ctx.fillText('STAGE ' + (stageIx + 1) + ': ' + STAGES[stageIx][1].toUpperCase(), W / 2, 12);
    if (banner && clock < banner.until) {
      ctx.globalAlpha = clamp((banner.until - clock) / 0.5, 0, 1);
      panel(W / 2, 74, banner.text, null);
      ctx.globalAlpha = 1;
    }
  }

  function panel(cx, cy, title, sub) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = "26px 'Alfa Slab One', Rockwell, Georgia, serif";
    var w = Math.min(W - 24, Math.max(ctx.measureText(title).width, sub ? 250 : 0) + 44), hgt = sub ? 78 : 46;
    ctx.fillStyle = PAPER; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.fillRect(cx - w / 2, cy - hgt / 2, w, hgt); ctx.strokeRect(cx - w / 2, cy - hgt / 2, w, hgt);
    ctx.fillStyle = RED; ctx.fillText(title, cx, cy - (sub ? 14 : 0) + 1);
    if (sub) { ctx.fillStyle = INK; ctx.font = "16px 'League Gothic', 'Arial Narrow', Impact, sans-serif"; ctx.fillText(sub, cx, cy + 20); }
  }

  function draw() {
    var g = green();
    ctx.clearRect(0, 0, W, H);
    sky(g); skyline(g); street(g);
    for (var i = 0; i < obstacles.length; i++) (obstacles[i].kind === 'pol' ? congressman : flyer)(obstacles[i]);
    drawDonkey();
    hud();
    if (state === 'ready') panel(W / 2, 116, 'RUN FOR IT', 'SPACE OR TAP TO JUMP  ·  DOWN ARROW TO DUCK');
    else if (state === 'paused') panel(W / 2, 116, 'RECESS', 'SPACE OR TAP TO KEEP RUNNING');
    else if (state === 'over') panel(W / 2, 116, 'FILIBUSTERED', blocks() + ' BLOCKS  ·  SPACE OR TAP TO RUN AGAIN');
  }

  // ───────────────────────────────────────── play
  function spawn() {
    var r = Math.random();
    if (blocks() > 50 && r < 0.3) {
      var lane = Math.random();
      // low: jump it · middle: duck under it · high: stay on the ground
      var up = lane < 0.3 ? 32 : lane < 0.8 ? 58 : 92;
      obstacles.push({ kind: 'flyer', x: W + 40, y: GROUND - up, w: 52, h: 22, flap: Math.random() * 6 });
    } else {
      var n = speed > 430 && r > 0.72 ? 2 : 1;
      if (speed > 540 && r > 0.93) n = 3;
      for (var i = 0; i < n; i++) {
        var tall = Math.random() < 0.45;
        obstacles.push({ kind: 'pol', x: W + 40 + i * 30, y: GROUND, w: 24, h: tall ? 58 : 46, tall: tall, v: (Math.random() * 3) | 0 });
      }
    }
    gap = speed * (0.85 + Math.random() * 0.85);
  }

  function hit(o) {
    var d = donkey, duck = d.duck && d.ground;
    var dx = d.x + 9, dw = duck ? 48 : 40, dh = duck ? 24 : 40, dy = d.y - dh;
    var ox = o.x + 4, ow = o.w - 8, oy = (o.kind === 'pol' ? GROUND - o.h : o.y) + 4, oh = o.h - 6;
    return dx < ox + ow && dx + dw > ox && dy < oy + oh && dy + dh > oy;
  }

  function update(dt) {
    clock += dt;
    speed = Math.min(640, 300 + dist / 90);
    dist += speed * dt;
    var d = donkey;
    if (!d.ground) {
      d.vy += 2400 * dt * (d.duck ? 2 : 1); // holding duck in the air drops faster
      d.y += d.vy * dt;
      if (d.y >= GROUND) { d.y = GROUND; d.vy = 0; d.ground = true; }
    }
    gap -= speed * dt;
    if (gap <= 0) spawn();
    for (var i = obstacles.length - 1; i >= 0; i--) {
      var o = obstacles[i];
      o.x -= (speed + (o.kind === 'flyer' ? 70 : 0)) * dt;
      if (o.x < -90) obstacles.splice(i, 1);
      else if (hit(o)) { end(); return; }
    }
    var b = blocks();
    if (stageIx < STAGES.length - 1 && b >= STAGES[stageIx + 1][0]) {
      stageIx++;
      banner = { text: 'STAGE ' + (stageIx + 1) + ': ' + STAGES[stageIx][1].toUpperCase(), until: clock + 2.4 };
    }
  }

  function loop(ts) {
    if (state !== 'running') return;
    var dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
    lastTs = ts;
    update(dt);
    draw();
    if (state === 'running') raf = requestAnimationFrame(loop);
  }

  function start() {
    if (state === 'over' && Date.now() - overAt < 450) return; // don't restart on the keypress that ended the run
    if (state !== 'paused') { dist = 0; clock = 0; obstacles = []; gap = 380; stageIx = 0; banner = null; donkey.y = GROUND; donkey.vy = 0; donkey.ground = true; donkey.duck = false; }
    state = 'running'; lastTs = performance.now();
    canvas.setAttribute('data-state', state);
    say('Running. Space or tap to jump, down arrow to duck.');
    cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }
  function pause() { if (state !== 'running') return; state = 'paused'; canvas.setAttribute('data-state', state); say('Paused at ' + blocks() + ' blocks.'); draw(); }
  function end() {
    state = 'over'; overAt = Date.now();
    var b = blocks(), record = b > best;
    if (record) { best = b; try { localStorage.setItem('blue-ticket-game-best', String(best)); } catch (e) { /* private window */ } }
    canvas.setAttribute('data-state', state); canvas.setAttribute('data-blocks', b);
    say('Filibustered at ' + b + ' blocks' + (record ? ', a new best.' : '. Best: ' + best + '.'));
    draw();
  }
  function jump() {
    if (state !== 'running') { start(); return; }
    if (donkey.ground) { donkey.vy = -770; donkey.ground = false; }
  }
  function duck(on) { donkey.duck = !!on && state === 'running'; }

  // ───────────────────────────────────────── controls
  canvas.addEventListener('pointerdown', function (e) { e.preventDefault(); try { canvas.focus({ preventScroll: true }); } catch (err) { /* older browsers */ } jump(); });
  document.addEventListener('keydown', function (e) {
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (state !== 'running' && document.activeElement !== canvas) return; // only take keys while playing or focused
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); if (!e.repeat) jump(); }
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); duck(true); }
    else if (e.code === 'Escape') pause();
  });
  document.addEventListener('keyup', function (e) { if (e.code === 'ArrowDown' || e.code === 'KeyS') duck(false); });
  if (jumpBtn) jumpBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); jump(); });
  if (duckBtn) {
    duckBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); if (state !== 'running') start(); duck(true); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { duckBtn.addEventListener(n, function () { duck(false); }); });
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); });
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { if (!es[0].isIntersecting) pause(); }).observe(canvas);
  window.addEventListener('resize', resize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
  canvas.setAttribute('data-state', state);
  resize();
})();
