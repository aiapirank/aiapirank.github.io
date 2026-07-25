import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const dataPath = path.join(projectRoot, "data.json");
const indexPath = path.join(projectRoot, "index.html");
const sitemapPath = path.join(projectRoot, "sitemap.xml");
const sourceUrl = process.env.DATA_SOURCE_URL
  || "https://raw.githubusercontent.com/hvoyai/awesome-ai-api/main/data.json";
const shouldSync = process.argv.includes("--sync");

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

function validateData(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.sites) || !data.sites.length) {
    throw new Error("data.json 中缺少非空 sites 数组");
  }

  for (const [index, site] of data.sites.entries()) {
    if (!site || typeof site !== "object" || !site.name) {
      throw new Error(`data.json 第 ${index + 1} 条站点缺少 name`);
    }
  }
}

async function syncData() {
  const response = await fetch(sourceUrl, {
    headers: { "user-agent": "aiapirank-static-generator/1.0" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`同步 data.json 失败：HTTP ${response.status}`);

  const sourceText = await response.text();
  const sourceData = JSON.parse(sourceText);
  validateData(sourceData);

  let currentData = null;
  try {
    currentData = JSON.parse(await readFile(dataPath, "utf8"));
  } catch {
    // The first sync may not have a local data file yet.
  }

  if (currentData?.updatedDate && sourceData.updatedDate
    && sourceData.updatedDate < currentData.updatedDate) {
    throw new Error(`拒绝用较旧数据覆盖当前快照：${sourceData.updatedDate} < ${currentData.updatedDate}`);
  }

  await writeFile(dataPath, sourceText.endsWith("\n") ? sourceText : `${sourceText}\n`, "utf8");
  process.stdout.write(`已从 ${sourceUrl} 同步 data.json\n`);
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
    return '<div class="rating-score"><strong>--</strong><span>★</span></div><span class="rating-caption">暂无评分</span>';
  }
  const count = Number.isFinite(site.ratingCount)
    ? `${numberFormatter.format(site.ratingCount)} 条评价`
    : "评分人数未知";
  return `<div class="rating-score"><strong>${site.userRating.toFixed(1)}</strong><span>★</span></div><span class="rating-caption">${escapeHtml(count)}</span>`;
}

function renderSite(site) {
  const uptimeClass = qualityClass("uptime", site.uptime);
  const latencyClass = qualityClass("latency", site.latencyMs);
  const url = safeUrl(site.url);
  const initial = Array.from(site.name.trim())[0] || "A";
  const rankClass = site.rank <= 3 ? ` rank-number--${site.rank}` : "";
  const uptimeWidth = Number.isFinite(site.uptime) ? Math.max(0, Math.min(100, site.uptime)) : 0;

  return `                <tr>
                  <td class="rank-cell"><span class="rank-number${rankClass}" aria-label="第 ${site.rank} 名">${site.rank}</span></td>
                  <th class="site-cell" scope="row">
                    <a class="site-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
                      <span class="site-avatar">${escapeHtml(initial)}</span>
                      <span class="site-copy">
                        <span class="site-name">${escapeHtml(site.name)}<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3h7v7M13 3 6 10M11 9v4H3V5h4"></path></svg></span>
                        <span class="site-domain">${escapeHtml(getDomain(url))}</span>
                      </span>
                    </a>
                  </th>
                  <td class="quality-cell">
                    <div class="quality-grid">
                      <div class="quality-item"><span>在线率</span><strong class="${uptimeClass}">${formatPercent(site.uptime)}</strong><span class="uptime-track ${uptimeClass}" aria-hidden="true"><i style="width:${uptimeWidth}%"></i></span></div>
                      <div class="quality-item"><span>平均延迟</span><strong class="${latencyClass}">${formatLatency(site.latencyMs)}</strong></div>
                    </div>
                  </td>
                  <td class="models-cell"><div class="model-headline"><strong>${numberFormatter.format(site.modelCount)}</strong><span>个模型</span></div><div class="tag-list">${renderModelTags(site.models)}</div></td>
                  <td class="rating-cell">${renderRating(site)}</td>
                  <td class="payment-cell"><div class="payment-list">${renderPaymentTags(site.paymentMethods)}</div></td>
                  <td class="policy-cell"><div class="policy-list"><div class="policy-item"><span class="policy-label">退款</span>${policyStatus(site.supportsRefund)}</div><div class="policy-item"><span class="policy-label">发票</span>${policyStatus(site.supportsInvoice)}</div></div></td>
                </tr>`;
}

function renderSeoSummary(sites, updatedDate) {
  const topThree = sites.slice(0, 3);
  const rest = sites.slice(3, 15).map((site) => escapeHtml(site.name)).join("、");
  const monthText = /^\d{4}-\d{2}/.test(updatedDate || "")
    ? `${updatedDate.slice(0, 4)} 年 ${Number(updatedDate.slice(5, 7))} 月`
    : "2026 年";
  const details = topThree.map((site) => {
    const url = escapeHtml(safeUrl(site.url));
    return `<a href="${url}">${escapeHtml(site.name)}</a> 排名第 ${site.rank}，在线率 ${formatPercent(site.uptime)}、平均延迟 ${formatLatency(site.latencyMs)}，覆盖 ${site.modelCount} 个模型`;
  }).join("；");

  return `        <div class="seo-ranking-summary">
          <h3>${monthText} AI 中转站榜单摘要</h3>
          <p>当前榜单共评测 ${sites.length} 家 AI API 中转站。${details}。</p>
          <p>榜单前十五名还包括${rest}，覆盖 Claude Code、OpenAI GPT、Grok、Gemini、GLM、Kimi、DeepSeek 等主流模型及开发工具。</p>
        </div>`;
}

function buildStructuredData(data, sites) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": "https://aiapirank.github.io/#website",
        url: "https://aiapirank.github.io/",
        name: "2026AI中转站评测推荐",
        description: "2026 AI 中转站真实体验与无赞助排行榜，对比 Claude Code、GPT、Grok、Gemini、GLM、Kimi 等模型中转站。",
        inLanguage: "zh-CN",
      },
      {
        "@type": "CollectionPage",
        "@id": "https://aiapirank.github.io/#webpage",
        url: "https://aiapirank.github.io/",
        name: "2026AI中转站评测推荐",
        isPartOf: { "@id": "https://aiapirank.github.io/#website" },
        dateModified: data.updatedDate || data.generatedAt,
        description: `基于真实体验和公开监测数据，对 ${sites.length} 家 AI API 中转站的在线率、延迟、模型数量、用户评分、支付方式、退款和发票服务进行对比。`,
        mainEntity: { "@id": "https://aiapirank.github.io/#ranking-list" },
        inLanguage: "zh-CN",
      },
      {
        "@type": "Dataset",
        "@id": "https://aiapirank.github.io/#dataset",
        name: "2026 AI 中转站排行榜数据",
        description:
          "基于真实体验与公开监测的 AI API 中转站排行榜数据集，收录 635 家中转站的排名、在线率、平均延迟、模型覆盖范围、用户评分、支付方式、退款与发票支持等结构化指标，供开发者对比参考。",
        url: "https://aiapirank.github.io/",
        dateModified: data.updatedDate || data.generatedAt,
        isAccessibleForFree: true,
        license: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
        creator: {
          "@type": "Organization",
          name: "AI API Rank",
          url: "https://aiapirank.github.io/",
        },
        distribution: {
          "@type": "DataDownload",
          encodingFormat: "application/json",
          contentUrl: "https://aiapirank.github.io/data.json",
        },
        variableMeasured: ["排名", "在线率", "平均延迟", "模型数量", "模型厂商", "用户评分", "支付方式", "退款支持", "发票支持"],
      },
      {
        "@type": "ItemList",
        "@id": "https://aiapirank.github.io/#ranking-list",
        name: "2026 AI API 中转站排行榜",
        numberOfItems: sites.length,
        itemListOrder: "https://schema.org/ItemListOrderAscending",
        itemListElement: sites.map((site) => ({
          "@type": "ListItem",
          position: site.rank,
          name: site.name,
          url: safeUrl(site.url),
        })),
      },
    ],
  };
}

function generatedBlock(name, content) {
  return `<!-- GENERATED_${name}_START -->\n${content}\n<!-- GENERATED_${name}_END -->`;
}

function replaceGeneratedBlock(html, name, content, legacyPattern) {
  const start = `<!-- GENERATED_${name}_START -->`;
  const end = `<!-- GENERATED_${name}_END -->`;
  const markedPattern = new RegExp(`${start}[\\s\\S]*?${end}`);
  const replacement = generatedBlock(name, content);
  if (markedPattern.test(html)) return html.replace(markedPattern, replacement);
  if (legacyPattern?.test(html)) return html.replace(legacyPattern, replacement);
  throw new Error(`index.html 中找不到 ${name} 生成区域`);
}

function replaceElementText(html, id, value) {
  const pattern = new RegExp(`(<[^>]+id="${id}"[^>]*>)[\\s\\S]*?(</[^>]+>)`);
  if (!pattern.test(html)) throw new Error(`index.html 中找不到 #${id}`);
  return html.replace(pattern, `$1${escapeHtml(value)}$2`);
}

function replaceMetaDescription(html, description) {
  const pattern = /(<meta\s+name="description"\s+content=")[^"]*("\s*\/?>)/s;
  if (!pattern.test(html)) throw new Error("index.html 中找不到 description meta");
  return html.replace(pattern, `$1${escapeHtml(description)}$2`);
}

async function writeAtomically(targetPath, content) {
  const temporaryPath = `${targetPath}.tmp`;
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, targetPath);
}

async function generatePage() {
  const data = JSON.parse(await readFile(dataPath, "utf8"));
  validateData(data);
  const sites = data.sites.map(normalizeSite).sort((a, b) => a.rank - b.rank);
  const uptimes = sites.map((site) => site.uptime).filter(Number.isFinite);
  const latencies = sites.map((site) => site.latencyMs).filter(Number.isFinite);
  const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const vendorCount = new Set(sites.flatMap((site) => site.models)).size;
  const updatedDate = data.updatedDate || data.generatedAt || "";
  const updatedDisplay = /^\d{4}-\d{2}-\d{2}$/.test(updatedDate)
    ? updatedDate.replaceAll("-", ".")
    : updatedDate;

  let html = await readFile(indexPath, "utf8");
  const structuredData = JSON.stringify(buildStructuredData(data, sites), null, 2).replaceAll("<", "\\u003c");
  const jsonLd = `    <script type="application/ld+json">\n${structuredData.split("\n").map((line) => `      ${line}`).join("\n")}\n    </script>`;
  const rows = `              <tbody id="ranking-body">\n${sites.map(renderSite).join("\n")}\n              </tbody>`;
  const summary = renderSeoSummary(sites, updatedDate);

  html = replaceGeneratedBlock(html, "JSON_LD", jsonLd, /    <script type="application\/ld\+json">[\s\S]*?<\/script>/);
  html = replaceGeneratedBlock(html, "SEO_SUMMARY", summary, /        <div class="seo-ranking-summary">[\s\S]*?<\/div>/);
  html = replaceGeneratedBlock(html, "RANKING_ROWS", rows, /              <tbody id="ranking-body">[\s\S]*?<\/tbody>/);
  html = html.replace('<div class="table-state" id="loading-state" role="status">', '<div class="table-state" id="loading-state" role="status" hidden>');
  html = html.replace('<div class="table-scroll" id="table-container" hidden>', '<div class="table-scroll" id="table-container">');
  html = replaceElementText(html, "site-count", numberFormatter.format(sites.length));
  html = replaceElementText(html, "average-uptime", formatPercent(average(uptimes)));
  html = replaceElementText(html, "average-latency", formatLatency(average(latencies)));
  html = replaceElementText(html, "vendor-count", numberFormatter.format(vendorCount));
  html = replaceElementText(html, "updated-at", updatedDisplay || "时间未知");
  html = replaceElementText(html, "result-summary", `显示 ${sites.length} / ${sites.length} 个站点`);
  html = html.replace(/一次对比 <span id="hero-site-count">\d+<\/span> 家/, `一次对比 <span id="hero-site-count">${sites.length}</span> 家`);
  html = replaceMetaDescription(
    html,
    `2026 AI 中转站评测推荐与排行榜，基于真实体验和公开监测数据，对 ${sites.slice(0, 3).map((site) => site.name).join("、")} 等 ${sites.length} 家 Claude Code、GPT、Grok、Gemini、GLM、Kimi API 中转站的在线率、响应延迟、模型数量、用户评分、支付方式、退款及发票服务进行对比，帮助开发者选择稳定、低延迟、适合长期使用的 AI API 服务。`,
  );

  await writeAtomically(indexPath, html);

  let sitemap = await readFile(sitemapPath, "utf8");
  if (updatedDate) sitemap = sitemap.replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${updatedDate.slice(0, 10)}</lastmod>`);
  await writeAtomically(sitemapPath, sitemap);

  process.stdout.write(`已生成 index.html：${sites.length} 个静态表格行，数据日期 ${updatedDate || "未知"}\n`);
}

if (shouldSync) await syncData();
await generatePage();
