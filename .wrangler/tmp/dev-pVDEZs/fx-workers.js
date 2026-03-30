var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// fx-workers.js
import { connect } from "cloudflare:sockets";

// panel.js
var SESSION_TTL_MS = 24 * 60 * 60 * 1e3;
var CONFIG_CACHE_TTL_MS = 5e3;
var DEFAULT_UUID = "d342d11e-d424-4583-b36e-524ab1f0afa4";
var UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var textEncoder = new TextEncoder();
var configCache = { expires: 0, value: null };
var parseUuidBytes = /* @__PURE__ */ __name((uuid) => {
  const clean = uuid.replace(/-/g, "").toLowerCase();
  if (clean.length !== 32) return null;
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    const hi = parseInt(clean[i * 2], 16);
    const lo = parseInt(clean[i * 2 + 1], 16);
    if (Number.isNaN(hi) || Number.isNaN(lo)) return null;
    out[i] = hi << 4 | lo;
  }
  return out;
}, "parseUuidBytes");
var defaultUuidBytes = parseUuidBytes(DEFAULT_UUID);
var getDefaultUuidBytes = /* @__PURE__ */ __name(() => defaultUuidBytes, "getDefaultUuidBytes");
var getCookieValue = /* @__PURE__ */ __name((cookieHeader, key) => {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    if (trimmed.slice(0, eq) === key) return decodeURIComponent(trimmed.slice(eq + 1));
  }
  return null;
}, "getCookieValue");
var randomToken = /* @__PURE__ */ __name(() => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}, "randomToken");
var toHex = /* @__PURE__ */ __name((u8) => Array.from(u8).map((b) => b.toString(16).padStart(2, "0")).join(""), "toHex");
var sha256Hex = /* @__PURE__ */ __name(async (input) => {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(input));
  return toHex(new Uint8Array(digest));
}, "sha256Hex");
var htmlEscape = /* @__PURE__ */ __name((s = "") => s.replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]), "htmlEscape");
var redirect = /* @__PURE__ */ __name((location, cookie) => {
  const headers = new Headers({ Location: location });
  if (cookie) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}, "redirect");
var readConfigFromKv = /* @__PURE__ */ __name(async (env) => {
  const kv = env?.CONFIG_KV;
  const envDefaultUuid = (env?.DEFAULT_UUID || DEFAULT_UUID).trim();
  const safeDefaultUuid = UUID_REGEX.test(envDefaultUuid) ? envDefaultUuid : DEFAULT_UUID;
  if (!kv) return { uuid: safeDefaultUuid, uuidBytes: parseUuidBytes(safeDefaultUuid) || defaultUuidBytes, customProxyIp: "", hasPassword: false };
  const [uuidRaw, customProxyRaw, passwordHash] = await Promise.all([
    kv.get("cfg:uuid"),
    kv.get("cfg:custom_proxyip"),
    kv.get("cfg:panel_password_hash")
  ]);
  const uuid = UUID_REGEX.test(uuidRaw || "") ? uuidRaw : safeDefaultUuid;
  return {
    uuid,
    uuidBytes: parseUuidBytes(uuid) || defaultUuidBytes,
    customProxyIp: (customProxyRaw || "").trim(),
    hasPassword: !!passwordHash
  };
}, "readConfigFromKv");
var getRuntimeConfig = /* @__PURE__ */ __name(async (env) => {
  const now = Date.now();
  if (configCache.value && configCache.expires > now) return configCache.value;
  const value = await readConfigFromKv(env);
  configCache = { value, expires: now + CONFIG_CACHE_TTL_MS };
  return value;
}, "getRuntimeConfig");
var verifySession = /* @__PURE__ */ __name(async (request, env) => {
  const kv = env?.CONFIG_KV;
  if (!kv) return false;
  const token = getCookieValue(request.headers.get("Cookie"), "panel_session");
  if (!token) return false;
  const [savedToken, expireRaw] = await Promise.all([kv.get("cfg:panel_session_token"), kv.get("cfg:panel_session_expire")]);
  if (!savedToken || savedToken !== token) return false;
  return Number(expireRaw || "0") > Date.now();
}, "verifySession");
var panelHtml = /* @__PURE__ */ __name(({ mode, message = "", uuid = DEFAULT_UUID, customProxyIp = "", subUrl = "", rawSubUrl = "" }) => {
  const msg = message ? `<div style="margin:12px 0;padding:10px;border:1px solid #333;">${htmlEscape(message)}</div>` : "";
  const commonStyle = "<style>body{margin:0;background:#fff;color:#000;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}main{max-width:640px;margin:8vh auto;padding:24px;border:1px solid #000}h1{font-size:20px;margin:0 0 14px}p{margin:0 0 16px;color:#333}label{display:block;margin:12px 0 6px}input{width:100%;padding:10px;border:1px solid #000;background:#fff;color:#000;box-sizing:border-box}button{margin-top:12px;padding:10px 14px;border:1px solid #000;background:#000;color:#fff;cursor:pointer}button.secondary{background:#fff;color:#000}small{color:#666}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.mono{font-size:12px;word-break:break-all;border:1px dashed #000;padding:8px;margin-top:8px}</style>";
  if (mode === "init") return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${commonStyle}<title>Panel Init</title></head><body><main><h1>\u9996\u6B21\u521D\u59CB\u5316\u5BC6\u7801</h1><p>\u68C0\u6D4B\u5230\u5C1A\u672A\u8BBE\u7F6E\u9762\u677F\u5BC6\u7801\uFF0C\u8BF7\u5148\u521D\u59CB\u5316\u3002</p>${msg}<form method="post" action="/panel/init"><label>\u65B0\u5BC6\u7801</label><input name="password" type="password" minlength="6" required><label>\u786E\u8BA4\u5BC6\u7801</label><input name="confirm" type="password" minlength="6" required><button type="submit">\u4FDD\u5B58\u5BC6\u7801</button></form></main></body></html>`;
  if (mode === "login") return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${commonStyle}<title>Panel Login</title></head><body><main><h1>\u9762\u677F\u767B\u5F55</h1><p>\u8BF7\u8F93\u5165\u5BC6\u7801\u7EE7\u7EED\u3002</p>${msg}<form method="post" action="/panel/login"><label>\u5BC6\u7801</label><input name="password" type="password" required><button type="submit">\u767B\u5F55</button></form></main></body></html>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${commonStyle}<title>Panel</title></head><body><main><h1>Worker \u8BBE\u7F6E\u9762\u677F</h1><p>\u9ED1\u767D\u6781\u7B80\u914D\u7F6E\u9875</p>${msg}<form method="post" action="/panel/save"><label>UUID</label><input name="uuid" value="${htmlEscape(uuid)}" required><label>\u81EA\u5B9A\u4E49 ProxyIP\uFF08\u53EF\u7A7A\uFF0C\u683C\u5F0F host \u6216 host:port\uFF09</label><input name="custom_proxyip" value="${htmlEscape(customProxyIp)}"><small>\u4F18\u5148\u7EA7\uFF1AURL\u53C2\u6570 > \u81EA\u5B9A\u4E49 > \u5206\u533A\u57DF > \u515C\u5E95</small><button type="submit">\u4FDD\u5B58\u914D\u7F6E</button></form><label>\u8BA2\u9605\u5730\u5740\uFF08base64\uFF09</label><div class="mono" id="sub-url">${htmlEscape(subUrl)}</div><div class="grid"><button type="button" onclick="copyText('${htmlEscape(subUrl)}')">\u590D\u5236\u8BA2\u9605</button><button type="button" class="secondary" onclick="copyText('${htmlEscape(rawSubUrl)}')">\u590D\u5236 RAW \u8BA2\u9605</button></div><form method="post" action="/panel/logout"><button class="secondary" type="submit">\u9000\u51FA\u767B\u5F55</button></form></main><script>function copyText(t){navigator.clipboard.writeText(t).then(()=>alert('\u5DF2\u590D\u5236')).catch(()=>alert('\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u590D\u5236'))}<\/script></body></html>`;
}, "panelHtml");
var handlePanel = /* @__PURE__ */ __name(async (request, env, url) => {
  const kv = env?.CONFIG_KV;
  if (!kv) return new Response("CONFIG_KV \u672A\u7ED1\u5B9A\uFF0C\u8BF7\u5148\u5728 wrangler.toml \u914D\u7F6E KV\u3002", { status: 500 });
  const pathname = url.pathname;
  const cfg = await getRuntimeConfig(env);
  const authed = await verifySession(request, env);
  if (request.method === "GET" && pathname === "/panel") {
    const message = url.searchParams.get("msg") || "";
    const mode = cfg.hasPassword ? authed ? "settings" : "login" : "init";
    const base = `${url.origin}/sub?uuid=${encodeURIComponent(cfg.uuid)}`;
    const raw = `${base}&format=raw`;
    return new Response(panelHtml({ mode, message, uuid: cfg.uuid, customProxyIp: cfg.customProxyIp, subUrl: base, rawSubUrl: raw }), { headers: { "Content-Type": "text/html; charset=UTF-8" } });
  }
  if (request.method === "POST" && pathname === "/panel/init") {
    if (cfg.hasPassword) return redirect("/panel?msg=\u5BC6\u7801\u5DF2\u5B58\u5728\uFF0C\u8BF7\u76F4\u63A5\u767B\u5F55");
    const form = await request.formData();
    const password = String(form.get("password") || "");
    const confirm = String(form.get("confirm") || "");
    if (password.length < 6) return redirect("/panel?msg=\u5BC6\u7801\u957F\u5EA6\u81F3\u5C116\u4F4D");
    if (password !== confirm) return redirect("/panel?msg=\u4E24\u6B21\u5BC6\u7801\u4E0D\u4E00\u81F4");
    await kv.put("cfg:panel_password_hash", await sha256Hex(password));
    configCache.expires = 0;
    return redirect("/panel?msg=\u521D\u59CB\u5316\u6210\u529F\uFF0C\u8BF7\u767B\u5F55");
  }
  if (request.method === "POST" && pathname === "/panel/login") {
    if (!cfg.hasPassword) return redirect("/panel?msg=\u8BF7\u5148\u521D\u59CB\u5316\u5BC6\u7801");
    const form = await request.formData();
    const password = String(form.get("password") || "");
    const inputHash = await sha256Hex(password);
    const savedHash = await kv.get("cfg:panel_password_hash");
    if (!savedHash || inputHash !== savedHash) return redirect("/panel?msg=\u5BC6\u7801\u9519\u8BEF");
    const token = randomToken();
    const expire = Date.now() + SESSION_TTL_MS;
    await Promise.all([kv.put("cfg:panel_session_token", token), kv.put("cfg:panel_session_expire", String(expire))]);
    return redirect("/panel?msg=\u767B\u5F55\u6210\u529F", `panel_session=${encodeURIComponent(token)}; HttpOnly; Secure; Path=/; SameSite=Strict; Max-Age=86400`);
  }
  if (request.method === "POST" && pathname === "/panel/save") {
    if (!authed) return redirect("/panel?msg=\u8BF7\u5148\u767B\u5F55");
    const form = await request.formData();
    const newUuid = String(form.get("uuid") || "").trim();
    const customProxyIp = String(form.get("custom_proxyip") || "").trim();
    if (!UUID_REGEX.test(newUuid)) return redirect("/panel?msg=UUID\u683C\u5F0F\u65E0\u6548");
    await Promise.all([kv.put("cfg:uuid", newUuid), kv.put("cfg:custom_proxyip", customProxyIp)]);
    configCache.expires = 0;
    return redirect("/panel?msg=\u4FDD\u5B58\u6210\u529F");
  }
  if (request.method === "POST" && pathname === "/panel/logout") {
    await Promise.all([kv.delete("cfg:panel_session_token"), kv.delete("cfg:panel_session_expire")]);
    return redirect("/panel?msg=\u5DF2\u9000\u51FA", "panel_session=; HttpOnly; Secure; Path=/; SameSite=Strict; Max-Age=0");
  }
  return new Response("Not Found", { status: 404 });
}, "handlePanel");

// sub.js
var CFIP_API_URL = "https://vps789.com/openApi/cfIpApi";
var safeLine = /* @__PURE__ */ __name((lineRaw = "ALL") => {
  const line = String(lineRaw || "ALL").toUpperCase();
  if (line === "CT" || line === "CU" || line === "CM" || line === "ALL") return line;
  return "ALL";
}, "safeLine");
var safeCount = /* @__PURE__ */ __name((countRaw, fallback = 8) => {
  const n = Number.parseInt(String(countRaw || fallback), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(1, Math.min(30, n));
}, "safeCount");
var toBase64Utf8 = /* @__PURE__ */ __name((input) => {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}, "toBase64Utf8");
var buildNodeName = /* @__PURE__ */ __name((line, index) => {
  const namePrefix = line === "CT" ? "\u7535\u4FE1" : line === "CU" ? "\u8054\u901A" : "\u79FB\u52A8";
  return `${namePrefix}${String(index).padStart(2, "0")}`;
}, "buildNodeName");
var getLineEntries = /* @__PURE__ */ __name((data, line, count) => {
  const src = Array.isArray(data?.[line]) ? data[line] : [];
  const out = [];
  for (let i = 0; i < src.length && out.length < count; i++) {
    const ip = String(src[i]?.ip || "").trim();
    if (ip) out.push(ip);
  }
  return out;
}, "getLineEntries");
var buildVlWsLink = /* @__PURE__ */ __name(({ uuid, ip, host, path, name }) => {
  const encodedPath = encodeURIComponent(path);
  const encodedName = encodeURIComponent(name);
  return `vless://${uuid}@${ip}:443?encryption=none&security=tls&type=ws&host=${host}&path=${encodedPath}&sni=${host}#${encodedName}`;
}, "buildVlWsLink");
var fetchCfIpData = /* @__PURE__ */ __name(async (env) => {
  const apiUrl = (env?.CFIP_API_URL || CFIP_API_URL).trim() || CFIP_API_URL;
  const resp = await fetch(apiUrl, { cf: { cacheTtl: 0, cacheEverything: false } });
  if (!resp.ok) throw new Error(`cfIpApi \u8BF7\u6C42\u5931\u8D25: ${resp.status}`);
  const json = await resp.json();
  if (json?.code !== 0 || !json?.data) throw new Error("cfIpApi \u8FD4\u56DE\u7ED3\u6784\u5F02\u5E38");
  return json.data;
}, "fetchCfIpData");
var handleSub = /* @__PURE__ */ __name(async (request, env, url, cfg) => {
  const uuid = cfg?.uuid || (env?.DEFAULT_UUID || "");
  if (!UUID_REGEX.test(uuid || "")) return new Response("UUID \u65E0\u6548\uFF0C\u8BF7\u5148\u5728\u9762\u677F\u8BBE\u7F6E\u6709\u6548 UUID", { status: 400 });
  const queryUuid = (url.searchParams.get("uuid") || "").trim();
  if (uuid && queryUuid !== uuid) return new Response("Not Found", { status: 404 });
  const line = safeLine(url.searchParams.get("line"));
  const count = safeCount(url.searchParams.get("count"), Number.parseInt(env?.SUB_DEFAULT_COUNT || "8", 10) || 8);
  const host = (url.searchParams.get("host") || url.hostname).trim();
  const path = (url.searchParams.get("path") || "/").trim() || "/";
  const format = (url.searchParams.get("format") || "base64").toLowerCase();
  let data;
  try {
    data = await fetchCfIpData(env);
  } catch (err) {
    return new Response(`\u83B7\u53D6\u4F18\u9009 IP \u5931\u8D25: ${err?.message || err}`, { status: 502 });
  }
  const lines = line === "ALL" ? ["CT", "CU", "CM"] : [line];
  const links = [];
  for (const l of lines) {
    const ips = getLineEntries(data, l, count);
    for (let i = 0; i < ips.length; i++) {
      links.push(buildVlWsLink({ uuid, ip: ips[i], host, path, name: buildNodeName(l, i + 1) }));
    }
  }
  const raw = links.join("\n");
  if (format === "raw") {
    return new Response(raw, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return new Response(toBase64Utf8(raw), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Subscription-Userinfo": "upload=0; download=0; total=1125899906842624; expire=253402271999"
    }
  });
}, "handleSub");

// fx-workers.js
var bufferSize = 512 * 1024;
var startThreshold = 50 * 1024 * 1024;
var maxChunkLen = 64 * 1024;
var flushTime = 20;
var concurrency = 4;
var proxyIpAddrs = { EU: "ProxyIP.DE.CMLiussss.net", AS: "ProxyIP.SG.CMLiussss.net", JP: "ProxyIP.JP.CMLiussss.net", US: "ProxyIP.US.CMLiussss.net" };
var DEFAULT_FALLBACK_PROXYIP = "ProxyIP.CMLiussss.net";
var coloRegions = {
  JP: /* @__PURE__ */ new Set(["FUK", "ICN", "KIX", "NRT", "OKA"]),
  EU: /* @__PURE__ */ new Set([
    "ACC",
    "ADB",
    "ALA",
    "ALG",
    "AMM",
    "AMS",
    "ARN",
    "ATH",
    "BAH",
    "BCN",
    "BEG",
    "BGW",
    "BOD",
    "BRU",
    "BTS",
    "BUD",
    "CAI",
    "CDG",
    "CPH",
    "CPT",
    "DAR",
    "DKR",
    "DMM",
    "DOH",
    "DUB",
    "DUR",
    "DUS",
    "DXB",
    "EBB",
    "EDI",
    "EVN",
    "FCO",
    "FRA",
    "GOT",
    "GVA",
    "HAM",
    "HEL",
    "HRE",
    "IST",
    "JED",
    "JIB",
    "JNB",
    "KBP",
    "KEF",
    "KWI",
    "LAD",
    "LED",
    "LHR",
    "LIS",
    "LOS",
    "LUX",
    "LYS",
    "MAD",
    "MAN",
    "MCT",
    "MPM",
    "MRS",
    "MUC",
    "MXP",
    "NBO",
    "OSL",
    "OTP",
    "PMO",
    "PRG",
    "RIX",
    "RUH",
    "RUN",
    "SKG",
    "SOF",
    "STR",
    "TBS",
    "TLL",
    "TLV",
    "TUN",
    "VIE",
    "VNO",
    "WAW",
    "ZAG",
    "ZRH"
  ]),
  AS: /* @__PURE__ */ new Set([
    "ADL",
    "AKL",
    "AMD",
    "BKK",
    "BLR",
    "BNE",
    "BOM",
    "CBR",
    "CCU",
    "CEB",
    "CGK",
    "CMB",
    "COK",
    "DAC",
    "DEL",
    "HAN",
    "HKG",
    "HYD",
    "ISB",
    "JHB",
    "JOG",
    "KCH",
    "KHH",
    "KHI",
    "KTM",
    "KUL",
    "LHE",
    "MAA",
    "MEL",
    "MFM",
    "MLE",
    "MNL",
    "NAG",
    "NOU",
    "PAT",
    "PBH",
    "PER",
    "PNH",
    "SGN",
    "SIN",
    "SYD",
    "TPE",
    "ULN",
    "VTE"
  ])
};
var coloToProxyMap = /* @__PURE__ */ new Map();
for (const [region, colos] of Object.entries(coloRegions)) for (const colo of colos) coloToProxyMap.set(colo, proxyIpAddrs[region]);
var textDecoder = new TextDecoder();
var createConnect = /* @__PURE__ */ __name((hostname, port, socket = connect({ hostname, port })) => socket.opened.then(() => socket), "createConnect");
var concurrentConnect = /* @__PURE__ */ __name((hostname, port, limit = concurrency) => Promise.any(Array(limit).fill(0).map(() => createConnect(hostname, port))), "concurrentConnect");
var parseHostPort = /* @__PURE__ */ __name((addr, defaultPort = 443) => {
  let host = String(addr || "").trim();
  let port = defaultPort;
  if (!host) return { host: DEFAULT_FALLBACK_PROXYIP, port: defaultPort };
  if (host.charCodeAt(0) === 91) {
    const endBracket = host.indexOf("]");
    if (endBracket !== -1) {
      const after = host.slice(endBracket + 1);
      if (after.startsWith(":")) {
        const parsed = Number.parseInt(after.slice(1), 10);
        if (!Number.isNaN(parsed)) port = parsed;
      }
      host = host.slice(0, endBracket + 1);
      return { host, port };
    }
  }
  const idx = host.lastIndexOf(":");
  if (idx > -1 && host.indexOf(":") === idx) {
    const parsed = Number.parseInt(host.slice(idx + 1), 10);
    if (!Number.isNaN(parsed)) {
      port = parsed;
      host = host.slice(0, idx);
    }
  }
  return { host, port };
}, "parseHostPort");
var manualPipe = /* @__PURE__ */ __name(async (readable, writable) => {
  const _bufferSize = bufferSize, _maxChunkLen = maxChunkLen, _startThreshold = startThreshold, _flushTime = flushTime, _safeBufferSize = _bufferSize - _maxChunkLen;
  let mainBuf = new ArrayBuffer(_bufferSize), offset = 0, time = 2, timerId = null, resume = null, isReading = false, needsFlush = false, totalBytes = 0;
  const flush = /* @__PURE__ */ __name(() => {
    if (isReading) return needsFlush = true;
    offset > 0 && (writable.send(mainBuf.slice(0, offset)), offset = 0);
    needsFlush = false, timerId && (clearTimeout(timerId), timerId = null), resume?.(), resume = null;
  }, "flush");
  const reader = readable.getReader({ mode: "byob" });
  try {
    while (true) {
      isReading = true;
      const { done, value } = await reader.read(new Uint8Array(mainBuf, offset, _maxChunkLen));
      if (isReading = false, done) break;
      mainBuf = value.buffer;
      const chunkLen = value.byteLength;
      if (chunkLen < _maxChunkLen) {
        time = 2, chunkLen < 4096 && (totalBytes = 0);
        offset > 0 ? (offset += chunkLen, flush()) : writable.send(value.slice());
      } else {
        totalBytes += chunkLen;
        offset += chunkLen, timerId ||= setTimeout(flush, time), needsFlush && flush();
        offset > _safeBufferSize && (totalBytes > _startThreshold && (time = _flushTime), await new Promise((r) => resume = r));
      }
    }
  } finally {
    isReading = false, flush(), reader.releaseLock();
  }
}, "manualPipe");
var handleWebSocketConn = /* @__PURE__ */ __name(async (webSocket, request, env) => {
  const cfg = await getRuntimeConfig(env);
  const fallbackProxyHost = (env?.FALLBACK_PROXYIP || DEFAULT_FALLBACK_PROXYIP).trim() || DEFAULT_FALLBACK_PROXYIP;
  const expectedUuidBytes = cfg.uuidBytes || getDefaultUuidBytes();
  const protocolHeader = request.headers.get("sec-websocket-protocol");
  const earlyData = protocolHeader ? Uint8Array.fromBase64(protocolHeader, { alphabet: "base64url" }) : null;
  let tcpWrite, processingChain = Promise.resolve(), tcpSocket;
  const closeSocket = /* @__PURE__ */ __name(() => {
    if (!earlyData) {
      tcpSocket?.close(), webSocket?.close();
    }
  }, "closeSocket");
  const processMessage = /* @__PURE__ */ __name(async (chunk) => {
    try {
      if (tcpWrite) return tcpWrite(chunk);
      chunk = earlyData ? chunk : new Uint8Array(chunk);
      webSocket.send(new Uint8Array([chunk[0], 0]));
      for (let i = 0; i < 16; i++) if (chunk[i + 1] !== expectedUuidBytes[i]) return null;
      let offset = 19 + chunk[17];
      const port = chunk[offset] << 8 | chunk[offset + 1];
      offset += 2;
      const addrType = chunk[offset++];
      let newOffset, hostname;
      if (addrType === 2) {
        const len = chunk[offset++];
        newOffset = offset + len;
        hostname = textDecoder.decode(chunk.subarray(offset, newOffset));
      } else if (addrType === 1) {
        newOffset = offset + 4;
        const bytes = chunk.subarray(offset, newOffset);
        hostname = `${bytes[0]}.${bytes[1]}.${bytes[2]}.${bytes[3]}`;
      } else {
        newOffset = offset + 16;
        let ipv6Str = (chunk[offset] << 8 | chunk[offset + 1]).toString(16);
        for (let i = 1; i < 8; i++) ipv6Str += ":" + (chunk[offset + i * 2] << 8 | chunk[offset + i * 2 + 1]).toString(16);
        hostname = `[${ipv6Str}]`;
      }
      tcpSocket = await concurrentConnect(hostname, port).catch(async () => {
        const url = new URL(request.url);
        const selectedProxy = url.searchParams.get("proxyip")?.trim() || cfg.customProxyIp || coloToProxyMap.get(request.cf?.colo) || fallbackProxyHost;
        const { host, port: proxyPort } = parseHostPort(selectedProxy, 443);
        return concurrentConnect(host, proxyPort);
      });
      const tcpWriter = tcpSocket.writable.getWriter();
      const payload = chunk.subarray(newOffset);
      if (payload.byteLength) tcpWriter.write(payload);
      tcpWrite = /* @__PURE__ */ __name((c) => tcpWriter.write(c), "tcpWrite");
      manualPipe(tcpSocket.readable, webSocket);
    } catch {
      closeSocket();
    }
  }, "processMessage");
  if (earlyData) processingChain = processingChain.then(() => processMessage(earlyData));
  webSocket.addEventListener("message", (event) => processingChain = processingChain.then(() => processMessage(event.data)));
}, "handleWebSocketConn");
var fx_workers_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/panel")) return handlePanel(request, env, url);
    if (url.pathname === "/sub") {
      const cfg = await getRuntimeConfig(env);
      return handleSub(request, env, url, cfg);
    }
    if (request.headers.get("Upgrade") === "websocket") {
      const { 0: clientSocket, 1: webSocket } = new WebSocketPair();
      webSocket.accept(), webSocket.binaryType = "arraybuffer";
      handleWebSocketConn(webSocket, request, env);
      return new Response(null, { status: 101, webSocket: clientSocket });
    }
    return new Response("Not Found", { status: 404 });
  }
};

// C:/Users/Administrator/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// C:/Users/Administrator/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-P6lpOS/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = fx_workers_default;

// C:/Users/Administrator/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-P6lpOS/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=fx-workers.js.map
