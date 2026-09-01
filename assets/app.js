/* AI 模型追踪 — vanilla JS SPA（hash 路由，零依赖除 ECharts） */
"use strict";

const PALETTE = ["#4f8cff", "#3fb950", "#f0883e", "#d2a8ff", "#ff7b72", "#79c0ff",
  "#ffa657", "#a5d6ff", "#f778ba", "#56d4dd", "#e3b341", "#8b949e"];
const AXIS_LABEL = { color: "#8b949e", fontSize: 11 };
const SPLIT_LINE = { lineStyle: { color: "#262c38" } };
const DIM_LABELS = {
  architecture: "架构创新", data: "数据创新", pretrain: "预训练创新",
  posttrain: "后训练创新", inference: "推理优化", safety: "安全对齐",
};
const PROGRESS_LABELS = {
  generational: "代际跨越", major: "重大进步", moderate: "明显进步", minor: "小幅优化",
};
const CATEGORY_LABELS = { chat: "对话助手", coding: "编程", search: "搜索", agent: "智能体", multimodal: "多模态", office: "办公" };
const SOURCE_LABELS = { hf_api: "HuggingFace", hf_rss: "HF RSS", github_release: "GitHub", openrouter: "OpenRouter", official_news: "官网", api_docs: "API 文档", arxiv: "arXiv", manual: "人工" };

const DATA = { meta: null, vendors: [], releases: [], history: [], products: [], papers: [], details: {} };
const vendorMap = () => Object.fromEntries(DATA.vendors.map(v => [v.key, v]));
const charts = [];
let detailCache = {};

/* ---------- 工具 ---------- */
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtDate(iso) {
  if (!iso) return "—";
  return iso.replace("T", " ").replace("Z", "").slice(0, 16);
}
function fmtDay(iso) {
  return iso ? iso.slice(0, 10) : "—";
}
function timeAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const now = new Date().getTime();
  const mins = Math.max(0, Math.floor((now - then) / 60000));
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} 小时前`;
  return `${Math.floor(hrs / 24)} 天前`;
}
function progressBadge(p) {
  if (!p) return "";
  return `<span class="badge badge-progress-${p}">${PROGRESS_LABELS[p] || p}</span>`;
}
function majorBadge(isMajor) {
  return isMajor ? '<span class="badge badge-major">重大</span>' : '<span class="badge badge-minor">小版本</span>';
}
function vendorBadge(key, withName = true) {
  const v = vendorMap()[key];
  if (!v) return esc(key || "未知");
  return `<a class="vendor-chip" href="#/vendor/${esc(v.key)}">${esc(v.logo_emoji)} ${withName ? esc(v.name_zh || v.name) : ""}</a>`;
}
function metricChips(metrics, max = 4) {
  if (!metrics || !metrics.length) return '<span class="metric-empty">暂无指标</span>';
  return metrics.slice(0, max).map(m =>
    `<span class="metric-chip">${esc(m.benchmark)} ${m.value}</span>`).join("");
}
function chart(el, option) {
  const c = echarts.init(el, null, { renderer: "canvas" });
  c.setOption(option);
  charts.push(c);
  return c;
}
function disposeCharts() {
  charts.forEach(c => { try { c.dispose(); } catch (e) {} });
  charts.length = 0;
}
function axisBase(type = "value") {
  const base = { axisLine: { lineStyle: { color: "#30363d" } }, axisLabel: AXIS_LABEL };
  return type === "value"
    ? { type: "value", ...base, splitLine: SPLIT_LINE, max: 100 }
    : { type, ...base, splitLine: { show: false } };
}
function tooltipBase() {
  return {
    trigger: "item",
    backgroundColor: "#1c212c", borderColor: "#30363d",
    textStyle: { color: "#e6edf3", fontSize: 12 },
  };
}

/* ---------- 路由 ---------- */
function parseRoute() {
  const h = location.hash.replace(/^#\/?/, "");
  const [path, qs] = h.split("?");
  return { parts: path.split("/").filter(Boolean), params: new URLSearchParams(qs || "") };
}
async function render() {
  const { parts, params } = parseRoute();
  disposeCharts();
  const view = document.getElementById("view");
  view.innerHTML = "";
  document.querySelectorAll(".nav a").forEach(a =>
    a.classList.toggle("active", a.dataset.route === (parts[0] || "")));
  window.scrollTo(0, 0);
  const page = parts[0] || "";
  if (page === "") return renderOverview(view);
  if (page === "models") return renderModels(view);
  if (page === "vendor" && parts[1]) return renderVendor(view, parts[1]);
  if (page === "release" && parts[1]) return renderRelease(view, parts[1]);
  if (page === "compare") return renderCompare(view, params);
  if (page === "apps") return renderApps(view);
  if (page === "papers") return renderPapers(view);
  view.appendChild(el("div", "empty", "页面不存在"));
}

/* ---------- 总览 ---------- */
function renderOverview(view) {
  const m = DATA.meta;
  const now = new Date();
  const monthPrefix = now.toISOString().slice(0, 7);
  const monthCount = DATA.releases.filter(r => (r.published_at || r.detected_at || "").startsWith(monthPrefix)).length;

  view.innerHTML = `
    <div class="page-title">${esc(m.brand.brand_emoji)} ${esc(m.brand.title)}</div>
    <div class="page-sub">${esc(m.brand.subtitle)} · 数据更新于 ${timeAgo(m.generated_at)}</div>

    <div class="grid grid-4">
      <div class="card kpi"><div class="num">${m.counts.vendors}</div><div class="label">追踪厂商</div></div>
      <div class="card kpi"><div class="num">${m.counts.releases}</div><div class="label">发布记录</div></div>
      <div class="card kpi up"><div class="num">${monthCount}</div><div class="label">本月新发布</div></div>
      <div class="card kpi"><div class="num">${m.counts.papers}</div><div class="label">论文收录</div></div>
    </div>

    <div class="section grid grid-2">
      <div class="card">
        <h3>月度 API 预算（评测+总结）</h3>
        <div class="mono" style="font-size:20px;font-weight:700">$${m.budget.month_spent_usd.toFixed(2)}
          <span style="color:var(--text-dim);font-size:12.5px;font-weight:400"> / $${m.budget.limit_usd} 上限</span></div>
        <div class="budget-bar"><div class="budget-fill ${m.budget.month_spent_usd / m.budget.limit_usd > 0.9 ? "crit" : m.budget.month_spent_usd / m.budget.limit_usd > 0.75 ? "warn" : ""}"
          style="width:${Math.min(100, m.budget.month_spent_usd / m.budget.limit_usd * 100)}%"></div></div>
      </div>
      <div class="card">
        <h3>厂商速览</h3>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${DATA.vendors.map(v => vendorBadge(v.key)).join("")}
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">厂商 × 能力维度热力图 <span class="hint">各厂商历史最优官方指标均值</span></div>
      <div class="card"><div id="chart-heat" class="chart-sm"></div></div>
    </div>

    <div class="section">
      <div class="section-title">最新发布 <span class="hint">共 ${DATA.releases.length} 条 · 点击进详情</span></div>
      <div class="card"><div class="timeline" id="recent-tl"></div></div>
    </div>

    <div class="section">
      <div class="section-title">数据源健康</div>
      <div class="card tbl-wrap"><table class="tbl">
        <thead><tr><th>类型</th><th>来源</th><th>状态</th><th>连续错误</th><th>上次轮询</th></tr></thead>
        <tbody>${m.source_health.map(s => `
          <tr><td class="mono">${esc(s.source_type)}</td>
          <td style="max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.url)}</td>
          <td>${s.enabled ? (s.error_count > 0 ? '<span class="badge badge-progress-major">异常</span>' : '<span class="badge badge-progress-minor">正常</span>') : '<span class="badge badge-dim">停用</span>'}</td>
          <td class="mono">${s.error_count}</td>
          <td class="mono">${fmtDate(s.last_polled_at)}</td></tr>`).join("")}
        </tbody></table></div>
    </div>`;

  // 热力图
  const dims = m.radar_dimensions || [];
  const heatVendors = DATA.vendors.filter(v => Object.keys(v.dimension_avg || {}).length).slice(0, 20);
  const heatData = [];
  heatVendors.forEach((v, i) => dims.forEach((d, j) => {
    if (v.dimension_avg[d] != null) heatData.push([j, i, v.dimension_avg[d]]);
  }));
  const hm = chart(document.getElementById("chart-heat"), {
    tooltip: { ...tooltipBase(), formatter: p => `${heatVendors[p.value[1]].name_zh || heatVendors[p.value[1]].name}<br>${dims[p.value[0]]}: <b>${p.value[2]}</b>` },
    grid: { left: 90, right: 90, top: 10, bottom: 40 },
    xAxis: { type: "category", data: dims, ...axisBase("category") },
    yAxis: { type: "category", data: heatVendors.map(v => v.name_zh || v.name), axisLabel: AXIS_LABEL, axisLine: { lineStyle: { color: "#30363d" } } },
    visualMap: { min: 40, max: 100, calculable: false, orient: "vertical", right: 0, top: "center",
      inRange: { color: ["#171b23", "#1f3a66", "#4f8cff"] }, textStyle: { color: "#8b949e" } },
    series: [{ type: "heatmap", data: heatData, label: { show: heatData.length < 80, color: "#e6edf3", fontSize: 10 } }],
  });

  // 最新时间线
  const tl = document.getElementById("recent-tl");
  const items = DATA.releases.slice(0, 25).map(r => {
    const s = r.summary_zh ? `<div class="tl-summary">${esc(r.summary_zh)}</div>` : "";
    return `<div class="tl-item ${r.is_major ? "major" : ""}">
      <div class="tl-date">${fmtDay(r.published_at || r.detected_at)} <span class="badge badge-source">${esc(SOURCE_LABELS[r.source_type] || r.source_type)}</span></div>
      <div class="tl-title"><a href="#/release/${r.id}">${esc(r.title)}</a></div>
      <div class="tl-meta">${vendorBadge(r.vendor_key)} ${majorBadge(r.is_major)} ${progressBadge(r.progress)}
        ${r.composite_score != null ? `<span class="metric-chip" style="background:rgba(63,185,80,.12);color:var(--green)">综合 ${r.composite_score}</span>` : ""}
        ${metricChips(r.top_metrics, 3)}</div>
      ${s}</div>`;
  }).join("");
  tl.innerHTML = items || '<div class="empty">暂无发布记录</div>';
}

/* ---------- 模型库 ---------- */
function renderModels(view) {
  const vendorSel = `<select id="f-vendor"><option value="">全部厂商</option>${DATA.vendors.map(v => `<option value="${esc(v.key)}">${esc(v.logo_emoji)} ${esc(v.name_zh || v.name)}</option>`).join("")}</select>`;
  view.innerHTML = `
    <div class="page-title">模型库</div>
    <div class="page-sub">全部模型发布记录 · 官方披露指标 · 点击行查看技术总结</div>
    <div class="filters">
      ${vendorSel}
      <select id="f-region"><option value="">全部地区</option><option value="CN">国内</option><option value="intl">海外</option></select>
      <input type="text" id="f-kw" placeholder="搜索模型名 / 关键词">
      <label><input type="checkbox" id="f-major"> 仅重大发布</label>
    </div>
    <div class="card tbl-wrap"><table class="tbl">
      <thead><tr><th>日期</th><th>厂商</th><th>发布</th><th>类型</th><th>进步幅度</th><th>官方指标</th></tr></thead>
      <tbody id="models-body"></tbody></table></div>
    <div id="models-count" style="margin-top:8px;color:var(--text-dim);font-size:12.5px"></div>`;

  function applyFilter() {
    const vk = document.getElementById("f-vendor").value;
    const region = document.getElementById("f-region").value;
    const kw = document.getElementById("f-kw").value.trim().toLowerCase();
    const majorOnly = document.getElementById("f-major").checked;
    const vm = vendorMap();
    const rows = DATA.releases.filter(r => {
      if (vk && r.vendor_key !== vk) return false;
      if (region && vm[r.vendor_key]) {
        const isCN = vm[r.vendor_key].country === "CN";
        if (region === "CN" && !isCN) return false;
        if (region === "intl" && isCN) return false;
      }
      if (majorOnly && !r.is_major) return false;
      if (kw && !(r.title + " " + (r.summary_zh || "")).toLowerCase().includes(kw)) return false;
      return true;
    });
    document.getElementById("models-body").innerHTML = rows.map(r => `
      <tr onclick="location.hash='#/release/${r.id}'">
        <td class="mono">${fmtDay(r.published_at || r.detected_at)}</td>
        <td>${vendorBadge(r.vendor_key)}</td>
        <td style="max-width:380px">${esc(r.title)}</td>
        <td>${majorBadge(r.is_major)}</td>
        <td>${progressBadge(r.progress)}</td>
        <td>${metricChips(r.top_metrics, 4)}</td></tr>`).join("") || '<tr><td colspan="6" class="empty">无匹配记录</td></tr>';
    document.getElementById("models-count").textContent = `显示 ${rows.length} / ${DATA.releases.length} 条`;
  }
  ["f-vendor", "f-region", "f-kw", "f-major"].forEach(id => {
    document.getElementById(id).addEventListener("input", applyFilter);
    document.getElementById(id).addEventListener("change", applyFilter);
  });
  applyFilter();
}

/* ---------- 厂商页 ---------- */
function renderVendor(view, key) {
  const v = vendorMap()[key];
  if (!v) { view.appendChild(el("div", "empty", "厂商不存在")); return; }
  const st = v.stats || {};
  const latest = st.latest;

  view.innerHTML = `
    <div class="vendor-head">
      <span class="vendor-logo">${esc(v.logo_emoji)}</span>
      <div>
        <div class="vendor-name">${esc(v.name_zh || v.name)} <span style="color:var(--text-dim);font-size:15px;font-weight:400">${esc(v.name)}</span></div>
        <div class="vendor-focus">${esc(v.focus_area || "")} · ${esc(v.country === "CN" ? "国内" : "海外")} · ${v.homepage ? `<a href="${esc(v.homepage)}" target="_blank" rel="noopener">官网 ↗</a>` : ""}</div>
      </div>
    </div>
    <div class="vendor-desc">${esc(v.description_zh || "")}</div>

    <div class="section grid grid-4">
      <div class="card kpi"><div class="num">${st.releases}</div><div class="label">发布记录</div></div>
      <div class="card kpi"><div class="num">${st.major}</div><div class="label">重大版本</div></div>
      <div class="card kpi" style="grid-column:span 2"><div style="font-size:14px;font-weight:600">最新：${latest ? `<a href="#/release/${latest.id}">${esc(latest.title)}</a>` : "—"}</div>
        <div style="color:var(--text-dim);font-size:12.5px;margin-top:2px">${latest ? fmtDay(latest.date) : ""} ${latest ? progressBadge(latest.progress) : ""}</div></div>
    </div>

    <div class="section grid grid-2">
      <div class="card"><h3>纵向进步轨迹 <span class="hint" style="font-weight:400;font-size:12px">各基准分随时间 · 实线=官方披露 / 虚线=自测</span></h3>
        <div id="chart-line" class="chart"></div></div>
      <div class="card"><h3>能力画像 <span class="hint" style="font-weight:400;font-size:12px">最新发布 vs 历史最优</span></h3>
        <div id="chart-radar" class="chart"></div></div>
    </div>

    <div class="section">
      <div class="section-title">公司档案与商业化 <span class="hint">公开报道数据，附来源链接</span></div>
      <div class="grid grid-2">
        <div class="card" id="vendor-fin"></div>
        <div class="card"><h3>能力跃迁（综合分=披露基准均值）</h3><div id="chart-cap" class="chart-sm"></div>
        ${v.pricing_trend && v.pricing_trend.length ? `<h3 style="margin-top:14px">模型定价趋势（$/M 输出）</h3><div id="chart-price" class="chart-sm"></div>` : ""}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">发布历史</div>
      <div class="card"><div class="timeline" id="vendor-tl"></div></div>
    </div>`;

  const hist = DATA.history.filter(h => h.vendor_key === key);
  const off = hist.filter(h => h.source === "official");
  const self = hist.filter(h => h.source === "self");

  // 折线：每 benchmark 一条 series
  if (off.length || self.length) {
    const bmSet = new Set();
    off.forEach(h => Object.keys(h.benchmarks).forEach(b => bmSet.add(b)));
    self.forEach(h => Object.keys(h.benchmarks).forEach(b => bmSet.add(b)));
    const series = [];
    let colorIdx = 0;
    bmSet.forEach(bm => {
      const mk = (rows, dash) => ({
        name: bm, type: "line", symbolSize: 6,
        data: rows.map(h => [h.date, h.benchmarks[bm]]).filter(d => d[1] != null),
        lineStyle: { width: 2, type: dash ? "dashed" : "solid" },
        itemStyle: { color: PALETTE[colorIdx % PALETTE.length] },
        connectNulls: true,
      });
      series.push(mk(off, false));
      if (self.some(h => h.benchmarks[bm] != null)) {
        series.push({ ...mk(self, true), name: bm + "(自测)" });
      }
      colorIdx++;
    });
    chart(document.getElementById("chart-line"), {
      tooltip: { ...tooltipBase(), trigger: "axis" },
      legend: { textStyle: AXIS_LABEL, top: 0, type: "scroll" },
      grid: { left: 40, right: 16, top: 40, bottom: 60 },
      xAxis: { ...axisBase("time"), splitLine: { show: false } },
      yAxis: axisBase(),
      dataZoom: [{ type: "inside" }, { type: "slider", height: 18, bottom: 8, borderColor: "#30363d", backgroundColor: "#171b23" }],
      series,
    });
  } else {
    document.getElementById("chart-line").parentElement.innerHTML = '<div class="empty">暂无基准分数据（历史回填后自动出现）</div>';
  }

  // 雷达：最新 vs 历史最优（按维度）
  const dims = DATA.meta.radar_dimensions || [];
  const tax = DATA.meta.benchmark_taxonomy || {};
  const dimOf = bm => { for (const [d, bms] of Object.entries(tax)) if (bms.includes(bm)) return d; return null; };
  const dimScores = rows => {
    const acc = {};
    rows.forEach(h => Object.entries(h.benchmarks).forEach(([bm, val]) => {
      const d = dimOf(bm);
      if (!d) return;
      acc[d] = acc[d] || { sum: 0, n: 0 };
      acc[d].sum += val; acc[d].n++;
    }));
    return Object.fromEntries(Object.entries(acc).map(([d, a]) => [d, +(a.sum / a.n).toFixed(1)]));
  };
  if (off.length && dims.length) {
    const sorted = [...off].sort((a, b) => (a.date || "") < (b.date || "") ? 1 : -1);
    const latestRows = sorted[0] ? [sorted[0]] : [];
    const radarSeries = [];
    if (latestRows.length) radarSeries.push({ name: sorted[0].title.length > 22 ? sorted[0].title.slice(0, 22) + "…" : sorted[0].title, value: dims.map(d => dimScores(latestRows)[d] ?? 0) });
    radarSeries.push({ name: "历史最优", value: dims.map(d => Math.max(...off.map(h => dimScores([h])[d] ?? 0))) });
    chart(document.getElementById("chart-radar"), {
      tooltip: tooltipBase(),
      legend: { textStyle: AXIS_LABEL, bottom: 0 },
      radar: {
        indicator: dims.map(d => ({ name: d, max: 100 })),
        axisName: AXIS_LABEL, splitLine: SPLIT_LINE, splitArea: { show: false },
        axisLine: { lineStyle: { color: "#30363d" } },
      },
      series: [{ type: "radar", data: radarSeries.map((s, i) => ({ ...s, lineStyle: { width: 2 }, itemStyle: { color: PALETTE[i] }, areaStyle: { opacity: i === 0 ? .18 : .06 } })) }],
    });
  } else {
    document.getElementById("chart-radar").parentElement.innerHTML = '<div class="empty">暂无维度数据</div>';
  }

  // 公司档案（财务公开数据）
  const fins = v.financials || [];
  const fmtVal = (m) => {
    if (m.value == null) return esc(m.value_text || "—");
    const abs = Math.abs(m.value);
    if (abs >= 1e9) return "$" + (m.value / 1e9).toFixed(1) + "B";
    if (abs >= 1e6) return "$" + (m.value / 1e6).toFixed(0) + "M";
    return "$" + m.value.toFixed(0);
  };
  const METRIC_LABELS = { founded: "成立时间", arr_usd: "ARR（年化收入）", revenue_usd: "年度营收",
    funding_usd: "融资额", valuation_usd: "估值", employees: "员工数", margin_notes: "毛利率" };
  const finHtml = fins.length
    ? `<table class="tbl"><tbody>${fins.map(f => `
        <tr><td style="color:var(--text-dim);width:150px">${METRIC_LABELS[f.metric] || f.metric}</td>
        <td><b class="mono">${fmtVal(f)}</b> <span class="mono" style="color:var(--text-dim);font-size:11.5px">${esc(f.period || "")}</span></td>
        <td style="max-width:340px"><span style="font-size:12px;color:var(--text-dim)">${esc(f.note || "")}</span>
        ${f.source_url ? `<a href="${esc(f.source_url)}" target="_blank" rel="noopener" style="font-size:11.5px">来源↗</a>` : ""}</td></tr>`).join("")}</tbody></table>`
    : '<div class="metric-empty">暂无公开财务数据</div>';
  document.getElementById("vendor-fin").innerHTML = `<h3>公司档案</h3>${finHtml}`;

  // 能力跃迁图（综合分时间序列 + 大跃迁标注）
  const cap = v.capability_series || [];
  if (cap.length >= 2) {
    let prevScore = null;
    const jumps = [];
    cap.forEach((c, i) => {
      if (prevScore != null && c.score - prevScore >= 10) jumps.push({ coord: [c.date, c.score], name: c.title });
      prevScore = c.score;
    });
    chart(document.getElementById("chart-cap"), {
      tooltip: { ...tooltipBase(), trigger: "axis", formatter: ps => {
        const p = ps[0]; const item = cap.find(c => c.date === p.axisValue);
        return `${p.axisValue}<br><b>${p.marker}${esc(item ? item.title : "")}</b>: ${p.value}`;
      } },
      grid: { left: 40, right: 16, top: 16, bottom: 40 },
      xAxis: { ...axisBase("time"), splitLine: { show: false } },
      yAxis: { ...axisBase(), min: val => Math.max(0, Math.floor((val.min - 5) / 10) * 10) },
      series: [{
        type: "line", data: cap.map(c => [c.date, c.score]),
        lineStyle: { width: 2.5, color: "#4f8cff" }, itemStyle: { color: "#4f8cff" },
        symbolSize: 7,
        markPoint: jumps.length ? { data: jumps.map(j => ({ ...j, value: j.coord[1] })),
          symbol: "pin", symbolSize: 38,
          label: { color: "#fff", fontSize: 9, formatter: "↑" },
          itemStyle: { color: "#f0883e" } } : undefined,
      }],
    });
  } else {
    document.getElementById("chart-cap").parentElement.querySelector("h3").insertAdjacentHTML("afterend", '<div class="metric-empty">基准数据不足（深度解析后自动出现）</div>');
  }

  // 定价趋势
  if (v.pricing_trend && v.pricing_trend.length) {
    const pts = v.pricing_trend.filter(p => p.output_per_m != null);
    if (pts.length) {
      chart(document.getElementById("chart-price"), {
        tooltip: { ...tooltipBase(), trigger: "axis" },
        grid: { left: 48, right: 16, top: 16, bottom: 40 },
        xAxis: { ...axisBase("time"), splitLine: { show: false } },
        yAxis: { ...axisBase(), max: undefined, name: "$/M" },
        series: [{
          type: "line", data: pts.map(p => [p.effective_date, p.output_per_m]),
          lineStyle: { width: 2, color: "#3fb950" }, itemStyle: { color: "#3fb950" },
          symbolSize: 7, areaStyle: { opacity: .08 },
        }],
      });
    }
  }

  // 发布历史
  const rels = DATA.releases.filter(r => r.vendor_key === key);
  document.getElementById("vendor-tl").innerHTML = rels.map(r => `
    <div class="tl-item ${r.is_major ? "major" : ""}">
      <div class="tl-date">${fmtDay(r.published_at || r.detected_at)}</div>
      <div class="tl-title"><a href="#/release/${r.id}">${esc(r.title)}</a></div>
      <div class="tl-meta">${majorBadge(r.is_major)} ${progressBadge(r.progress)} ${metricChips(r.top_metrics, 3)}</div>
    </div>`).join("") || '<div class="empty">暂无发布记录</div>';
}

/* ---------- 发布详情（tabs） ---------- */
const SPEC_LABELS = {
  params_billions: "总参数(B)", active_params_billions: "激活参数(B)",
  architecture: "架构", num_experts: "专家数", context_window: "上下文长度",
  max_output: "最大输出", modalities: "模态", weights: "权重", license: "许可证",
};

async function renderRelease(view, id) {
  const idx = DATA.releases.find(r => r.id === Number(id));
  if (!idx) { view.appendChild(el("div", "empty", "发布不存在")); return; }
  if (!detailCache[id]) {
    try {
      const res = await fetch(`data/releases/${id}.json`);
      if (res.ok) detailCache[id] = await res.json();
    } catch (e) { detailCache[id] = null; }
  }
  const d = detailCache[id] || { ...idx, official_benchmarks: [], self_evals: [], related_papers: [] };
  const s = d.summary || null;

  const innovHtml = s && s.innovations && s.innovations.length
    ? `<div class="innov-grid">${s.innovations.map(i => `
        <div class="innov-card"><div class="dim">${esc(DIM_LABELS[i.dimension] || i.dimension)}</div>
        <div class="it">${esc(i.title)}</div><div class="id">${esc(i.detail)}</div></div>`).join("")}</div>`
    : '<div class="empty">暂无 AI 技术总结（等待总结管线处理，或历史回填后自动生成）</div>';

  const srcHtml = s && s.source_urls && s.source_urls.length
    ? `<ul class="src-list">${s.source_urls.map(u => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a></li>`).join("")}</ul>`
    : `<a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.url)}</a>`;

  const benchRows = (d.official_benchmarks || []).map(b => `
    <tr><td class="mono">${esc(b.benchmark)}</td><td class="mono" style="font-weight:700;color:var(--primary)">${b.value}</td>
    <td>${b.source_url ? `<a href="${esc(b.source_url)}" target="_blank" rel="noopener">来源 ↗</a>` : "—"}</td></tr>`).join("");
  const selfRows = (d.self_evals || []).map(e => `
    <tr><td class="mono">${esc(e.benchmark)}</td><td class="mono" style="font-weight:700;color:var(--green)">${e.score.toFixed ? e.score.toFixed(2) : e.score}</td>
    <td class="mono">${esc(e.metric)}</td><td class="mono">${e.num_samples}</td><td class="mono">${esc(e.model_version || "")}</td></tr>`).join("");

  // 规格
  const specs = d.model_specs || null;
  const specsHtml = specs
    ? `<div class="tbl-wrap"><table class="tbl"><tbody>${Object.entries(SPEC_LABELS).map(([k, label]) => {
        let val = specs[k];
        if (val === null || val === undefined || val === "" || (Array.isArray(val) && !val.length)) return "";
        if (Array.isArray(val)) val = val.join(" / ");
        return `<tr><td style="color:var(--text-dim);width:180px">${label}</td><td class="mono">${esc(String(val))}</td></tr>`;
      }).join("")}</tbody></table></div>`
    : '<div class="metric-empty">暂无结构化规格（深度解析后自动出现）</div>';

  // 训练
  const tr = d.training || null;
  const trList = arr => (arr && arr.length ? arr.map(x => `<li>${esc(x)}</li>`).join("") : "");
  const trainingHtml = tr
    ? `<div class="grid grid-2">
        <div class="card"><h3>预训练</h3><ul class="src-list">${trList(tr.pretrain_innovations)}</ul>
          ${tr.pretrain_tokens_trillions ? `<div style="margin-top:6px">预训练 token：<b class="mono">${esc(String(tr.pretrain_tokens_trillions))}T</b></div>` : ""}
          ${tr.data_mix ? `<div style="margin-top:4px;color:var(--text-dim);font-size:12.5px">数据配比：${esc(tr.data_mix)}</div>` : ""}
          ${tr.compute ? `<div style="margin-top:4px;color:var(--text-dim);font-size:12.5px">训练算力：${esc(tr.compute)}</div>` : ""}</div>
        <div class="card"><h3>后训练</h3><ul class="src-list">${trList(tr.posttrain_innovations)}</ul>
          ${tr.rl_methods && tr.rl_methods.length ? `<div style="margin-top:6px">RL 方法：${tr.rl_methods.map(m => `<span class="metric-chip">${esc(m)}</span>`).join(" ")}</div>` : ""}</div>
      </div>`
    : '<div class="empty">暂无训练细节（深度解析后自动出现）</div>';

  // 定价 + 毛利
  const pr = d.pricing || null;
  const mg = d.margin || null;
  const pricingHtml = pr && pr.has_pricing
    ? `<div class="grid grid-2">
        <div class="card"><h3>API 定价（$/M tokens）</h3>
          <div class="kpi-grid3">
            <div class="kpi"><div class="num">${pr.input_per_m ?? "—"}</div><div class="label">输入</div></div>
            <div class="kpi"><div class="num">${pr.output_per_m ?? "—"}</div><div class="label">输出</div></div>
            <div class="kpi"><div class="num">${pr.cached_in_per_m ?? "—"}</div><div class="label">缓存输入</div></div>
          </div></div>
        ${mg ? `<div class="card"><h3>推理毛利率估算 <span class="badge badge-ai">估算</span></h3>
          <div style="font-size:24px;font-weight:800;font-family:var(--mono)">${mg.margin_low_pct}% ~ ${mg.margin_high_pct}%</div>
          <div style="color:var(--text-dim);font-size:12px;margin-top:4px">单 M 输出 token 推理成本约 $${mg.cost_low_usd_per_m} ~ $${mg.cost_high_usd_per_m}（按定价 $${pr.output_per_m} 测算）</div>
          <details style="margin-top:8px"><summary style="cursor:pointer;color:var(--text-dim);font-size:12px">查看假设</summary>
            <div class="mono" style="font-size:11.5px;margin-top:6px;color:var(--text-dim)">GPU ${esc(mg.assumptions.gpu)}（$ ${mg.assumptions.gpu_price_usd}）· MFU ${mg.assumptions.mfu_range[0]}-${mg.assumptions.mfu_range[1]} · 利用率 ${mg.assumptions.utilization} · 折旧 ${mg.assumptions.depreciation_years} 年 · 电费 $${mg.assumptions.electricity_usd_per_kwh}/kWh · 激活参数 ${mg.assumptions.active_params_billions}B</div></details></div>` : ""}
      </div>`
    : '<div class="empty">暂无定价信息</div>';

  // 装配来源审计
  const cs = d.content_sources || null;
  const csHtml = cs && cs.length
    ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>内容块</th><th>来源</th><th>字符数</th></tr></thead><tbody>
        ${cs.map(c => `<tr><td class="mono">${esc(c.kind)}</td><td style="max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.source)}</td><td class="mono">${c.chars}</td></tr>`).join("")}</tbody></table></div>`
    : "";

  view.innerHTML = `
    <div style="margin-bottom:14px"><a href="#/models">← 模型库</a>${d.vendor_key ? ` · ${vendorBadge(d.vendor_key)}` : ""}</div>
    <div class="page-title">${esc(d.title)}</div>
    <div class="page-sub">
      ${fmtDate(d.published_at || d.detected_at)} · <span class="badge badge-source">${esc(SOURCE_LABELS[d.source_type] || d.source_type)}</span>
      ${majorBadge(d.is_major)} ${progressBadge(s && s.progress_magnitude)}
      ${d.deep_analyzed ? '<span class="badge badge-ai">深度解析</span>' : ""}
    </div>

    <div class="tabs" id="rel-tabs">
      <button class="tab active" data-tab="overview">概述</button>
      <button class="tab" data-tab="specs">规格与架构</button>
      <button class="tab" data-tab="training">训练细节</button>
      <button class="tab" data-tab="bench">评测指标</button>
      <button class="tab" data-tab="pricing">定价与商业化</button>
    </div>

    <div id="tab-overview" class="tab-pane">
      <div class="section grid grid-2">
        <div class="card">
          <h3>概述 ${s ? `<span class="badge badge-ai">AI 生成 · ${esc(s.generated_by || "LLM")} · ${fmtDay(s.generated_at)}</span>` : ""}</h3>
          <div style="color:var(--text)">${esc(s ? s.summary_zh : (idx.summary_zh || "暂无概述"))}</div>
          ${s && s.progress_note ? `<div style="margin-top:8px;color:var(--text-dim);font-size:12.5px">进步幅度依据：${esc(s.progress_note)}</div>` : ""}
          ${s && s.predecessor ? `<div style="margin-top:4px;color:var(--text-dim);font-size:12.5px">前代版本：${esc(s.predecessor)}</div>` : ""}
        </div>
        <div class="card"><h3>来源链接</h3>${srcHtml}</div>
      </div>
      <div class="section"><div class="section-title">技术总结 · 创新点</div>${innovHtml}</div>
      ${d.related_papers && d.related_papers.length ? `
      <div class="section"><div class="section-title">关联论文</div>
        <div class="card"><ul class="src-list">${d.related_papers.map(p => `<li><a href="${esc(p.arxiv_url)}" target="_blank" rel="noopener">${esc(p.title)}</a></li>`).join("")}</ul></div>
      </div>` : ""}
    </div>

    <div id="tab-specs" class="tab-pane" style="display:none">
      <div class="section"><div class="section-title">模型规格</div><div class="card">${specsHtml}</div></div>
      ${csHtml ? `<div class="section"><div class="section-title">解析内容来源（审计）</div><div class="card">${csHtml}</div></div>` : ""}
    </div>

    <div id="tab-training" class="tab-pane" style="display:none">
      <div class="section">${trainingHtml}</div>
    </div>

    <div id="tab-bench" class="tab-pane" style="display:none">
      <div class="section grid grid-2">
        <div class="card">
          <h3>官方披露指标 <span class="hint" style="font-weight:400;font-size:12px">全部 ${(d.official_benchmarks || []).length} 项</span></h3>
          ${benchRows ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>基准</th><th>分数</th><th>来源</th></tr></thead><tbody>${benchRows}</tbody></table></div>` : '<div class="metric-empty">暂无官方指标</div>'}
        </div>
        <div class="card">
          <h3>自测结果 <span class="hint" style="font-weight:400;font-size:12px">ame 评测系统实跑</span></h3>
          ${selfRows ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>基准</th><th>分数</th><th>指标</th><th>样本</th><th>模型</th></tr></thead><tbody>${selfRows}</tbody></table></div>` : '<div class="metric-empty">暂无自测结果</div>'}
        </div>
      </div>
    </div>

    <div id="tab-pricing" class="tab-pane" style="display:none">
      <div class="section">${pricingHtml}</div>
    </div>`;

  view.querySelectorAll(".tab").forEach(btn => btn.onclick = () => {
    view.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b === btn));
    view.querySelectorAll(".tab-pane").forEach(p => p.style.display = "none");
    document.getElementById("tab-" + btn.dataset.tab).style.display = "block";
  });
}

/* ---------- 对比页 ---------- */
function renderCompare(view, params) {
  const ids = ["a", "b", "c", "d", "e"].map(k => Number(params.get(k))).filter(Boolean).slice(0, 5);
  const sel = DATA.releases.map(r => r);
  const presetChips = (DATA.presets || []).map(p =>
    `<a class="vendor-chip" href="#/compare?${p.release_ids.map((v, i) => "abcde"[i] + "=" + v).join("&")}" style="cursor:pointer">${esc(p.label)}</a>`).join("");
  view.innerHTML = `
    <div class="page-title">模型对比</div>
    <div class="page-sub">选择 2–5 个发布 · 对比官方基准分与能力画像 · 链接可分享</div>
    <div class="filters">
      <input type="text" id="c-add" list="c-list" placeholder="输入模型名添加…" style="min-width:280px">
      <datalist id="c-list">${sel.map(r => `<option value="${esc(r.title)}">`).join("")}</datalist>
      <button class="vendor-chip" id="c-btn" style="cursor:pointer">＋ 添加</button>
      <span style="color:var(--text-dim);font-size:12.5px">已选 ${ids.length}/5</span>
    </div>
    ${presetChips ? `<div style="margin-bottom:10px;display:flex;flex-wrap:wrap;gap:6px;align-items:center">
      <span style="color:var(--text-dim);font-size:12.5px">同代对比：</span>${presetChips}</div>` : ""}
    <div id="c-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px"></div>
    <div id="c-body"></div>`;

  const ttl2id = new Map(sel.map(r => [r.title, r.id]));
  function chips() {
    const cur = getSelected();
    document.getElementById("c-chips").innerHTML = cur.map(r => `
      <span class="vendor-chip">${esc((vendorMap()[r.vendor_key] || {}).logo_emoji || "")} ${esc(r.title)}
        <a href="javascript:void(0)" data-remove="${r.id}" style="color:var(--red);margin-left:4px">✕</a></span>`).join("");
    document.querySelectorAll("[data-remove]").forEach(a => a.onclick = () => {
      const keep = getSelected().filter(r => r.id !== Number(a.dataset.remove)).map(r => r.id);
      location.hash = "#/compare?" + keep.map((v, i) => "abcdefgh"[i] + "=" + v).join("&");
    });
  }
  function getSelected() {
    return [...new Set([...ids, ...Array.from(new URLSearchParams(location.hash.split("?")[1] || "").values()).map(Number)])]
      .map(id => DATA.releases.find(r => r.id === id)).filter(Boolean);
  }
  document.getElementById("c-btn").onclick = () => {
    const input = document.getElementById("c-add");
    const rid = ttl2id.get(input.value);
    if (!rid) { input.style.borderColor = "var(--red)"; return; }
    const cur = getSelected().map(r => r.id);
    if (cur.includes(rid) || cur.length >= 5) return;
    location.hash = "#/compare?" + [...cur, rid].map((v, i) => "abcde"[i] + "=" + v).join("&");
  };
  document.getElementById("c-add").addEventListener("keydown", e => { if (e.key === "Enter") document.getElementById("c-btn").click(); });

  const selected = getSelected();
  if (selected.length < 2) {
    document.getElementById("c-body").innerHTML = `<div class="card empty"><div class="big">📊</div>选择至少 2 个发布开始对比</div>`;
    return;
  }

  // 详情数据
  const dets = selected.map(r => detailCache[r.id] || r);
  const needFetch = selected.filter(r => !detailCache[r.id]).map(r => fetch(`data/releases/${r.id}.json`).then(res => res.ok ? res.json() : null).then(j => { if (j) detailCache[r.id] = j; }).catch(() => {}));
  Promise.all(needFetch).then(() => {
    const loaded = selected.map(r => detailCache[r.id] || { ...r, official_benchmarks: [] });
    document.getElementById("c-body").innerHTML = `
      <div class="section grid grid-2">
        <div class="card"><h3>官方基准分对比</h3><div id="c-bar" class="chart"></div></div>
        <div class="card"><h3>能力画像叠加</h3><div id="c-radar" class="chart"></div></div>
      </div>
      <div class="section"><div class="section-title">明细 + 相对前代进步</div>
      <div class="card tbl-wrap"><table class="tbl" id="c-tbl"></table></div></div>`;

    // 分组条形图：benchmark × 模型
    const bmAll = new Set();
    loaded.forEach(d => (d.official_benchmarks || []).forEach(b => bmAll.add(b.benchmark)));
    const bms = [...bmAll].slice(0, 10);
    const barSeries = loaded.map((d, i) => ({
      name: d.title.length > 16 ? d.title.slice(0, 16) + "…" : d.title,
      type: "bar", barMaxWidth: 30,
      data: bms.map(bm => { const f = (d.official_benchmarks || []).find(b => b.benchmark === bm); return f ? f.value : null; }),
      itemStyle: { color: PALETTE[i % PALETTE.length] },
    }));
    chart(document.getElementById("c-bar"), {
      tooltip: { ...tooltipBase(), trigger: "axis" },
      legend: { textStyle: AXIS_LABEL, top: 0, type: "scroll" },
      grid: { left: 40, right: 16, top: 44, bottom: 40 },
      xAxis: { ...axisBase("category"), data: bms, axisLabel: { ...AXIS_LABEL, rotate: 30 } },
      yAxis: axisBase(),
      series: barSeries,
    });

    // 雷达
    const dims = DATA.meta.radar_dimensions || [];
    const tax = DATA.meta.benchmark_taxonomy || {};
    const dimOf = bm => { for (const [d, bms] of Object.entries(tax)) if (bms.includes(bm)) return d; return null; };
    const radarData = loaded.map((d, i) => {
      const acc = {};
      (d.official_benchmarks || []).forEach(b => { const dd = dimOf(b.benchmark); if (!dd) return; acc[dd] = acc[dd] || { s: 0, n: 0 }; acc[dd].s += b.value; acc[dd].n++; });
      return {
        name: d.title.length > 16 ? d.title.slice(0, 16) + "…" : d.title,
        value: dims.map(dm => acc[dm] ? +(acc[dm].s / acc[dm].n).toFixed(1) : 0),
        lineStyle: { width: 2 }, itemStyle: { color: PALETTE[i % PALETTE.length] }, areaStyle: { opacity: .08 },
      };
    });
    chart(document.getElementById("c-radar"), {
      tooltip: tooltipBase(),
      legend: { textStyle: AXIS_LABEL, bottom: 0, type: "scroll" },
      radar: { indicator: dims.map(d => ({ name: d, max: 100 })), axisName: AXIS_LABEL, splitLine: SPLIT_LINE, splitArea: { show: false }, axisLine: { lineStyle: { color: "#30363d" } } },
      series: [{ type: "radar", data: radarData }],
    });

    // 明细表：行=benchmark，列=各模型；每行最高分标 SOTA
    const rows = bms.map(bm => {
      const cells = loaded.map(d => {
        const f = (d.official_benchmarks || []).find(b => b.benchmark === bm);
        return f ? f.value : null;
      });
      const best = Math.max(...cells.filter(v => v != null));
      return { bm, cells, best };
    });
    const header = `<thead><tr><th>基准</th>${loaded.map(d => `<th>${esc(d.title.length > 14 ? d.title.slice(0, 14) + "…" : d.title)}</th>`).join("")}<th>对比组 SOTA</th></tr></thead>`;
    const body = rows.map(r => `<tr><td class="mono">${esc(r.bm)}</td>${r.cells.map(c => {
      const isBest = c != null && c === r.best;
      return `<td>${c != null ? `<b class="mono" style="color:${isBest ? "var(--green)" : "var(--text)"}">${c}</b>${isBest ? ' <span class="badge badge-progress-minor">SOTA</span>' : ""}` : "—"}</td>`;
    }).join("")}<td class="mono" style="color:var(--green)">${r.best}</td></tr>`).join("");
    document.getElementById("c-tbl").innerHTML = header + `<tbody>${body}</tbody>`;
  });
  chips();
}

/* ---------- 应用产品 ---------- */
function renderApps(view) {
  const groups = {};
  DATA.products.forEach(p => (groups[p.category] = groups[p.category] || []).push(p));
  view.innerHTML = `
    <div class="page-title">AI 应用产品</div>
    <div class="page-sub">核心 AI 应用产品与功能更新（ChatGPT / Claude / Kimi / 豆包 / 元宝…）</div>
    <div id="apps-body"></div>`;
  const body = document.getElementById("apps-body");
  Object.keys(groups).sort().forEach(cat => {
    const ps = groups[cat];
    const sec = el("div", "section");
    sec.appendChild(el("div", "section-title", CATEGORY_LABELS[cat] || cat));
    const grid = el("div", "grid grid-3");
    ps.forEach(p => {
      const card = el("div", "card");
      card.innerHTML = `
        <div style="font-weight:700;font-size:15px">${esc(p.name_zh || p.name)}
          ${p.homepage ? `<a href="${esc(p.homepage)}" target="_blank" rel="noopener" style="font-size:12px">↗</a>` : ""}</div>
        <div style="color:var(--text-dim);font-size:12.5px;margin:2px 0 8px">${vendorBadge(p.vendor_key)}</div>
        ${p.updates && p.updates.length ? `<div style="border-top:1px solid var(--border);padding-top:8px">${p.updates.slice(0, 5).map(u => `
          <div style="margin-bottom:6px;font-size:12.5px">
            <span class="mono" style="color:var(--text-dim)">${fmtDay(u.published_at)}</span> ${majorBadge(u.is_major)}
            <div>${u.url ? `<a href="${esc(u.url)}" target="_blank" rel="noopener">${esc(u.title)}</a>` : esc(u.title)}</div>
          </div>`).join("")}</div>` : '<div class="metric-empty" style="font-size:12px">暂无更新记录（采集接入后自动出现）</div>'}`;
      grid.appendChild(card);
    });
    sec.appendChild(grid);
    body.appendChild(sec);
  });
}

/* ---------- 论文 ---------- */
function renderPapers(view) {
  view.innerHTML = `
    <div class="page-title">论文</div>
    <div class="page-sub">arXiv 收录的模型技术报告与论文 · 共 ${DATA.papers.length} 篇</div>
    <div id="papers-body"></div>`;
  const body = document.getElementById("papers-body");
  if (!DATA.papers.length) {
    body.innerHTML = '<div class="card empty"><div class="big">📄</div>暂无论文（arXiv 采集接入后自动出现）</div>';
    return;
  }
  DATA.papers.forEach(p => {
    const card = el("div", "card");
    card.style.marginBottom = "12px";
    const abs = el("div", "");
    abs.style.cssText = "color:var(--text-dim);font-size:12.5px;margin-top:6px;display:none;white-space:pre-wrap";
    abs.textContent = p.abstract || "";
    const toggle = el("a", "", "摘要");
    toggle.href = "javascript:void(0)";
    toggle.style.fontSize = "12.5px";
    toggle.onclick = () => { abs.style.display = abs.style.display === "none" ? "block" : "none"; };
    card.innerHTML = `
      <div style="font-weight:600"><a href="${esc(p.arxiv_url)}" target="_blank" rel="noopener">${esc(p.title)}</a></div>
      <div style="color:var(--text-dim);font-size:12px;margin-top:2px">
        ${fmtDay(p.published_at)} · ${esc(p.authors || "")}${p.vendor_key ? " · " + vendorBadge(p.vendor_key) : ""}
        ${p.release_id ? ` · <a href="#/release/${p.release_id}">关联发布</a>` : ""} · </div>`;
    card.querySelector("div[style*='font-size:12px']").appendChild(toggle);
    card.appendChild(abs);
    body.appendChild(card);
  });
}

/* ---------- 启动 ---------- */
function renderSearchResults(q) {
  const drop = document.getElementById("search-drop");
  if (!q || q.length < 2) { drop.style.display = "none"; return; }
  const kw = q.toLowerCase();
  const vm = vendorMap();
  const models = DATA.releases.filter(r => r.title.toLowerCase().includes(kw)).slice(0, 6);
  const vendors = DATA.vendors.filter(v => (v.name + " " + (v.name_zh || "")).toLowerCase().includes(kw)).slice(0, 4);
  const papers = DATA.papers.filter(p => p.title.toLowerCase().includes(kw)).slice(0, 4);
  const items = [
    ...vendors.map(v => ({ label: `🏢 ${v.name_zh || v.name}`, href: `#/vendor/${v.key}` })),
    ...models.map(r => ({ label: `📦 ${r.title}`, href: `#/release/${r.id}` })),
    ...papers.map(p => ({ label: `📄 ${p.title.slice(0, 60)}`, href: p.arxiv_url, ext: true })),
  ];
  drop.innerHTML = items.length
    ? items.map(i => `<a href="${esc(i.href)}" ${i.ext ? 'target="_blank" rel="noopener"' : ""}>${esc(i.label)}</a>`).join("")
    : '<div class="drop-empty">无匹配结果</div>';
  drop.style.display = "block";
}

async function boot() {
  const [meta, vendors, releases, history, products, papers, presets] = await Promise.all([
    fetch("data/meta.json").then(r => r.json()),
    fetch("data/vendors.json").then(r => r.json()),
    fetch("data/releases_index.json").then(r => r.json()),
    fetch("data/benchmark_history.json").then(r => r.json()),
    fetch("data/products.json").then(r => r.json()),
    fetch("data/papers.json").then(r => r.json()),
    fetch("data/generation_presets.json").then(r => r.json()).catch(() => []),
  ]);
  Object.assign(DATA, { meta, vendors, releases, history, products, papers, presets });
  document.getElementById("brand-title").textContent = meta.brand.title;
  document.title = meta.brand.title;
  document.getElementById("foot-updated").textContent = `数据更新于 ${timeAgo(meta.generated_at)}`;
  const search = document.getElementById("global-search");
  search.addEventListener("input", () => renderSearchResults(search.value));
  search.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      const first = document.querySelector("#search-drop a");
      if (first) { first.click(); document.getElementById("search-drop").style.display = "none"; }
    }
  });
  document.addEventListener("click", e => {
    if (!e.target.closest(".search-box")) document.getElementById("search-drop").style.display = "none";
  });
  window.addEventListener("hashchange", render);
  window.addEventListener("resize", () => charts.forEach(c => c.resize()));
  render();
}
boot();
