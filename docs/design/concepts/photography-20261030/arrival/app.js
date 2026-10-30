// ../../../node_modules/client-zip/index.js
"stream" in Blob.prototype || Object.defineProperty(Blob.prototype, "stream", { value() {
  return new Response(this).body;
} }), "setBigUint64" in DataView.prototype || Object.defineProperty(DataView.prototype, "setBigUint64", { value(e2, n2, t2) {
  const i2 = Number(0xffffffffn & n2), r2 = Number(n2 >> 32n);
  this.setUint32(e2 + (t2 ? 0 : 4), i2, t2), this.setUint32(e2 + (t2 ? 4 : 0), r2, t2);
} });
var e = (e2) => new DataView(new ArrayBuffer(e2));
var n = (e2) => new Uint8Array(e2.buffer || e2);
var t = (e2) => new TextEncoder().encode(String(e2));
var i = (e2) => Math.min(4294967295, Number(e2));
var r = (e2) => Math.min(65535, Number(e2));
function o(e2, i2, r2) {
  void 0 === i2 || i2 instanceof Date || (i2 = new Date(i2));
  const o2 = void 0 !== e2;
  if (r2 || (r2 = o2 ? 436 : 509), e2 instanceof File) return { isFile: o2, t: i2 || new Date(e2.lastModified), bytes: e2.stream(), mode: r2 };
  if (e2 instanceof Response) return { isFile: o2, t: i2 || new Date(e2.headers.get("Last-Modified") || Date.now()), bytes: e2.body, mode: r2 };
  if (void 0 === i2) i2 = /* @__PURE__ */ new Date();
  else if (isNaN(i2)) throw new Error("Invalid modification date.");
  if (!o2) return { isFile: o2, t: i2, mode: r2 };
  if ("string" == typeof e2) return { isFile: o2, t: i2, bytes: t(e2), mode: r2 };
  if (e2 instanceof Blob) return { isFile: o2, t: i2, bytes: e2.stream(), mode: r2 };
  if (e2 instanceof Uint8Array || e2 instanceof ReadableStream) return { isFile: o2, t: i2, bytes: e2, mode: r2 };
  if (e2 instanceof ArrayBuffer || ArrayBuffer.isView(e2)) return { isFile: o2, t: i2, bytes: n(e2), mode: r2 };
  if (Symbol.asyncIterator in e2) return { isFile: o2, t: i2, bytes: f(e2[Symbol.asyncIterator]()), mode: r2 };
  throw new TypeError("Unsupported input format.");
}
function f(e2, n2 = e2) {
  return new ReadableStream({ async pull(n3) {
    let t2 = 0;
    for (; n3.desiredSize > t2; ) {
      const i2 = await e2.next();
      if (!i2.value) {
        n3.close();
        break;
      }
      {
        const e3 = a(i2.value);
        n3.enqueue(e3), t2 += e3.byteLength;
      }
    }
  }, cancel(e3) {
    n2.throw?.(e3);
  } });
}
function a(e2) {
  return "string" == typeof e2 ? t(e2) : e2 instanceof Uint8Array ? e2 : n(e2);
}
function s(e2, i2, r2) {
  let [o2, f2] = (function(e3) {
    return e3 ? e3 instanceof Uint8Array ? [e3, 1] : ArrayBuffer.isView(e3) || e3 instanceof ArrayBuffer ? [n(e3), 1] : [t(e3), 0] : [void 0, 0];
  })(i2);
  if (e2 instanceof File) return { i: d(o2 || t(e2.name)), o: BigInt(e2.size), u: f2 };
  if (e2 instanceof Response) {
    const n2 = e2.headers.get("content-disposition"), i3 = n2 && n2.match(/;\s*filename\*?\s*=\s*(?:UTF-\d+''|)["']?([^;"'\r\n]*)["']?(?:;|$)/i), a2 = i3 && i3[1] || e2.url && new URL(e2.url).pathname.split("/").findLast(Boolean), s2 = a2 && decodeURIComponent(a2), u2 = r2 || +e2.headers.get("content-length");
    return { i: d(o2 || t(s2)), o: BigInt(u2), u: f2 };
  }
  return o2 = d(o2, void 0 !== e2 || void 0 !== r2), "string" == typeof e2 ? { i: o2, o: BigInt(t(e2).length), u: f2 } : e2 instanceof Blob ? { i: o2, o: BigInt(e2.size), u: f2 } : e2 instanceof ArrayBuffer || ArrayBuffer.isView(e2) ? { i: o2, o: BigInt(e2.byteLength), u: f2 } : { i: o2, o: u(e2, r2), u: f2 };
}
function u(e2, n2) {
  return n2 > -1 ? BigInt(n2) : e2 ? void 0 : 0n;
}
function d(e2, n2 = 1) {
  if (!e2 || e2.every(((c) => 47 === c))) throw new Error("The file must have a name.");
  if (n2) for (; 47 === e2[e2.length - 1]; ) e2 = e2.subarray(0, -1);
  else 47 !== e2[e2.length - 1] && (e2 = new Uint8Array([...e2, 47]));
  return e2;
}
var l = new Uint32Array(256);
for (let e2 = 0; e2 < 256; ++e2) {
  let n2 = e2;
  for (let e3 = 0; e3 < 8; ++e3) n2 = n2 >>> 1 ^ (1 & n2 && 3988292384);
  l[e2] = n2;
}
function y(e2, n2 = 0) {
  n2 = ~n2;
  for (var t2 = 0, i2 = e2.length; t2 < i2; t2++) n2 = n2 >>> 8 ^ l[255 & n2 ^ e2[t2]];
  return ~n2 >>> 0;
}
function w(e2, n2, t2 = 0) {
  const i2 = e2.getSeconds() >> 1 | e2.getMinutes() << 5 | e2.getHours() << 11, r2 = e2.getDate() | e2.getMonth() + 1 << 5 | e2.getFullYear() - 1980 << 9;
  n2.setUint16(t2, i2, 1), n2.setUint16(t2 + 2, r2, 1);
}
function B({ i: e2, u: n2 }, t2) {
  return 8 * (!n2 || (t2 ?? (function(e3) {
    try {
      b.decode(e3);
    } catch {
      return 0;
    }
    return 1;
  })(e2)));
}
var b = new TextDecoder("utf8", { fatal: 1 });
function p(t2, i2 = 0) {
  const r2 = e(30);
  return r2.setUint32(0, 1347093252), r2.setUint32(4, 754976768 | i2), w(t2.t, r2, 10), r2.setUint16(26, t2.i.length, 1), n(r2);
}
async function* g(e2) {
  let { bytes: n2 } = e2;
  if ("then" in n2 && (n2 = await n2), n2 instanceof Uint8Array) yield n2, e2.l = y(n2, 0), e2.o = BigInt(n2.length);
  else {
    e2.o = 0n;
    const t2 = n2.getReader();
    for (; ; ) {
      const { value: n3, done: i2 } = await t2.read();
      if (i2) break;
      e2.l = y(n3, e2.l), e2.o += BigInt(n3.length), yield n3;
    }
  }
}
function I(t2, r2) {
  const o2 = e(16 + (r2 ? 8 : 0));
  return o2.setUint32(0, 1347094280), o2.setUint32(4, t2.isFile ? t2.l : 0, 1), r2 ? (o2.setBigUint64(8, t2.o, 1), o2.setBigUint64(16, t2.o, 1)) : (o2.setUint32(8, i(t2.o), 1), o2.setUint32(12, i(t2.o), 1)), n(o2);
}
function v(t2, r2, o2 = 0, f2 = 0) {
  const a2 = e(46);
  return a2.setUint32(0, 1347092738), a2.setUint32(4, 755182848), a2.setUint16(8, 2048 | o2), w(t2.t, a2, 12), a2.setUint32(16, t2.isFile ? t2.l : 0, 1), a2.setUint32(20, i(t2.o), 1), a2.setUint32(24, i(t2.o), 1), a2.setUint16(28, t2.i.length, 1), a2.setUint16(30, f2, 1), a2.setUint16(40, t2.mode | (t2.isFile ? 32768 : 16384), 1), a2.setUint32(42, i(r2), 1), n(a2);
}
function h(t2, i2, r2) {
  const o2 = e(r2);
  return o2.setUint16(0, 1, 1), o2.setUint16(2, r2 - 4, 1), 16 & r2 && (o2.setBigUint64(4, t2.o, 1), o2.setBigUint64(12, t2.o, 1)), o2.setBigUint64(r2 - 8, i2, 1), n(o2);
}
function D(e2) {
  return e2 instanceof File || e2 instanceof Response ? [[e2], [e2]] : [[e2.input, e2.name, e2.size], [e2.input, e2.lastModified, e2.mode]];
}
var S = (e2) => (function(e3) {
  let n2 = BigInt(22), t2 = 0n, i2 = 0;
  for (const r2 of e3) {
    if (!r2.i) throw new Error("Every file must have a non-empty name.");
    if (void 0 === r2.o) throw new Error(`Missing size for file "${new TextDecoder().decode(r2.i)}".`);
    const e4 = r2.o >= 0xffffffffn, o2 = t2 >= 0xffffffffn;
    t2 += BigInt(46 + r2.i.length + (e4 && 8)) + r2.o, n2 += BigInt(r2.i.length + 46 + (12 * o2 | 28 * e4)), i2 || (i2 = e4);
  }
  return (i2 || t2 >= 0xffffffffn) && (n2 += BigInt(76)), n2 + t2;
})((function* (e3) {
  for (const n2 of e3) yield s(...D(n2)[0]);
})(e2));
function A(e2, n2 = {}) {
  const t2 = { "Content-Type": "application/zip", "Content-Disposition": "attachment" };
  return ("bigint" == typeof n2.length || Number.isInteger(n2.length)) && n2.length > 0 && (t2["Content-Length"] = String(n2.length)), n2.metadata && (t2["Content-Length"] = String(S(n2.metadata))), new Response(N(e2, n2), { headers: t2 });
}
function N(t2, a2 = {}) {
  const u2 = (function(e2) {
    const n2 = e2[Symbol.iterator in e2 ? Symbol.iterator : Symbol.asyncIterator]();
    return { async next() {
      const e3 = await n2.next();
      if (e3.done) return e3;
      const [t3, i2] = D(e3.value);
      return { done: 0, value: Object.assign(o(...i2), s(...t3)) };
    }, throw: n2.throw?.bind(n2), [Symbol.asyncIterator]() {
      return this;
    } };
  })(t2);
  return f((async function* (t3, o2) {
    const f2 = [];
    let a3 = 0n, s2 = 0n, u3 = 0;
    for await (const e2 of t3) {
      const n2 = B(e2, o2.buffersAreUTF8);
      yield p(e2, n2), yield new Uint8Array(e2.i), e2.isFile && (yield* g(e2));
      const t4 = e2.o >= 0xffffffffn, i2 = 12 * (a3 >= 0xffffffffn) | 28 * t4;
      yield I(e2, t4), f2.push(v(e2, a3, n2, i2)), f2.push(e2.i), i2 && f2.push(h(e2, a3, i2)), t4 && (a3 += 8n), s2++, a3 += BigInt(46 + e2.i.length) + e2.o, u3 || (u3 = t4);
    }
    let d2 = 0n;
    for (const e2 of f2) yield e2, d2 += BigInt(e2.length);
    if (u3 || a3 >= 0xffffffffn) {
      const t4 = e(76);
      t4.setUint32(0, 1347094022), t4.setBigUint64(4, BigInt(44), 1), t4.setUint32(12, 755182848), t4.setBigUint64(24, s2, 1), t4.setBigUint64(32, s2, 1), t4.setBigUint64(40, d2, 1), t4.setBigUint64(48, a3, 1), t4.setUint32(56, 1347094023), t4.setBigUint64(64, a3 + d2, 1), t4.setUint32(72, 1, 1), yield n(t4);
    }
    const l2 = e(22);
    l2.setUint32(0, 1347093766), l2.setUint16(8, r(s2), 1), l2.setUint16(10, r(s2), 1), l2.setUint32(12, i(d2), 1), l2.setUint32(16, i(a3), 1), yield n(l2);
  })(u2, a2), u2);
}

// docs/design/concepts/photography-20261030/arrival/data.js
var galleries = [
  {
    "id": "1",
    "title": "THE Chicago Point Series 18s & 17s #1",
    "rawTitle": "Club Boys VB - THE Chicago Point Series 18s & 17s #1 - 10-24-2026",
    "date": "Oct 24, 2026",
    "context": "Club Boys VB",
    "count": 49,
    "url": "https://ninochavez.co/photography/albums/club-boys-vb-the-chicago-point-series-18s-17s-1-10-24-2026-aBZN7D",
    "cover": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00189/medium",
    "alt": "Club Boys VB - THE Chicago Point Series 18s & 17s #1 - 10-24-2026 cover",
    "photos": [
      {
        "id": "DSC00124",
        "key": "aBZN7D-DSC00124",
        "ratio": 0.667,
        "alt": "A player in a red top crouches low on a wooden court.",
        "caption": "Player #11 in red prepares to receive, with players #10 in gray and #5, #30 in red visible on court.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00124/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00124/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00124/public",
        "url": "https://ninochavez.co/photography/photo/DSC00124?a=aBZN7D"
      },
      {
        "id": "DSC00125",
        "key": "aBZN7D-DSC00125",
        "ratio": 0.667,
        "alt": "A player in red reaches overhead for the ball while other players in red and white stand ready.",
        "caption": "A player in red reaches for the ball as red number 14 and white number 11 watch on the indoor court.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00125/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00125/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00125/public",
        "url": "https://ninochavez.co/photography/photo/DSC00125?a=aBZN7D"
      },
      {
        "id": "DSC00127",
        "key": "aBZN7D-DSC00127",
        "ratio": 0.667,
        "alt": "A player in red reaches forward with arms extended.",
        "caption": "A player in red with jersey number 2 prepares to hit the ball, while a player in red with jersey number 14 watches.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00127/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00127/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00127/public",
        "url": "https://ninochavez.co/photography/photo/DSC00127?a=aBZN7D"
      },
      {
        "id": "DSC00132",
        "key": "aBZN7D-DSC00132",
        "ratio": 0.667,
        "alt": "A player in red jumps with arms extended.",
        "caption": 'A player in red jumps high for the ball, with a banner reading "JUST PLAY. HAVE FUN." in the background.',
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00132/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00132/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00132/public",
        "url": "https://ninochavez.co/photography/photo/DSC00132?a=aBZN7D"
      },
      {
        "id": "DSC00133",
        "key": "aBZN7D-DSC00133",
        "ratio": 0.667,
        "alt": "A player in a red top reaches overhead for the ball while other players in red and white uniforms are on the court.",
        "caption": "Red number 18 jump-sets beside red number 33 while players in white, including number 8, watch from across the net.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00133/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00133/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00133/public",
        "url": "https://ninochavez.co/photography/photo/DSC00133?a=aBZN7D"
      },
      {
        "id": "DSC00134",
        "key": "aBZN7D-DSC00134",
        "ratio": 0.667,
        "alt": "Players in red and gray uniforms interact on a court.",
        "caption": "Players in red and gray uniforms celebrate on the court. Player 16 in red, player 6 in gray, player 18 in red, and player 3 in red are visible.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00134/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00134/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00134/public",
        "url": "https://ninochavez.co/photography/photo/DSC00134?a=aBZN7D"
      },
      {
        "id": "DSC00135",
        "key": "aBZN7D-DSC00135",
        "ratio": 0.667,
        "alt": "A player in red reaches over the net as a player in white jumps.",
        "caption": "Player #33 in red reaches over the net, while player #7 in white jumps. Player #18 in red watches the action.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00135/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00135/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00135/public",
        "url": "https://ninochavez.co/photography/photo/DSC00135?a=aBZN7D"
      },
      {
        "id": "DSC00136",
        "key": "aBZN7D-DSC00136",
        "ratio": 0.667,
        "alt": "A player in a gray and white striped uniform crouches with hands extended. Players in red uniforms stand on the court.",
        "caption": "A player in a gray and white striped jersey prepares to receive the ball, while players in red jerseys numbered 16, 37, 15, 13, 41, 7, and 19 watch.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00136/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00136/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00136/public",
        "url": "https://ninochavez.co/photography/photo/DSC00136?a=aBZN7D"
      },
      {
        "id": "DSC00139",
        "key": "aBZN7D-DSC00139",
        "ratio": 0.667,
        "alt": "A player in red jumps near the net while players in white reach up.",
        "caption": "Red number 33 jumps to attack beside red number 18, with red number 7 behind them and players in white reaching above the net.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00139/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00139/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00139/public",
        "url": "https://ninochavez.co/photography/photo/DSC00139?a=aBZN7D"
      },
      {
        "id": "DSC00140",
        "key": "aBZN7D-DSC00140",
        "ratio": 0.667,
        "alt": "A player in red jumps while a player in gray crouches low with arms extended.",
        "caption": "A player in red with jersey number 14 jumps as a player in gray with jersey number 12 prepares to receive the ball during a game.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00140/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00140/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00140/public",
        "url": "https://ninochavez.co/photography/photo/DSC00140?a=aBZN7D"
      },
      {
        "id": "DSC00143",
        "key": "aBZN7D-DSC00143",
        "ratio": 1.5,
        "alt": "A player in red jumps with a ball overhead, while another player in red moves forward and a player in white stands ready.",
        "caption": "Player #18 in red jumps to hit the ball, player #3 in red moves, and player #9 in white watches.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00143/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00143/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00143/public",
        "url": "https://ninochavez.co/photography/photo/DSC00143?a=aBZN7D"
      },
      {
        "id": "DSC00144",
        "key": "aBZN7D-DSC00144",
        "ratio": 1.5,
        "alt": "A player in red jumps with arms extended, while another player in red stands nearby and a player in white is at the net.",
        "caption": "A player in red jumps to hit the ball, with players in red jersey 18 and white jersey 7 visible, and a player in red jersey 50 on the left.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00144/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00144/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00144/public",
        "url": "https://ninochavez.co/photography/photo/DSC00144?a=aBZN7D"
      },
      {
        "id": "DSC00145",
        "key": "aBZN7D-DSC00145",
        "ratio": 0.667,
        "alt": "A player in red jumps and looks up at the ball.",
        "caption": "A player in red with jersey number 33 looks up at the ball in the air during a game.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00145/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00145/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00145/public",
        "url": "https://ninochavez.co/photography/photo/DSC00145?a=aBZN7D"
      },
      {
        "id": "DSC00146",
        "key": "aBZN7D-DSC00146",
        "ratio": 0.667,
        "alt": "A player in red jumps with arms extended, reaching for the ball.",
        "caption": "A player in red with jersey number 33 jumps to hit the ball during a game.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00146/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00146/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00146/public",
        "url": "https://ninochavez.co/photography/photo/DSC00146?a=aBZN7D"
      },
      {
        "id": "DSC00147",
        "key": "aBZN7D-DSC00147",
        "ratio": 0.667,
        "alt": "A player in red jumps with arms extended, reaching towards the net.",
        "caption": "Player #8 in red jumps near the net, player #18 in red jumps, and player #12 in light blue is in a ready stance.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00147/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00147/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00147/public",
        "url": "https://ninochavez.co/photography/photo/DSC00147?a=aBZN7D"
      },
      {
        "id": "DSC00148",
        "key": "aBZN7D-DSC00148",
        "ratio": 0.667,
        "alt": "A player in red reaches overhead for the ball.",
        "caption": "Player #37 in red jumps to hit the ball, while player #18 in red stands nearby, and player #1 in red is in the foreground.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00148/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00148/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00148/public",
        "url": "https://ninochavez.co/photography/photo/DSC00148?a=aBZN7D"
      },
      {
        "id": "DSC00151",
        "key": "aBZN7D-DSC00151",
        "ratio": 0.667,
        "alt": "A player in a red uniform crouches low on a court.",
        "caption": "A player in a red jersey with number 58 prepares for action, while players in red jerseys with numbers 16 and 7 are visible in the background.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00151/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00151/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00151/public",
        "url": "https://ninochavez.co/photography/photo/DSC00151?a=aBZN7D"
      },
      {
        "id": "DSC00152",
        "key": "aBZN7D-DSC00152",
        "ratio": 0.667,
        "alt": "A player in red reaches up with hands open as a ball flies overhead.",
        "caption": "A player in red with jersey number 16 prepares to hit the ball, while players in red with numbers 13, 41, and 7 watch the action on the court.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00152/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00152/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00152/public",
        "url": "https://ninochavez.co/photography/photo/DSC00152?a=aBZN7D"
      },
      {
        "id": "DSC00153",
        "key": "aBZN7D-DSC00153",
        "ratio": 0.667,
        "alt": "A player in red crouches with arms extended towards the ball.",
        "caption": "A player in red with jersey number 41 prepares to hit the ball, while players in red with numbers 33 and 13 are visible on the court.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00153/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00153/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00153/public",
        "url": "https://ninochavez.co/photography/photo/DSC00153?a=aBZN7D"
      },
      {
        "id": "DSC00156",
        "key": "aBZN7D-DSC00156",
        "ratio": 0.667,
        "alt": "A player in red reaches overhead for the ball while jumping. Another player in red stands nearby.",
        "caption": "Player #8 in red jumps to hit the ball, while player #37 in red watches. A player in a striped top is also visible.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00156/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00156/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00156/public",
        "url": "https://ninochavez.co/photography/photo/DSC00156?a=aBZN7D"
      },
      {
        "id": "DSC00157",
        "key": "aBZN7D-DSC00157",
        "ratio": 1.5,
        "alt": "A player in a gray jersey moves forward while other players in red jerseys stand nearby.",
        "caption": "Players in red jerseys numbered 13 and 41, and a player in a gray jersey numbered 6, stand on the court with a volleyball in the air.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00157/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00157/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00157/public",
        "url": "https://ninochavez.co/photography/photo/DSC00157?a=aBZN7D"
      },
      {
        "id": "DSC00159",
        "key": "aBZN7D-DSC00159",
        "ratio": 0.667,
        "alt": "A player in a gray striped uniform reaches up with both hands.",
        "caption": "A player in a gray striped jersey with number 6 jumps for the ball, while a player in a red jersey with number 18 stands nearby on the court.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00159/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00159/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00159/public",
        "url": "https://ninochavez.co/photography/photo/DSC00159?a=aBZN7D"
      },
      {
        "id": "DSC00161",
        "key": "aBZN7D-DSC00161",
        "ratio": 0.667,
        "alt": "A player in red reaches overhead with a ball, while a player in white extends hands forward.",
        "caption": "A player in red with jersey number 18 prepares to serve the ball, while a player in white with jersey number 10 reaches over the net.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00161/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00161/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00161/public",
        "url": "https://ninochavez.co/photography/photo/DSC00161?a=aBZN7D"
      },
      {
        "id": "DSC00162",
        "key": "aBZN7D-DSC00162",
        "ratio": 0.667,
        "alt": "A player in a red top and shorts jumps with one arm extended upwards. Another player in a white top is visible behind the net.",
        "caption": "A player in red jumps with arm raised, while a player in white with jersey number 24 is visible behind the net. Another player in red is in the background.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00162/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00162/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00162/public",
        "url": "https://ninochavez.co/photography/photo/DSC00162?a=aBZN7D"
      },
      {
        "id": "DSC00164",
        "key": "aBZN7D-DSC00164",
        "ratio": 0.667,
        "alt": "A player in red reaches up with a ball above their head.",
        "caption": "A player in red with jersey number 73 jumps to hit the ball, with another player in white visible behind the net.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00164/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00164/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00164/public",
        "url": "https://ninochavez.co/photography/photo/DSC00164?a=aBZN7D"
      },
      {
        "id": "DSC00166",
        "key": "aBZN7D-DSC00166",
        "ratio": 0.667,
        "alt": "A player in a gray jersey crouches with hands clasped.",
        "caption": "A player in a gray pinstripe jersey number 6 and a player in a red jersey number 13 are on the court during a game.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00166/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00166/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00166/public",
        "url": "https://ninochavez.co/photography/photo/DSC00166?a=aBZN7D"
      },
      {
        "id": "DSC00167",
        "key": "aBZN7D-DSC00167",
        "ratio": 0.667,
        "alt": "A player in a gray and white uniform holds a volleyball.",
        "caption": "A player in a gray and white striped jersey with number 6 holds a volleyball against a blue backdrop.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00167/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00167/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00167/public",
        "url": "https://ninochavez.co/photography/photo/DSC00167?a=aBZN7D"
      },
      {
        "id": "DSC00167-2",
        "key": "aBZN7D-DSC00167-2",
        "ratio": 0.667,
        "alt": "A player in a white and black uniform stands holding a ball.",
        "caption": "A player in a white and black striped jersey with number 6 holds a volleyball, standing against a dark blue wall.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00167-2/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00167-2/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00167-2/public",
        "url": "https://ninochavez.co/photography/photo/DSC00167-2?a=aBZN7D"
      },
      {
        "id": "DSC00168",
        "key": "aBZN7D-DSC00168",
        "ratio": 0.667,
        "alt": "A player in a gray and white striped jersey looks up at the ball.",
        "caption": "A player in a gray and white striped jersey with number 5 looks up at the ball in the air during a game.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00168/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00168/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00168/public",
        "url": "https://ninochavez.co/photography/photo/DSC00168?a=aBZN7D"
      },
      {
        "id": "DSC00171",
        "key": "aBZN7D-DSC00171",
        "ratio": 0.667,
        "alt": "A player in red jumps with arm extended for the ball. Another player in red stands nearby. A player in white reaches over the net.",
        "caption": "Player in red #33 jumps to hit the ball, player in red #18 watches, and player in white reaches over the net.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00171/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00171/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00171/public",
        "url": "https://ninochavez.co/photography/photo/DSC00171?a=aBZN7D"
      },
      {
        "id": "DSC00175",
        "key": "aBZN7D-DSC00175",
        "ratio": 1.5,
        "alt": "A player in red stands with arms crossed, while a player in yellow walks by. A ball is in the air.",
        "caption": "A player in red with jersey number 13 stands with arms crossed, while a player in yellow with jersey number 1 walks by. A ball is in the air.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00175/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00175/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00175/public",
        "url": "https://ninochavez.co/photography/photo/DSC00175?a=aBZN7D"
      },
      {
        "id": "DSC00182",
        "key": "aBZN7D-DSC00182",
        "ratio": 0.667,
        "alt": "A player in a grey jersey crouches low on the court.",
        "caption": "A player in a grey jersey with black stripes, number 6, crouches on the court while a player in a black top watches. Other players are visible in the background.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00182/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00182/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00182/public",
        "url": "https://ninochavez.co/photography/photo/DSC00182?a=aBZN7D"
      },
      {
        "id": "DSC00184",
        "key": "aBZN7D-DSC00184",
        "ratio": 0.667,
        "alt": "A player in red reaches up near the net as another player in white jumps and a player in red also jumps.",
        "caption": "Players in red (#15, #31) and white (#18) jump near the net with a ball in the air during a game.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00184/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00184/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00184/public",
        "url": "https://ninochavez.co/photography/photo/DSC00184?a=aBZN7D"
      },
      {
        "id": "DSC00187",
        "key": "aBZN7D-DSC00187",
        "ratio": 0.667,
        "alt": "Two players in red uniforms reach upwards near a net.",
        "caption": "Players in red jerseys, number 12 and 30, reach for the ball over the net during a game.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00187/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00187/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00187/public",
        "url": "https://ninochavez.co/photography/photo/DSC00187?a=aBZN7D"
      },
      {
        "id": "DSC00189",
        "key": "aBZN7D-DSC00189",
        "ratio": 0.667,
        "alt": "A player in red reaches overhead for the ball while in mid-air.",
        "caption": "Player #5 in red jumps to hit the ball, with players #30 in red and #13 in gray on the court.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00189/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00189/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00189/public",
        "url": "https://ninochavez.co/photography/photo/DSC00189?a=aBZN7D"
      },
      {
        "id": "DSC00190",
        "key": "aBZN7D-DSC00190",
        "ratio": 0.667,
        "alt": "A player in red jumps with arms extended toward the ball. A player in white reaches up. A player in gray watches.",
        "caption": "Player #30 in red jumps to hit the ball, while player #31 in white reaches up. Player #13 in gray watches.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00190/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00190/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00190/public",
        "url": "https://ninochavez.co/photography/photo/DSC00190?a=aBZN7D"
      },
      {
        "id": "DSC00192",
        "key": "aBZN7D-DSC00192",
        "ratio": 0.667,
        "alt": "A player in red jumps with arms extended, reaching for the ball. Another player in white reaches up.",
        "caption": "A player in red #5 jumps for the ball, while a player in white #11 reaches up. A player in red #10 is also visible.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00192/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00192/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00192/public",
        "url": "https://ninochavez.co/photography/photo/DSC00192?a=aBZN7D"
      },
      {
        "id": "DSC00193",
        "key": "aBZN7D-DSC00193",
        "ratio": 0.667,
        "alt": "A player in a red top and shorts reaches overhead for the ball.",
        "caption": "A player in red prepares to serve the ball, with a player in gray and black striped jersey number 13 visible.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00193/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00193/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00193/public",
        "url": "https://ninochavez.co/photography/photo/DSC00193?a=aBZN7D"
      },
      {
        "id": "DSC00194",
        "key": "aBZN7D-DSC00194",
        "ratio": 0.667,
        "alt": "A player in a red top reaches overhead for the ball while players in white tops jump with hands raised.",
        "caption": "A player in red with jersey number 10 reaches for the ball while players in white with jersey number 21 and an unreadable number jump to block.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00194/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00194/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00194/public",
        "url": "https://ninochavez.co/photography/photo/DSC00194?a=aBZN7D"
      },
      {
        "id": "DSC00195",
        "key": "aBZN7D-DSC00195",
        "ratio": 0.667,
        "alt": "A player in red crouches low on a wooden court.",
        "caption": "A player in red with jersey number 11 crouches low, while a player in gray with jersey number 13 stands ready on the court.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00195/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00195/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00195/public",
        "url": "https://ninochavez.co/photography/photo/DSC00195?a=aBZN7D"
      },
      {
        "id": "DSC00197",
        "key": "aBZN7D-DSC00197",
        "ratio": 0.667,
        "alt": "A player in a gray striped uniform jumps with arms extended towards the ball. Another player in a red uniform stands facing away.",
        "caption": "A player in a gray striped jersey jumps to hit the ball, while a player in a red jersey stands ready. Player 44 in a dark jersey is visible.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00197/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00197/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00197/public",
        "url": "https://ninochavez.co/photography/photo/DSC00197?a=aBZN7D"
      },
      {
        "id": "DSC00203",
        "key": "aBZN7D-DSC00203",
        "ratio": 1.5,
        "alt": "Players in red and black uniforms huddle together, with hands clasped.",
        "caption": "Players in red and black huddle. Player #17 in red and player #30 in black are visible, talking. Two other players in red and one in white are also present.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00203/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00203/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00203/public",
        "url": "https://ninochavez.co/photography/photo/DSC00203?a=aBZN7D"
      },
      {
        "id": "DSC00205",
        "key": "aBZN7D-DSC00205",
        "ratio": 0.667,
        "alt": "A player in red reaches up towards the ball.",
        "caption": "A player in a red jersey with number 11 prepares to hit the ball, with a player in red shorts visible.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00205/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00205/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00205/public",
        "url": "https://ninochavez.co/photography/photo/DSC00205?a=aBZN7D"
      },
      {
        "id": "DSC00210",
        "key": "aBZN7D-DSC00210",
        "ratio": 0.667,
        "alt": "A player in red reaches overhead for the ball while players in white jump to block.",
        "caption": "Player #10 in red jumps to hit the ball, while players in white (#15 and #10) reach up to block. Another player in white #10 is visible.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00210/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00210/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00210/public",
        "url": "https://ninochavez.co/photography/photo/DSC00210?a=aBZN7D"
      },
      {
        "id": "DSC00212",
        "key": "aBZN7D-DSC00212",
        "ratio": 0.667,
        "alt": "A player in a gray striped top dives low for the ball.",
        "caption": "A player in gray #15 dives for the ball; players in red #9 and red #4 are visible on the court.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00212/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00212/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00212/public",
        "url": "https://ninochavez.co/photography/photo/DSC00212?a=aBZN7D"
      },
      {
        "id": "DSC00213",
        "key": "aBZN7D-DSC00213",
        "ratio": 0.667,
        "alt": "A player in red reaches overhead for the ball while another player in white reaches up.",
        "caption": "Player #9 in red jumps to hit the ball, while player #25 in white reaches up. Player #4 in red watches.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00213/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00213/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00213/public",
        "url": "https://ninochavez.co/photography/photo/DSC00213?a=aBZN7D"
      },
      {
        "id": "DSC00214",
        "key": "aBZN7D-DSC00214",
        "ratio": 0.667,
        "alt": "A player in a black hoodie writes in a notebook while other players sit on the bench.",
        "caption": "A player in a black hoodie writes in a notebook while players in red and grey sit on the bench. A player in white socks and black shorts is visible.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00214/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00214/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00214/public",
        "url": "https://ninochavez.co/photography/photo/DSC00214?a=aBZN7D"
      },
      {
        "id": "DSC00215",
        "key": "aBZN7D-DSC00215",
        "ratio": 1.5,
        "alt": "Players in red and white uniforms sit on a bench, some looking at phones, one at a notebook.",
        "caption": "Players in red and white sit on the bench. Player #73 in white/black and player #6 in red are visible. One player in black looks at a notebook.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00215/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00215/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00215/public",
        "url": "https://ninochavez.co/photography/photo/DSC00215?a=aBZN7D"
      },
      {
        "id": "DSC00216",
        "key": "aBZN7D-DSC00216",
        "ratio": 0.667,
        "alt": "A player in a red jersey stands on a court, while a player in a white jersey with blue trim stands facing forward.",
        "caption": "A player in red with jersey number 8 and a player in white with jersey number 22 stand on the court near the net, with other players in the background.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00216/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00216/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00216/public",
        "url": "https://ninochavez.co/photography/photo/DSC00216?a=aBZN7D"
      }
    ],
    "albumKey": "aBZN7D",
    "source": "https://ninochavez.co/photography/api/album-photos?albumKey=aBZN7D&page=1"
  },
  {
    "id": "0",
    "title": "630 Picture Day",
    "rawTitle": "Club VB - 630 Picture Day - 10-27-2026",
    "date": "Oct 27, 2026",
    "context": "Club VB",
    "count": 36,
    "url": "https://ninochavez.co/photography/albums/club-vb-630-picture-day-10-27-2026-WvzFwu",
    "cover": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00264/medium",
    "alt": "Club VB - 630 Picture Day - 10-27-2026 cover",
    "photos": [
      {
        "id": "DSC00240",
        "key": "WvzFwu-DSC00240",
        "ratio": 0.667,
        "alt": "Four people in black tops pose with raised hands around a chair.",
        "caption": "Four people in black tops pose with raised hands, with one seated in a chair and three standing behind.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00240/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00240/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00240/public",
        "url": "https://ninochavez.co/photography/photo/DSC00240?a=WvzFwu"
      },
      {
        "id": "DSC00242",
        "key": "WvzFwu-DSC00242",
        "ratio": 0.667,
        "alt": "Four people in black tops pose around a chair.",
        "caption": "Four people in black tops pose together, with one seated in a chair and three standing behind.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00242/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00242/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00242/public",
        "url": "https://ninochavez.co/photography/photo/DSC00242?a=WvzFwu"
      },
      {
        "id": "DSC00250",
        "key": "WvzFwu-DSC00250",
        "ratio": 0.667,
        "alt": "Four people in black tops pose with hand gestures around a chair.",
        "caption": "Four people in black tops pose with hand gestures, with one seated in a chair and three standing behind.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00250/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00250/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00250/public",
        "url": "https://ninochavez.co/photography/photo/DSC00250?a=WvzFwu"
      },
      {
        "id": "DSC00252",
        "key": "WvzFwu-DSC00252",
        "ratio": 0.667,
        "alt": "A player in a black top and shorts holds a volleyball and flexes his arm.",
        "caption": "A player in a black jersey with red trim and number 5 holds a volleyball topped with a crown and flexes an arm.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00252/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00252/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00252/public",
        "url": "https://ninochavez.co/photography/photo/DSC00252?a=WvzFwu"
      },
      {
        "id": "DSC00254",
        "key": "WvzFwu-DSC00254",
        "ratio": 0.667,
        "alt": "A player in black and a person in pink hold a crowned volleyball beside a photo backdrop.",
        "caption": "A player in black with red trim and a person in pink hold a volleyball topped with a crown beside a photo backdrop.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00254/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00254/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00254/public",
        "url": "https://ninochavez.co/photography/photo/DSC00254?a=WvzFwu"
      },
      {
        "id": "DSC00255",
        "key": "WvzFwu-DSC00255",
        "ratio": 0.667,
        "alt": "A player in black stands beside a person in pink at a photo backdrop.",
        "caption": "A player in a black jersey with red trim and number 72 stands beside a person in pink at a photo backdrop.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00255/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00255/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00255/public",
        "url": "https://ninochavez.co/photography/photo/DSC00255?a=WvzFwu"
      },
      {
        "id": "DSC00256",
        "key": "WvzFwu-DSC00256",
        "ratio": 0.667,
        "alt": "A player in a black and red uniform stands facing forward with hands clasped behind their back, looking slightly to the right.",
        "caption": "A player in a black jersey with red trim and number 72 stands for a portrait against a light blue backdrop, with hands behind their back.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00256/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00256/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00256/public",
        "url": "https://ninochavez.co/photography/photo/DSC00256?a=WvzFwu"
      },
      {
        "id": "DSC00260",
        "key": "WvzFwu-DSC00260",
        "ratio": 0.667,
        "alt": "Players in black and red hold push-up positions on a photo backdrop while others stand behind.",
        "caption": "Players in black jerseys with red trim hold push-up positions on a photo backdrop, with numbers 54 and 55 standing behind.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00260/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00260/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00260/public",
        "url": "https://ninochavez.co/photography/photo/DSC00260?a=WvzFwu"
      },
      {
        "id": "DSC00263",
        "key": "WvzFwu-DSC00263",
        "ratio": 0.667,
        "alt": "A group of players in black and red uniforms stand on a court.",
        "caption": "Players in black jerseys with red trim, including numbers 33, 13, 58, 74, and 7, gather beside a photo backdrop.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00263/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00263/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00263/public",
        "url": "https://ninochavez.co/photography/photo/DSC00263?a=WvzFwu"
      },
      {
        "id": "DSC00264",
        "key": "WvzFwu-DSC00264",
        "ratio": 1.5,
        "alt": "Players in black and red uniforms stand on a court.",
        "caption": "Players in black jerseys with red trim, including numbers 6, 41, and 18, gather on a photo backdrop.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00264/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00264/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00264/public",
        "url": "https://ninochavez.co/photography/photo/DSC00264?a=WvzFwu"
      },
      {
        "id": "DSC00265",
        "key": "WvzFwu-DSC00265",
        "ratio": 0.667,
        "alt": "A person in a black top and black leggings smiles and holds up a small camera.",
        "caption": "A person in a black top smiles and raises a small camera in the gym.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00265/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00265/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00265/public",
        "url": "https://ninochavez.co/photography/photo/DSC00265?a=WvzFwu"
      },
      {
        "id": "DSC00266",
        "key": "WvzFwu-DSC00266",
        "ratio": 0.667,
        "alt": "Players in black uniforms stand with hands behind their backs.",
        "caption": "Players in black jerseys with red trim, including numbers 87 and 36, stand with their backs to the camera.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00266/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00266/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00266/public",
        "url": "https://ninochavez.co/photography/photo/DSC00266?a=WvzFwu"
      },
      {
        "id": "DSC00267",
        "key": "WvzFwu-DSC00267",
        "ratio": 0.667,
        "alt": "Players in black and red uniforms stand together on a court.",
        "caption": "Players in black and red uniforms, including number 5, 15, 41, and 7, stand together on the court.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00267/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00267/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00267/public",
        "url": "https://ninochavez.co/photography/photo/DSC00267?a=WvzFwu"
      },
      {
        "id": "DSC00268",
        "key": "WvzFwu-DSC00268",
        "ratio": 0.667,
        "alt": "A player in a black jersey stands with hands behind their back.",
        "caption": "A player in a black jersey with red trim, number 13, stands with hands behind his back. Another person in a pink top stands nearby.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00268/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00268/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00268/public",
        "url": "https://ninochavez.co/photography/photo/DSC00268?a=WvzFwu"
      },
      {
        "id": "DSC00271",
        "key": "WvzFwu-DSC00271",
        "ratio": 0.667,
        "alt": "A player in a black top and shorts holds a volleyball and a crown.",
        "caption": "A player in a black jersey with red trim and number 13 looks down while holding a volleyball topped with a crown.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00271/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00271/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00271/public",
        "url": "https://ninochavez.co/photography/photo/DSC00271?a=WvzFwu"
      },
      {
        "id": "DSC00272",
        "key": "WvzFwu-DSC00272",
        "ratio": 0.667,
        "alt": "A player in a black top and shorts stands with hands on hips, holding a volleyball.",
        "caption": "A player in a black jersey with red trim and number 13 stands with one hand on a hip, holding a crowned volleyball.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00272/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00272/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00272/public",
        "url": "https://ninochavez.co/photography/photo/DSC00272?a=WvzFwu"
      },
      {
        "id": "DSC00274",
        "key": "WvzFwu-DSC00274",
        "ratio": 0.667,
        "alt": "A player in a black top points at a card held by another player in a black top.",
        "caption": "A player in a black jersey with red trim points at a photo sheet while another player faces him.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00274/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00274/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00274/public",
        "url": "https://ninochavez.co/photography/photo/DSC00274?a=WvzFwu"
      },
      {
        "id": "DSC00275",
        "key": "WvzFwu-DSC00275",
        "ratio": 0.667,
        "alt": "A player in a dark jersey points at a photo sheet while another player faces him.",
        "caption": "A player in a dark jersey with red trim points at a photo sheet while a player wearing number 7 faces him.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00275/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00275/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00275/public",
        "url": "https://ninochavez.co/photography/photo/DSC00275?a=WvzFwu"
      },
      {
        "id": "DSC00277",
        "key": "WvzFwu-DSC00277",
        "ratio": 0.667,
        "alt": "A player in a black jersey and shorts stands holding a crown.",
        "caption": "A player in a black jersey with red trim, number 36, holds a crown while standing on a court.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00277/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00277/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00277/public",
        "url": "https://ninochavez.co/photography/photo/DSC00277?a=WvzFwu"
      },
      {
        "id": "DSC00278",
        "key": "WvzFwu-DSC00278",
        "ratio": 0.667,
        "alt": "A player in a dark jersey holds a volleyball beside a person in black at the photo setup.",
        "caption": "A player in a dark jersey with red trim and number 55 holds a volleyball beside a person in black at the photo setup.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00278/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00278/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00278/public",
        "url": "https://ninochavez.co/photography/photo/DSC00278?a=WvzFwu"
      },
      {
        "id": "DSC00279",
        "key": "WvzFwu-DSC00279",
        "ratio": 0.667,
        "alt": "A smiling player in a dark blue jersey and black shorts stands holding a volleyball with a crown on top.",
        "caption": "A player in a dark jersey with red trim and number 18 smiles while holding a volleyball topped with a crown.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00279/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00279/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00279/public",
        "url": "https://ninochavez.co/photography/photo/DSC00279?a=WvzFwu"
      },
      {
        "id": "DSC00281",
        "key": "WvzFwu-DSC00281",
        "ratio": 0.667,
        "alt": "A player in black with red trim carries another player horizontally for a photo.",
        "caption": "A player in black with red trim carries another player horizontally while posing for a photo.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00281/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00281/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00281/public",
        "url": "https://ninochavez.co/photography/photo/DSC00281?a=WvzFwu"
      },
      {
        "id": "DSC00282",
        "key": "WvzFwu-DSC00282",
        "ratio": 1.5,
        "alt": "A player in a black top with red trim holds another player in a black top with red trim.",
        "caption": "A player in black with red trim carries another player horizontally while both smile for a photo.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00282/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00282/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00282/public",
        "url": "https://ninochavez.co/photography/photo/DSC00282?a=WvzFwu"
      },
      {
        "id": "DSC00285",
        "key": "WvzFwu-DSC00285",
        "ratio": 0.667,
        "alt": "Three players in black jerseys stand together, with arms around each other.",
        "caption": "Three players in black jerseys with red trim, including player 13, player 6, and player 72, pose for a photo.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00285/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00285/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00285/public",
        "url": "https://ninochavez.co/photography/photo/DSC00285?a=WvzFwu"
      },
      {
        "id": "DSC00286",
        "key": "WvzFwu-DSC00286",
        "ratio": 0.667,
        "alt": "Three players in black jerseys stand together and point forward.",
        "caption": "Three players in black jerseys, number 13, 6, and 72, point forward while posing for a photo.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00286/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00286/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00286/public",
        "url": "https://ninochavez.co/photography/photo/DSC00286?a=WvzFwu"
      },
      {
        "id": "DSC00292",
        "key": "WvzFwu-DSC00292",
        "ratio": 0.667,
        "alt": "Three players in black and red pose with hand gestures over their eyes.",
        "caption": "Three players in black and red uniforms pose for a photo, with player 15, player 41, and player 18 making hand gestures over their eyes.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00292/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00292/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00292/public",
        "url": "https://ninochavez.co/photography/photo/DSC00292?a=WvzFwu"
      },
      {
        "id": "DSC00294",
        "key": "WvzFwu-DSC00294",
        "ratio": 0.667,
        "alt": "A person in a black top with red trim gestures towards another person in a black top.",
        "caption": "Two people in black and red raise their fists toward each other, with players wearing numbers 55 and 8 behind them.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00294/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00294/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00294/public",
        "url": "https://ninochavez.co/photography/photo/DSC00294?a=WvzFwu"
      },
      {
        "id": "DSC00296",
        "key": "WvzFwu-DSC00296",
        "ratio": 0.667,
        "alt": "Two people in black hold each other with arms raised beside the photo setup.",
        "caption": "Two people in black hold each other with arms raised, while players wearing numbers 55 and 8 stand behind them.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00296/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00296/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00296/public",
        "url": "https://ninochavez.co/photography/photo/DSC00296?a=WvzFwu"
      },
      {
        "id": "DSC00298",
        "key": "WvzFwu-DSC00298",
        "ratio": 0.667,
        "alt": "Two people in black tops with red trim pose with arms around each other.",
        "caption": "Two people in black tops with red trim stand with arms around each other and make hand gestures.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00298/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00298/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00298/public",
        "url": "https://ninochavez.co/photography/photo/DSC00298?a=WvzFwu"
      },
      {
        "id": "DSC00300",
        "key": "WvzFwu-DSC00300",
        "ratio": 0.667,
        "alt": "Three players in black and red uniforms are stacked on top of each other.",
        "caption": "Players in black and red jerseys, number 74, 16, and 7, pose for a photo. Player 74 is on top, with players 16 and 7 below.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00300/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00300/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00300/public",
        "url": "https://ninochavez.co/photography/photo/DSC00300?a=WvzFwu"
      },
      {
        "id": "DSC00308",
        "key": "WvzFwu-DSC00308",
        "ratio": 0.667,
        "alt": "Players in black and red crouch and point beside a crown on a photo backdrop.",
        "caption": "Players in black jerseys with red trim, including number 64, crouch and point beside a crown on a photo backdrop.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00308/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00308/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00308/public",
        "url": "https://ninochavez.co/photography/photo/DSC00308?a=WvzFwu"
      },
      {
        "id": "DSC00310",
        "key": "WvzFwu-DSC00310",
        "ratio": 0.667,
        "alt": "One player in black and red jumps beside another with hands raised at a photo backdrop.",
        "caption": "One player in black with red trim jumps beside another player with hands raised in front of a photo backdrop.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00310/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00310/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00310/public",
        "url": "https://ninochavez.co/photography/photo/DSC00310?a=WvzFwu"
      },
      {
        "id": "DSC00317",
        "key": "WvzFwu-DSC00317",
        "ratio": 0.667,
        "alt": "Three players in black and red uniforms stand with open hands.",
        "caption": "Three players in black and red uniforms pose for a photo, with player 6, player 7, and player 41 visible.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00317/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00317/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00317/public",
        "url": "https://ninochavez.co/photography/photo/DSC00317?a=WvzFwu"
      },
      {
        "id": "DSC00318",
        "key": "WvzFwu-DSC00318",
        "ratio": 0.667,
        "alt": "Three players in dark jerseys stand with open hands.",
        "caption": "Three players in dark jerseys with red trim pose for a photo; player 6, player 7, and player 41 are visible.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00318/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00318/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00318/public",
        "url": "https://ninochavez.co/photography/photo/DSC00318?a=WvzFwu"
      },
      {
        "id": "DSC00323",
        "key": "WvzFwu-DSC00323",
        "ratio": 0.667,
        "alt": "Two people in black tops pose with fists raised at a photo backdrop.",
        "caption": "Two people in black tops with red trim pose with fists raised in front of a photo backdrop.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00323/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00323/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00323/public",
        "url": "https://ninochavez.co/photography/photo/DSC00323?a=WvzFwu"
      },
      {
        "id": "DSC00328",
        "key": "WvzFwu-DSC00328",
        "ratio": 0.667,
        "alt": "Players in dark jerseys gather around a person in blue holding a sheet.",
        "caption": "Players in dark jerseys with red trim, including numbers 11, 3, and 27, gather around a person in blue holding a sheet.",
        "src": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00328/medium",
        "large": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00328/large",
        "original": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00328/public",
        "url": "https://ninochavez.co/photography/photo/DSC00328?a=WvzFwu"
      }
    ],
    "albumKey": "WvzFwu",
    "source": "https://ninochavez.co/photography/api/album-photos?albumKey=WvzFwu&page=1"
  }
];
var recentGalleries = [
  {
    "id": "0",
    "title": "630 Picture Day",
    "rawTitle": "Club VB - 630 Picture Day - 10-27-2026",
    "date": "Oct 27, 2026",
    "context": "Club VB",
    "count": 36,
    "url": "https://ninochavez.co/photography/albums/club-vb-630-picture-day-10-27-2026-WvzFwu",
    "cover": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/WvzFwu-DSC00264/medium",
    "alt": "Club VB - 630 Picture Day - 10-27-2026 cover"
  },
  {
    "id": "1",
    "title": "THE Chicago Point Series 18s & 17s #1",
    "rawTitle": "Club Boys VB - THE Chicago Point Series 18s & 17s #1 - 10-24-2026",
    "date": "Oct 24, 2026",
    "context": "Club Boys VB",
    "count": 49,
    "url": "https://ninochavez.co/photography/albums/club-boys-vb-the-chicago-point-series-18s-17s-1-10-24-2026-aBZN7D",
    "cover": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/aBZN7D-DSC00189/medium",
    "alt": "Club Boys VB - THE Chicago Point Series 18s & 17s #1 - 10-24-2026 cover"
  },
  {
    "id": "2",
    "title": "630 Breeze Tryouts",
    "rawTitle": "Women's VB - 630 Breeze Tryouts - 10-18-2026",
    "date": "Oct 18, 2026",
    "context": "Women's VB",
    "count": 45,
    "url": "https://ninochavez.co/photography/albums/womens-vb-630-breeze-tryouts-10-18-2026-1D0kMz",
    "cover": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/1D0kMz-DSC09889/medium",
    "alt": "Women's VB - 630 Breeze Tryouts - 10-18-2026 cover"
  },
  {
    "id": "3",
    "title": "Skin Abrasions",
    "rawTitle": "Skin Abrasions - 10-12-2026",
    "date": "Oct 12, 2026",
    "context": "",
    "count": 62,
    "url": "https://ninochavez.co/photography/albums/skin-abrasions-10-12-2026-LCh87H",
    "cover": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/LCh87H-DSC09632/medium",
    "alt": "Skin Abrasions - 10-12-2026 cover"
  },
  {
    "id": "4",
    "title": "Millikin at North Central",
    "rawTitle": "College Women's VB - Millikin at North Central - 09-23-2026",
    "date": "Sep 23, 2026",
    "context": "College Women's VB",
    "count": 43,
    "url": "https://ninochavez.co/photography/albums/college-womens-vb-millikin-at-north-central-09-23-2026-DWdCET",
    "cover": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/DWdCET-DSC09443/medium",
    "alt": "College Women's VB - Millikin at North Central - 09-23-2026 cover"
  },
  {
    "id": "5",
    "title": "JCA at ACC",
    "rawTitle": "HS Girls VB - JCA at ACC - 09-22-2026",
    "date": "Sep 22, 2026",
    "context": "HS Girls VB",
    "count": 120,
    "url": "https://ninochavez.co/photography/albums/hs-girls-vb-jca-at-acc-09-22-2026-Re7kho",
    "cover": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/Re7kho-acc-v-jca-39/medium",
    "alt": "HS Girls VB - JCA at ACC - 09-22-2026 cover"
  },
  {
    "id": "6",
    "title": "JCA vs PNHS",
    "rawTitle": "HS Girls VB - JCA vs PNHS - 08-25-2026",
    "date": "Aug 25, 2026",
    "context": "HS Girls VB",
    "count": 241,
    "url": "https://ninochavez.co/photography/albums/hs-girls-vb-jca-vs-pnhs-08-25-2026-fJKdsB",
    "cover": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/fJKdsB-DSC08708/medium",
    "alt": "HS Girls VB - JCA vs PNHS - 08-25-2026 cover"
  },
  {
    "id": "7",
    "title": "Bump Bash #5 - Charity Volleyball Tournament",
    "rawTitle": "Bump Bash #5 - Charity Volleyball Tournament - 08-22-2026",
    "date": "Aug 22, 2026",
    "context": "",
    "count": 162,
    "url": "https://ninochavez.co/photography/albums/bump-bash-5-charity-volleyball-tournament-08-22-2026-eqYF0h",
    "cover": "https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/eqYF0h-DSC08414/medium",
    "alt": "Bump Bash #5 - Charity Volleyball Tournament - 08-22-2026 cover"
  }
];
var selectedWork = [
  {
    "src": "https://ninochavez.co/photography/images/hero/flickday/fd-12.webp",
    "alt": "Volleyball players celebrating together near the net",
    "width": 1920,
    "height": 1280,
    "key": "w-13"
  },
  {
    "src": "https://ninochavez.co/photography/images/hero/flickday/triptych/t-28.webp",
    "alt": "A player in black airborne beside an indoor volleyball net",
    "width": 900,
    "height": 1351,
    "key": "w-11"
  },
  {
    "src": "https://ninochavez.co/photography/images/hero/flickday/triptych/t-27.webp",
    "alt": "A player crouching on a grass court, in black and white",
    "width": 900,
    "height": 1351,
    "key": "w-10"
  },
  {
    "src": "https://ninochavez.co/photography/images/hero/flickday/triptych/t-16.webp",
    "alt": "A player in a red top passing a yellow volleyball on sand",
    "width": 900,
    "height": 1351,
    "key": "w-2"
  },
  {
    "src": "https://ninochavez.co/photography/images/hero/flickday/triptych/t-20.webp",
    "alt": "An indoor volleyball attack facing three players at the net",
    "width": 900,
    "height": 1351,
    "key": "w-5"
  },
  {
    "src": "https://ninochavez.co/photography/images/hero/flickday/triptych/t-19.webp",
    "alt": "Two people in shallow water beneath a pier, in black and white",
    "width": 900,
    "height": 1351,
    "key": "w-4"
  }
];

// src/lib/gallery/photo-row-layout.ts
var FALLBACK_ASPECT_RATIO = 4 / 3;
var COLUMN_COUNTS = [1, 2, 3, 4];
function getPhotoAspectRatio(photo) {
  const candidates = [photo.aspect_ratio, photo.exif?.aspect_ratio];
  if (photo.exif?.width && photo.exif.height) {
    candidates.push(photo.exif.width / photo.exif.height);
  }
  return candidates.find((ratio) => typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0) ?? FALLBACK_ASPECT_RATIO;
}
function createFittedPhotoLayout(photos) {
  const ratios = photos.map(getPhotoAspectRatio);
  return photos.map((photo, index) => {
    const shares = {};
    for (const columns of COLUMN_COUNTS) {
      const rowStart = Math.floor(index / columns) * columns;
      const rowRatios = ratios.slice(rowStart, rowStart + columns);
      const rowTotal = rowRatios.reduce((total, ratio) => total + ratio, 0);
      const missingCells = columns - rowRatios.length;
      const paddedTotal = rowTotal + rowTotal / rowRatios.length * missingCells;
      shares[columns] = ratios[index] / paddedTotal;
    }
    return { photo, index, aspectRatio: ratios[index], shares };
  });
}

// docs/design/concepts/photography-20261030/arrival/app.source.js
var app = document.querySelector("#app");
var viewer = document.querySelector("#viewer");
var action = document.querySelector("#action");
var notice = document.querySelector("#notice");
var storageKey = "photography-arrival-study-saved";
var esc = (s2 = "") => String(s2).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var params = () => new URLSearchParams(location.search);
var currentGallery = () => galleries.find((g2) => g2.albumKey === params().get("gallery")) || galleries[0];
var model = () => ["beside", "sequence"].includes(params().get("model")) ? params().get("model") : "sheet";
var allPhotos = galleries.flatMap((g2) => g2.photos.map((p2) => ({ ...p2, gallery: g2 })));
var photoByKey = (key) => allPhotos.find((p2) => p2.key === key);
var saved = [];
var persistent = true;
var activePhoto = null;
var viewerReturn = null;
var inlinePhoto = null;
var noticeTimer;
var downloading = false;
var abortDownload = null;
try {
  saved = JSON.parse(localStorage.getItem(storageKey) || "[]").filter((k) => photoByKey(k));
} catch {
  persistent = false;
}
function url(values = {}, keep = false) {
  const p2 = keep ? params() : new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === "") p2.delete(key);
    else p2.set(key, value);
  }
  return `?${p2}`;
}
function say(message) {
  clearTimeout(noticeTimer);
  notice.textContent = message;
  notice.classList.add("shown");
  noticeTimer = setTimeout(() => notice.classList.remove("shown"), 5e3);
}
function image(p2, eager = false) {
  return `<img src="${esc(p2.src || p2.cover)}" alt="${esc(p2.alt)}" loading="${eager ? "eager" : "lazy"}" decoding="sync" style="aspect-ratio:${Number(p2.ratio) || 2 / 3}">`;
}
var external = 'target="_blank" rel="noopener"';
function header() {
  const home2 = params().get("page") === "home" && !params().get("q");
  return `<header class="site-header"><a class="brand" href="?page=home" data-nav><strong>Nino Chavez</strong><span>Photography</span></a><nav aria-label="Photography"><button class="info-link" data-info>About &amp; contact</button>${home2 ? '<a class="find-link" href="#find-event">Find your event</a>' : '<a class="find-link" href="?page=home" data-nav>Find your event</a>'}<a href="?page=saved" data-nav>Saved <span data-saved-total>${saved.length || ""}</span></a></nav></header>`;
}
function footer() {
  return `<footer><p>Photographs by Nino Chavez</p><nav aria-label="More"><a href="?page=work" data-nav>Selected photographs</a><a href="https://ninochavez.co/photography/coverage" ${external}>Request coverage \u2197</a><a href="https://ninochavez.co" ${external}>Profile \u2197</a><a href="https://ninochavez.co/blog" ${external}>Writing \u2197</a></nav></footer>`;
}
function galleryTarget(g2, entry = "") {
  const full = galleries.find((a2) => a2.url === g2.url);
  return full ? `href="${url({ gallery: full.albumKey, from: "home", entry, q: params().get("q") || "" })}" data-nav` : `href="${esc(g2.url)}" ${external}`;
}
function home() {
  const query = params().get("q") || "";
  const normalize = (value) => value.toLowerCase().replace(/october/g, "oct").replace(/september/g, "sep").replace(/august/g, "aug").replace(/[^a-z0-9]+/g, " ");
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  const list = recentGalleries.filter((g2) => terms.every((t2) => normalize(`${g2.title} ${g2.rawTitle} ${g2.date}`).includes(t2)));
  const search = `<form data-event-search class="event-search"><label for="event-query">Event, team or date</label><div><input id="event-query" name="q" type="search" value="${esc(query)}" placeholder="e.g. Chicago Point" autocomplete="off"><button type="submit" class="search-submit">Search</button></div></form>`;
  const hero = `<section class="home-hero" aria-label="Nino Chavez Photography"><picture class="hero-picture"><source media="(max-width:700px)" srcset="../assets/images/hero/flickday/fd-12-mobile.webp"><img src="../assets/images/hero/flickday/fd-12.webp" alt="Volleyball players celebrating together near the net" width="1920" height="1280" fetchpriority="high"></picture><div class="hero-shade"></div><div class="hero-bottom"><div class="hero-finder" id="find-event"><h1>Find your event.</h1>${search}<a class="browse-link" href="#recent-events">Browse recent events <span aria-hidden="true">\u2193</span></a></div><section class="hero-recent" aria-label="Latest galleries"><h2>Recent galleries</h2>${recentGalleries.slice(0, 2).map((g2) => `<a id="event-latest-${g2.id}" ${galleryTarget(g2, "latest")}><strong class="gallery-title">${esc(g2.title)}</strong><span class="gallery-meta"><span>${esc(g2.date)}</span><span class="gallery-cta">View gallery <span aria-hidden="true">\u2192</span></span></span></a>`).join("")}</section></div></section>`;
  return `<main id="main" class="${query ? "page home search-page" : "home"}" tabindex="-1">${query ? `<section class="home-intro"><h1>Find your event</h1>${search}</section>` : hero}<section class="recent-events" id="recent-events" aria-labelledby="recent-title" tabindex="-1"><div class="section-title"><h2 id="recent-title">${query ? `Results for \u201C${esc(query)}\u201D` : "Recent events"}</h2>${query ? '<a href="?page=home" data-nav>Clear search</a>' : `<a href="https://ninochavez.co/photography/albums" ${external}>All events \u2197</a>`}</div>${list.length ? `<div class="event-list">${list.map((g2, i2) => `<a class="event-card" id="event-${g2.id}" ${galleryTarget(g2)}>${image({ src: g2.cover, alt: g2.alt, ratio: 1.5 }, i2 < 2)}<div><p class="metadata">${esc(g2.date)} <span>${esc(g2.context)}</span></p><h3>${esc(g2.title)}</h3><p class="event-count">${g2.count} photos</p></div></a>`).join("")}</div>` : `<div class="empty"><h3>No matching galleries in this preview</h3><p>Try the event name, team or date. This study includes eight recent public galleries.</p><a class="button primary" href="https://ninochavez.co/photography/albums?q=${encodeURIComponent(query)}" ${external}>Search the full archive \u2197</a><p>For a private gallery, use the link you received.</p></div>`}</section><div class="archive-end"><a class="button" href="https://ninochavez.co/photography/albums" ${external}>Browse the full archive \u2197</a><p class="muted">Have a private gallery link? Open that link to view its photos.</p></div></main>`;
}
function saveButton(p2) {
  const yes = saved.includes(p2.key);
  return `<button class="save-button ${yes ? "is-saved" : ""}" data-save="${esc(p2.key)}" aria-pressed="${yes}" aria-label="${yes ? "Remove saved" : "Save"} ${esc(p2.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v16l-6-4-6 4z"/></svg><span>${yes ? "Saved" : "Save"}</span></button>`;
}
function tile(p2, index = 0, compact = false, shares = null) {
  const style = shares ? `style="--share-2:${shares[2]};--share-3:${shares[3]};--share-4:${shares[4]}"` : "";
  return `<article class="photo-tile ${saved.includes(p2.key) ? "is-saved" : ""}" ${style}><button class="photo-open" id="photo-${esc(p2.key)}" data-photo="${esc(p2.key)}" aria-label="View ${esc(p2.id)}">${image(p2, index < 8)}</button><div class="tile-label"><span>${esc(p2.id)}</span>${compact ? "" : saveButton(p2)}</div></article>`;
}
function fittedGrid(list) {
  const layout = createFittedPhotoLayout(list.map((p2) => ({ ...p2, aspect_ratio: p2.ratio })));
  return `<div class="photo-grid fitted-grid">${layout.map(({ photo, index, shares }) => tile(photo, index, false, shares)).join("")}</div>`;
}
function scopedPhotos() {
  const g2 = currentGallery(), query = (params().get("find") || "").toLowerCase().trim();
  const terms = query.split(/\s+/).filter(Boolean);
  return allPhotos.filter((p2) => p2.gallery.albumKey === g2.albumKey && (params().get("saved") !== "1" || saved.includes(p2.key)) && terms.every((t2) => `${p2.id} ${p2.caption} ${p2.alt}`.toLowerCase().includes(t2)));
}
function gallery() {
  const g2 = currentGallery(), list = scopedPhotos(), query = params().get("find") || "";
  const selected = g2.photos.filter((p2) => saved.includes(p2.key)).length;
  const isSaved = params().get("saved") === "1";
  const sourceLink = params().get("from") === "home" ? `<a href="${url({ page: "home", q: params().get("q") || "" })}" data-nav data-return-event="${params().get("entry") === "latest" ? "latest-" : ""}${g2.id}">\u2190 Back to galleries</a>` : "";
  const active = list.find((p2) => p2.key === inlinePhoto) || list[0];
  if (active) inlinePhoto = active.key;
  return `<main id="main" class="page gallery model-${model()}" tabindex="-1">${sourceLink ? `<div class="back-link">${sourceLink}</div>` : ""}<section class="gallery-intro"><div><p class="metadata">${esc(g2.date)} \xB7 ${esc(g2.context)}</p><h1>${esc(g2.title)}</h1><p class="byline">${g2.count} photos \xB7 By Nino Chavez</p></div><div class="gallery-actions"><button data-share-gallery>Share gallery</button><button data-download-gallery>Download all</button></div></section><div class="gallery-tools"><nav aria-label="Photos in this gallery"><a class="${!isSaved ? "active" : ""}" href="${url({ saved: null, find: null }, true)}" data-nav ${!isSaved ? 'aria-current="page"' : ""}>All photos <span>${g2.count}</span></a><a class="${isSaved ? "active" : ""}" href="${url({ saved: 1, find: null }, true)}" data-nav ${isSaved ? 'aria-current="page"' : ""}>Saved <span>${selected}</span></a></nav><details class="photo-finder" ${query ? "open" : ""}><summary><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>Search photos</summary><form data-photo-search><label for="photo-query">Photo number or description</label><div><input id="photo-query" name="find" type="search" placeholder="e.g. red jersey 11" value="${esc(query)}"><button>Find</button></div><small>Try a jersey number, color or photo number.</small></form></details></div>${query ? `<div class="search-result" role="status">${list.length} photos matching \u201C${esc(query)}\u201D <a href="${url({ find: null }, true)}" data-nav>Clear search</a></div>` : ""}${list.length ? model() === "sheet" ? fittedGrid(list) : `<div class="inspection-layout"><section class="inline-viewer" aria-label="Current photograph">${inspect(active, list, false)}</section><section class="contact-pane" aria-label="Gallery photographs">${model() === "sequence" ? `<details><summary>See all ${list.length} photos</summary><div class="photo-grid mini">${list.map((p2, i2) => tile(p2, i2, true)).join("")}</div></details>` : `<div class="photo-grid mini">${list.map((p2, i2) => tile(p2, i2, true)).join("")}</div>`}</section></div>` : `<section class="empty"><h2>${isSaved ? "No saved photos in this gallery" : "No matching photos"}</h2><p>${isSaved ? "Use Save on any photo to keep it here, then download your selection." : "Try a photo number, jersey color or a different description."}</p><a class="button" href="${url({ saved: null, find: null }, true)}" data-nav>View all ${g2.count} photos</a></section>`}<div class="gallery-end"><p>You\u2019ve reached the end of ${query || isSaved ? "this selection" : "the gallery"}.</p><a href="#main">Back to top \u2191</a></div><div id="selection-bar">${selectionBar()}</div></main>`;
}
function selectionBar() {
  if (params().get("page")) return "";
  const g2 = currentGallery(), count = saved.filter((k) => photoByKey(k)?.gallery.albumKey === g2.albumKey).length;
  return count ? `<aside class="selection-bar" aria-label="Saved selection"><div><strong>${count} saved</strong><span>From this gallery \xB7 ${persistent ? "on this browser" : "until this page closes"}</span></div><button class="primary" data-download-saved="${g2.albumKey}">Download saved (${count})</button></aside>` : "";
}
function savedPage() {
  const list = allPhotos.filter((p2) => saved.includes(p2.key));
  return `<main id="main" class="page saved-page" tabindex="-1"><div class="saved-intro"><div><p class="eyebrow">Your selection</p><h1>Saved photos</h1><p>${persistent ? "Saved on this browser." : "Browser storage is unavailable. These saves last until this page closes."} No account or sign-in.</p></div>${list.length ? `<button class="primary" data-download-saved="all">Download saved (${list.length})</button>` : ""}</div>${list.length ? galleries.filter((g2) => list.some((p2) => p2.gallery === g2)).map((g2) => `<section class="saved-gallery"><div class="section-title"><h2>${esc(g2.title)}</h2><a href="${url({ gallery: g2.albumKey })}" data-nav>View gallery \u2192</a></div>${fittedGrid(list.filter((p2) => p2.gallery === g2))}</section>`).join("") : `<section class="empty"><h2>No saved photos yet</h2><p>Save photos while you browse. Return here to download them together.</p><a class="button primary" href="?page=home" data-nav>Find your gallery</a></section>`}</main>`;
}
function workPage() {
  return `<main id="main" class="page work-page" tabindex="-1"><div class="section-title"><div><p class="eyebrow">Nino Chavez</p><h1>Selected photographs</h1></div><a href="https://ninochavez.co/photography/coverage" ${external}>Request coverage \u2197</a></div><div class="work-grid">${selectedWork.map((p2, i2) => `<a href="${esc(p2.url)}" ${external}>${image(p2, i2 < 3)}</a>`).join("")}</div><a href="?page=home" class="button" data-nav>Find your event photos</a></main>`;
}
function inspect(p2, list, modal) {
  const index = list.findIndex((x) => x.key === p2.key), fullIndex = p2.gallery.photos.findIndex((x) => x.key === p2.key);
  return `<div class="viewer-top"><div><span class="viewer-event">${esc(p2.gallery.title)}</span><span class="viewer-context">${esc(p2.gallery.date)} \xB7 Photo ${fullIndex + 1} of ${p2.gallery.count}</span></div>${modal ? "<button data-close-viewer>Back to gallery</button>" : ""}</div><div class="photo-stage"><img src="${esc(p2.large)}" alt="${esc(p2.alt)}" decoding="sync"><button class="previous" data-step="-1" aria-label="Previous photo" ${index === 0 ? "disabled" : ""}>\u2190</button><button class="next" data-step="1" aria-label="Next photo" ${index === list.length - 1 ? "disabled" : ""}>\u2192</button></div><div class="viewer-bottom"><span class="photo-id">${esc(p2.id)}</span><div class="viewer-actions">${saveButton(p2)}<button data-share-photo="${esc(p2.key)}">Share</button><button class="primary" data-download-photo="${esc(p2.key)}">Download</button></div></div>`;
}
function viewerList(p2) {
  return allPhotos.filter((x) => x.gallery.albumKey === p2.gallery.albumKey);
}
function openViewer(p2, origin = null, updateUrl = true) {
  activePhoto = p2;
  viewerReturn = origin || document.querySelector(`#photo-${CSS.escape(p2.key)}`);
  viewer.innerHTML = inspect(p2, viewerList(p2), true);
  if (!viewer.open) viewer.showModal();
  if (updateUrl) history.replaceState(history.state, "", url({ photo: p2.id, gallery: p2.gallery.albumKey }, true));
  viewer.querySelector("[data-close-viewer]").focus();
}
function closeViewer() {
  viewer.close();
  history.replaceState(history.state, "", url({ photo: null }, true));
  const target = viewerReturn?.isConnected ? viewerReturn : document.querySelector(`#photo-${CSS.escape(activePhoto?.key || "")}`);
  target?.focus({ preventScroll: true });
  target?.scrollIntoView({ block: "nearest" });
  activePhoto = null;
}
function render(options = {}) {
  const p2 = params().get("page");
  document.body.classList.toggle("gallery-shell", !p2);
  document.body.classList.toggle("home-shell", p2 === "home" && !params().get("q"));
  app.innerHTML = header() + (p2 === "home" ? home() : p2 === "saved" ? savedPage() : p2 === "work" ? workPage() : gallery()) + footer();
  document.title = p2 === "home" ? "Find event photos \u2014 Nino Chavez" : p2 === "saved" ? "Saved photos \u2014 Nino Chavez" : p2 === "work" ? "Selected photographs \u2014 Nino Chavez" : `${currentGallery().title} \u2014 Nino Chavez`;
  const deep = params().get("photo");
  if (deep) {
    const photo = allPhotos.find((x) => x.gallery.albumKey === currentGallery().albumKey && x.id === deep);
    if (photo) openViewer(photo, null, false);
  }
  if (options.focus && !viewer.open) document.querySelector("#main").focus({ preventScroll: true });
  for (const img of app.querySelectorAll("img")) img.addEventListener("error", () => {
    img.classList.add("image-unavailable");
    img.closest(".photo-tile,.event-card")?.classList.add("image-failed");
  }, { once: true });
}
function navigate(href, focusId = null) {
  history.replaceState({ ...history.state, scroll: scrollY, focus: document.activeElement?.id }, "");
  if (viewer.open) viewer.close();
  document.querySelector(".study-bar details").open = false;
  history.pushState({}, "", href);
  inlinePhoto = null;
  render({ focus: true });
  if (focusId) {
    const el = document.getElementById(focusId);
    el?.focus();
    el?.scrollIntoView({ block: "center" });
  } else window.scrollTo(0, 0);
}
function toggleSave(key) {
  const exists = saved.includes(key);
  saved = exists ? saved.filter((k) => k !== key) : [...saved, key];
  try {
    localStorage.setItem(storageKey, JSON.stringify(saved));
  } catch {
    persistent = false;
  }
  for (const b2 of document.querySelectorAll("[data-save]")) if (b2.dataset.save === key) {
    b2.outerHTML = saveButton(photoByKey(key));
  }
  for (const tile2 of document.querySelectorAll(".photo-tile")) {
    const key2 = tile2.querySelector("[data-photo]")?.dataset.photo;
    tile2.classList.toggle("is-saved", saved.includes(key2));
  }
  document.querySelectorAll("[data-saved-total]").forEach((el) => el.textContent = saved.length || "");
  const count = saved.filter((k) => photoByKey(k)?.gallery.albumKey === currentGallery().albumKey).length;
  const tab = document.querySelector('.gallery-tools a[href*="saved=1"] span');
  if (tab) tab.textContent = count;
  const bar = document.querySelector("#selection-bar");
  if (bar) bar.innerHTML = selectionBar();
  if (params().get("page") === "saved" && !viewer.open || params().get("saved") === "1" && !viewer.open) render({ focus: true });
  say(exists ? "Removed from saved photos." : persistent ? "Saved on this browser." : "Saved for now. Browser storage is unavailable; keep this page open.");
}
function showAction(content) {
  action.innerHTML = `<div class="action-heading"><h2>${content.title}</h2><button data-close-action aria-label="Close">\xD7</button></div>${content.body}`;
  action.showModal();
}
function sharePhoto(p2) {
  share(p2.url, "Share this photo");
}
function share(link, title) {
  showAction({ title, body: `<p>Anyone with this public link can view the photo${title.includes("gallery") ? "s in the gallery" : ""}.</p><label class="copy-label">Link<input id="copy-link" readonly value="${esc(link)}"></label><button class="primary wide" data-copy>Copy link</button>` });
}
function downloadOptions(photos, title) {
  const keys = photos.map((p2) => p2.key).join(",");
  showAction({ title, body: `<p>${photos.length === 1 ? "Choose a size." : `${photos.length} photos will be downloaded together as a ZIP file.`}</p><div class="download-options"><button data-download-keys="${keys}" data-size="large"><strong>For sharing</strong><span>1600px \xB7 ${photos.length === 1 ? "JPEG" : "ZIP"}</span><span aria-hidden="true">\u2193</span></button>${photos.length === 1 ? `<button data-download-keys="${keys}" data-size="original"><strong>Full size</strong><span>Original resolution \xB7 JPEG</span><span aria-hidden="true">\u2193</span></button>` : ""}</div><p class="rights">Photos are for personal use and recruiting purposes only.</p><div class="download-status" role="status" aria-live="polite"></div>` });
}
function fileDownload(blob, name) {
  const u2 = URL.createObjectURL(blob), a2 = document.createElement("a");
  a2.href = u2;
  a2.download = name;
  document.body.append(a2);
  a2.click();
  a2.remove();
  setTimeout(() => URL.revokeObjectURL(u2), 6e4);
}
async function downloadPhotos(keys, size) {
  if (downloading) return;
  downloading = true;
  abortDownload = new AbortController();
  const list = keys.map(photoByKey).filter(Boolean), state = action.querySelector(".download-status");
  action.querySelectorAll("[data-download-keys]").forEach((b2) => b2.disabled = true);
  try {
    const files = [];
    for (const p2 of list) {
      state.textContent = `Preparing ${files.length + 1} of ${list.length}\u2026`;
      const source = size === "original" ? p2.original : p2.large;
      const response = await fetch(`https://ninochavez.co/photography/api/download?url=${encodeURIComponent(source)}&filename=${encodeURIComponent(`${p2.id}.jpg`)}`, { signal: abortDownload.signal });
      if (!response.ok || !response.headers.get("content-type")?.includes("image/")) throw new Error("image_request_failed");
      files.push({ name: `${p2.gallery.albumKey}-${p2.id}.jpg`, input: await response.blob() });
    }
    if (list.length === 1) fileDownload(files[0].input, files[0].name);
    else fileDownload(await A(files).blob(), "nino-chavez-saved-photos.zip");
    state.textContent = `${list.length === 1 ? "Photo" : "ZIP"} ready. Check your browser\u2019s downloads.`;
  } catch (e2) {
    state.textContent = e2.name === "AbortError" ? "Download preparation cancelled." : "Could not prepare the download. Your saved photos are still here. Try again.";
  } finally {
    downloading = false;
    abortDownload = null;
    action.querySelectorAll("[data-download-keys]").forEach((b2) => b2.disabled = false);
  }
}
document.addEventListener("click", async (e2) => {
  const b2 = e2.target.closest("button,a");
  if (!b2) return;
  if (b2.matches("[data-nav]")) {
    if (e2.metaKey || e2.ctrlKey || e2.shiftKey || e2.altKey) return;
    e2.preventDefault();
    navigate(b2.getAttribute("href"), b2.dataset.returnEvent ? `event-${b2.dataset.returnEvent}` : null);
  } else if (b2.matches("[data-info]")) showAction({ title: "Nino Chavez", body: `<p class="info-description">Volleyball and action-sports photography, from club tournaments to high school and college matches.</p><div class="info-actions"><a href="mailto:nino@ninochavez.co">nino@ninochavez.co \u2197</a><a href="https://ninochavez.co/photography/coverage" ${external}>Request event coverage \u2197</a><a href="https://www.instagram.com/nino.chavez.photo" ${external}>Instagram \u2197</a><a href="https://ninochavez.co" ${external}>About Nino \u2197</a></div>` });
  else if (b2.matches("[data-photo]")) {
    const p2 = photoByKey(b2.dataset.photo);
    if (!p2) return;
    if (!params().get("page") && model() !== "sheet") {
      inlinePhoto = p2.key;
      const panel = document.querySelector(".inline-viewer");
      panel.innerHTML = inspect(p2, scopedPhotos(), false);
      panel.scrollIntoView({ block: "nearest" });
    } else openViewer(p2, b2);
  } else if (b2.matches("[data-save]")) {
    const key = b2.dataset.save;
    toggleSave(key);
    const next = [...document.querySelectorAll("[data-save]")].find((el) => el.dataset.save === key && (viewer.open ? viewer.contains(el) : !viewer.contains(el)));
    next?.focus({ preventScroll: true });
  } else if (b2.matches("[data-close-viewer]")) closeViewer();
  else if (b2.matches("[data-step]")) {
    const p2 = viewer.open ? activePhoto : photoByKey(inlinePhoto);
    if (!p2) return;
    const list = viewer.open ? viewerList(p2) : scopedPhotos(), idx = list.findIndex((x) => x.key === p2.key), next = list[idx + Number(b2.dataset.step)];
    if (!next) return;
    if (viewer.open) {
      activePhoto = next;
      viewer.innerHTML = inspect(next, list, true);
      history.replaceState(history.state, "", url({ photo: next.id }, true));
      viewer.querySelector(`[data-step="${b2.dataset.step}"]`)?.focus();
    } else {
      inlinePhoto = next.key;
      document.querySelector(".inline-viewer").innerHTML = inspect(next, list, false);
    }
  } else if (b2.matches("[data-share-photo]")) sharePhoto(photoByKey(b2.dataset.sharePhoto));
  else if (b2.matches("[data-share-gallery]")) share(currentGallery().url, "Share this gallery");
  else if (b2.matches("[data-copy]")) {
    try {
      await navigator.clipboard.writeText(action.querySelector("#copy-link").value);
      b2.textContent = "Link copied";
    } catch {
      const input = action.querySelector("#copy-link");
      input.select();
      b2.textContent = "Select and copy the link above";
    }
  } else if (b2.matches("[data-download-photo]")) downloadOptions([photoByKey(b2.dataset.downloadPhoto)], "Download photo");
  else if (b2.matches("[data-download-gallery]")) downloadOptions(allPhotos.filter((p2) => p2.gallery.albumKey === currentGallery().albumKey), "Download gallery");
  else if (b2.matches("[data-download-saved]")) downloadOptions(allPhotos.filter((p2) => saved.includes(p2.key) && (b2.dataset.downloadSaved === "all" || p2.gallery.albumKey === b2.dataset.downloadSaved)), "Download saved photos");
  else if (b2.matches("[data-download-keys]")) downloadPhotos(b2.dataset.downloadKeys.split(","), b2.dataset.size);
  else if (b2.matches("[data-close-action]")) {
    abortDownload?.abort();
    action.close();
  }
});
document.addEventListener("submit", (e2) => {
  if (e2.target.matches("[data-event-search]")) {
    e2.preventDefault();
    navigate(url({ page: "home", q: new FormData(e2.target).get("q").trim() }));
  }
  if (e2.target.matches("[data-photo-search]")) {
    e2.preventDefault();
    navigate(url({ find: new FormData(e2.target).get("find").trim() }, true));
  }
});
viewer.addEventListener("cancel", (e2) => {
  e2.preventDefault();
  closeViewer();
});
action.addEventListener("cancel", () => abortDownload?.abort());
document.addEventListener("keydown", (e2) => {
  if (viewer.open && !action.open && ["ArrowLeft", "ArrowRight"].includes(e2.key)) {
    e2.preventDefault();
    viewer.querySelector(`[data-step="${e2.key === "ArrowLeft" ? -1 : 1}"]`)?.click();
  }
});
window.addEventListener("popstate", () => {
  if (viewer.open) viewer.close();
  render();
  window.scrollTo(0, history.state?.scroll || 0);
  if (history.state?.focus) document.getElementById(history.state.focus)?.focus({ preventScroll: true });
});
render();
