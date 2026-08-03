const state = {
  sites: [],
  query: "",
  vendor: "all",
  service: "all",
  sortBy: "rank",
};

const elements = {
  siteCount: document.querySelector("#site-count"),
  averageUptime: document.querySelector("#average-uptime"),
  averageLatency: document.querySelector("#average-latency"),
  vendorCount: document.querySelector("#vendor-count"),
  updatedAt: document.querySelector("#updated-at"),
  resultSummary: document.querySelector("#result-summary"),
  searchInput: document.querySelector("#search-input"),
  vendorFilter: document.querySelector("#vendor-filter"),
  serviceFilter: document.querySelector("#service-filter"),
  sortSelect: document.querySelector("#sort-select"),
  resetButton: document.querySelector("#reset-button"),
  retryButton: document.querySelector("#retry-button"),
  rankingBody: document.querySelector("#ranking-body"),
  loadingState: document.querySelector("#loading-state"),
  errorState: document.querySelector("#error-state"),
  errorMessage: document.querySelector("#error-message"),
  emptyState: document.querySelector("#empty-state"),
  tableContainer: document.querySelector("#table-container"),
  dataNote: document.querySelector("#data-note"),
};

const numberFormatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 });

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeBoolean(value) {
  if (value === true || value === "yes" || value === 1) return true;
  if (value === false || value === "no" || value === 0) return false;
  return null;
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return NaN;
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function normalizeSite(site, index) {
  const models = Array.isArray(site.models) ? site.models.filter(Boolean).map(String) : [];
  const paymentMethods = Array.isArray(site.paymentMethods)
    ? site.paymentMethods.filter(Boolean).map(String)
    : [];
  const modelCount = Number(site.modelCount ?? models.length);

  return {
    rank: Number(site.rank) || index + 1,
    name: String(site.name || "未命名站点"),
    url: String(site.url || "#"),
    establishedDate: String(site.establishedDate || "").trim(),
    models,
    modelCount: Number.isFinite(modelCount) ? modelCount : models.length,
    uptime: toFiniteNumber(site.uptime),
    latencyMs: toFiniteNumber(site.latencyMs),
    userRating: toFiniteNumber(site.userRating),
    ratingCount: toFiniteNumber(site.ratingCount),
    paymentMethods,
    supportsRefund: normalizeBoolean(site.supportsRefund),
    supportsInvoice: normalizeBoolean(site.supportsInvoice),
  };
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "#";
  } catch {
    return "#";
  }
}

function getDomain(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "链接未配置";
  }
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${numberFormatter.format(value)}%` : "--";
}

function formatLatency(value) {
  if (!Number.isFinite(value)) return "--";
  if (value >= 1000) return `${numberFormatter.format(value / 1000)} s`;
  return `${Math.round(value)} ms`;
}

function formatEstablishedDate(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.replaceAll("-", ".");

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date).replaceAll("/", ".");
}

function renderEstablishedDate(site) {
  if (!site.establishedDate) return "";
  return `<span class="site-established-date">创建于 <time datetime="${escapeHtml(site.establishedDate)}">${escapeHtml(formatEstablishedDate(site.establishedDate))}</time></span>`;
}

function qualityClass(type, value) {
  if (!Number.isFinite(value)) return "medium";

  if (type === "uptime") {
    if (value >= 99.5) return "good";
    if (value >= 97.5) return "medium";
    return "poor";
  }

  if (value <= 5000) return "good";
  if (value <= 7500) return "medium";
  return "poor";
}

function policyStatus(value) {
  if (value === true) return '<span class="policy-status policy-status--yes">支持</span>';
  if (value === false) return '<span class="policy-status policy-status--no">不支持</span>';
  return '<span class="policy-status policy-status--unknown">待确认</span>';
}

function renderModelTags(models) {
  if (!models.length) return '<span class="tag">暂无明细</span>';

  const visible = models.slice(0, 3).map((model) => `<span class="tag">${escapeHtml(model)}</span>`);
  if (models.length > 3) visible.push(`<span class="tag tag--more">+${models.length - 3}</span>`);
  return visible.join("");
}

function renderPaymentTags(paymentMethods) {
  if (!paymentMethods.length) return '<span class="payment-tag">未注明</span>';
  return paymentMethods.map((method) => `<span class="payment-tag">${escapeHtml(method)}</span>`).join("");
}

function renderRating(site) {
  if (!Number.isFinite(site.userRating)) {
    return `
      <div class="rating-score"><strong>--</strong><span>★</span></div>
      <span class="rating-caption">暂无评分</span>
    `;
  }

  const count = Number.isFinite(site.ratingCount) ? `${numberFormatter.format(site.ratingCount)} 条评价` : "评分人数未知";
  return `
    <div class="rating-score"><strong>${site.userRating.toFixed(1)}</strong><span>★</span></div>
    <span class="rating-caption">${escapeHtml(count)}</span>
  `;
}

function renderSite(site) {
  const uptimeClass = qualityClass("uptime", site.uptime);
  const latencyClass = qualityClass("latency", site.latencyMs);
  const url = safeUrl(site.url);
  const initial = Array.from(site.name.trim())[0] || "A";
  const rankClass = site.rank <= 3 ? ` rank-number--${site.rank}` : "";
  const uptimeWidth = Number.isFinite(site.uptime) ? Math.max(0, Math.min(100, site.uptime)) : 0;

  return `
    <tr>
      <td class="rank-cell">
        <span class="rank-number${rankClass}" aria-label="第 ${site.rank} 名">${site.rank}</span>
      </td>
      <th class="site-cell" scope="row">
        <a class="site-link" href="${escapeHtml(url)}" target="_blank" rel="nofollow noopener" referrerpolicy="strict-origin-when-cross-origin">
          <span class="site-avatar">${escapeHtml(initial)}</span>
          <span class="site-copy">
            <span class="site-name">
              ${escapeHtml(site.name)}
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3h7v7M13 3 6 10M11 9v4H3V5h4"></path></svg>
            </span>${renderEstablishedDate(site)}
          </span>
        </a>
      </th>
      <td class="quality-cell">
        <div class="quality-grid">
          <div class="quality-item">
            <span>在线率</span>
            <strong class="${uptimeClass}">${formatPercent(site.uptime)}</strong>
            <span class="uptime-track ${uptimeClass}" aria-hidden="true"><i style="width:${uptimeWidth}%"></i></span>
          </div>
          <div class="quality-item">
            <span>平均延迟</span>
            <strong class="${latencyClass}">${formatLatency(site.latencyMs)}</strong>
          </div>
        </div>
      </td>
      <td class="models-cell">
        <div class="model-headline"><strong>${numberFormatter.format(site.modelCount)}</strong><span>个模型</span></div>
        <div class="tag-list">${renderModelTags(site.models)}</div>
      </td>
      <td class="rating-cell">${renderRating(site)}</td>
      <td class="payment-cell"><div class="payment-list">${renderPaymentTags(site.paymentMethods)}</div></td>
      <td class="policy-cell">
        <div class="policy-list">
          <div class="policy-item"><span class="policy-label">退款</span>${policyStatus(site.supportsRefund)}</div>
          <div class="policy-item"><span class="policy-label">发票</span>${policyStatus(site.supportsInvoice)}</div>
        </div>
      </td>
    </tr>
  `;
}

function matchesService(site) {
  if (state.service === "refund") return site.supportsRefund === true;
  if (state.service === "invoice") return site.supportsInvoice === true;
  if (state.service === "both") return site.supportsRefund === true && site.supportsInvoice === true;
  return true;
}

function visibleSites() {
  const query = state.query.trim().toLocaleLowerCase("zh-CN");

  return state.sites
    .filter((site) => {
      const matchesQuery = !query || [
        site.name,
        getDomain(site.url),
        ...site.models,
        ...site.paymentMethods,
      ].join(" ").toLocaleLowerCase("zh-CN").includes(query);

      const matchesVendor = state.vendor === "all" || site.models.includes(state.vendor);
      return matchesQuery && matchesVendor && matchesService(site);
    })
    .sort((a, b) => {
      let comparison = 0;
      if (state.sortBy === "uptime") comparison = (b.uptime || 0) - (a.uptime || 0);
      else if (state.sortBy === "latency") comparison = (a.latencyMs || Infinity) - (b.latencyMs || Infinity);
      else if (state.sortBy === "models") comparison = b.modelCount - a.modelCount;
      else if (state.sortBy === "rating") comparison = (b.userRating || 0) - (a.userRating || 0);
      else comparison = a.rank - b.rank;

      return comparison || a.rank - b.rank;
    });
}

function setView(view) {
  elements.loadingState.hidden = view !== "loading";
  elements.errorState.hidden = view !== "error";
  elements.tableContainer.hidden = view !== "ready";
  elements.emptyState.hidden = view !== "empty";
}

function renderTable() {
  const sites = visibleSites();
  elements.rankingBody.innerHTML = sites.map(renderSite).join("");
  elements.resultSummary.textContent = `显示 ${numberFormatter.format(sites.length)} / ${numberFormatter.format(state.sites.length)} 个站点`;
  setView(sites.length ? "ready" : "empty");
}

function renderSummary() {
  const uptimes = state.sites.map((site) => site.uptime).filter(Number.isFinite);
  const latencies = state.sites.map((site) => site.latencyMs).filter(Number.isFinite);
  const vendors = new Set(state.sites.flatMap((site) => site.models));
  const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

  elements.siteCount.textContent = numberFormatter.format(state.sites.length);
  elements.averageUptime.textContent = uptimes.length ? formatPercent(average(uptimes)) : "--";
  elements.averageLatency.textContent = latencies.length ? formatLatency(average(latencies)) : "--";
  elements.vendorCount.textContent = numberFormatter.format(vendors.size);
}

function populateVendorFilter() {
  const vendors = [...new Set(state.sites.flatMap((site) => site.models))]
    .sort((a, b) => a.localeCompare(b, "zh-CN"));

  elements.vendorFilter.replaceChildren(new Option("全部厂商", "all"));
  elements.vendorFilter.insertAdjacentHTML(
    "beforeend",
    vendors.map((vendor) => `<option value="${escapeHtml(vendor)}">${escapeHtml(vendor)}</option>`).join(""),
  );
}

function formatUpdatedAt(data) {
  const value = data.updatedDate || data.updatedAt || data.generatedAt;
  if (!value) return "时间未知";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.replaceAll("-", ".");

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function loadData() {
  elements.loadingState.hidden = true;
  elements.errorState.hidden = true;
  elements.tableContainer.hidden = false;

  try {
    const response = await fetch("./data.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const rawSites = Array.isArray(data) ? data : data.sites;
    if (!Array.isArray(rawSites)) throw new Error("data.json 中缺少 sites 数组");

    state.sites = rawSites.map(normalizeSite);
    renderSummary();
    populateVendorFilter();
    elements.updatedAt.textContent = formatUpdatedAt(data);
    renderTable();
  } catch (error) {
    console.error(error);
    elements.loadingState.hidden = true;
    elements.errorState.hidden = false;
    elements.tableContainer.hidden = false;
    elements.resultSummary.textContent = "筛选暂不可用，完整榜单仍可阅读";
    elements.errorMessage.textContent = "筛选数据暂时无法读取，请稍后刷新；你仍可继续浏览下方完整榜单。";
  }
}

function resetFilters() {
  state.query = "";
  state.vendor = "all";
  state.service = "all";
  state.sortBy = "rank";
  elements.searchInput.value = "";
  elements.vendorFilter.value = "all";
  elements.serviceFilter.value = "all";
  elements.sortSelect.value = "rank";
  renderTable();
}

elements.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  renderTable();
});

elements.vendorFilter.addEventListener("change", (event) => {
  state.vendor = event.target.value;
  renderTable();
});

elements.serviceFilter.addEventListener("change", (event) => {
  state.service = event.target.value;
  renderTable();
});

elements.sortSelect.addEventListener("change", (event) => {
  state.sortBy = event.target.value;
  renderTable();
});

elements.resetButton.addEventListener("click", resetFilters);
elements.retryButton.addEventListener("click", loadData);

loadData();
