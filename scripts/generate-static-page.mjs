import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const dataPath = path.join(projectRoot, "data.json");
const indexPath = path.join(projectRoot, "index.html");
const sitemapPath = path.join(projectRoot, "sitemap.xml");
const vendorDirectory = path.join(projectRoot, "vendor");
const siteOrigin = "https://aiapirank.github.io";
const sourceUrl = process.env.DATA_SOURCE_URL
  || "https://raw.githubusercontent.com/hvoyai/awesome-ai-api/main/data.json";
const shouldSync = process.argv.includes("--sync");

// Slug and display copy for each model vendor that gets its own landing page.
// `intro` is hand-written per vendor so the pages don't read as one template
// with a word swapped — near-duplicate landing pages get filtered by search engines.
// Vendors absent from this map are still shown in the table but get no subpage.
const VENDOR_PAGES = [
  {
    key: "Anthropic",
    slug: "claude-code",
    label: "Claude / Claude Code",
    keyword: "Claude Code 中转站",
    intro: "Claude Code 是目前使用中转站最集中的场景之一。它按 token 计费且上下文窗口大，长时间编码会话的消耗远高于普通对话，"
      + "因此单次请求的稳定性比峰值速度更重要——一次中断可能让整段会话的上下文重来。选站时优先看在线率而非延迟排名，"
      + "并确认站点是否支持 Anthropic 官方的流式响应和工具调用，这两项缺失会直接影响 Claude Code 的可用性。",
    tip: "注意区分「支持 Claude 模型」和「支持 Claude Code」：部分中转站只转发对话接口，不支持 Claude Code 需要的工具调用能力。",
  },
  {
    key: "OpenAI",
    slug: "openai-gpt",
    label: "OpenAI GPT",
    keyword: "OpenAI API 中转站",
    intro: "OpenAI 接口是中转站覆盖最广的一类，几乎所有站点都以 OpenAI 兼容格式作为统一入口，很多第三方工具也默认走这个协议。"
      + "覆盖广意味着可选项多，但也意味着质量参差：同样标称支持 GPT，实际可能是官方通道、企业渠道或再次转售的二手额度，"
      + "响应质量和限流策略差别很大。建议用相同 prompt 在几家之间横向对比后再决定。",
    tip: "OpenAI 兼容格式已成为事实标准，选支持该格式的站点可以最大限度降低后续更换服务商的迁移成本。",
  },
  {
    key: "Google",
    slug: "gemini",
    label: "Google Gemini",
    keyword: "Gemini API 中转站",
    intro: "Gemini 的长上下文和多模态能力是主要卖点，但也让中转站之间的差异更明显：处理超长上下文和图片输入对中转层的转发实现要求更高，"
      + "部分站点在长请求下会出现截断或超时。如果你的场景涉及长文档或图像输入，务必用接近真实负载的请求实测，"
      + "而不是只用简短对话验证连通性。",
    tip: "Gemini 的多模态请求体积较大，测试时建议直接用实际会用到的图片尺寸和文档长度，短请求测不出问题。",
  },
  {
    key: "DeepSeek",
    slug: "deepseek",
    label: "DeepSeek",
    keyword: "DeepSeek API 中转站",
    intro: "DeepSeek 官方 API 本身价格低且支持国内支付，所以走中转站的核心理由通常不是绕过支付门槛，"
      + "而是想用一个 Key 同时调用 DeepSeek 和其他厂商模型，或是官方接口在高峰期限流时需要备用通道。"
      + "如果你只用 DeepSeek 单一模型，直接使用官方 API 往往更划算也更稳定。",
    tip: "只用 DeepSeek 的话官方 API 通常是更好的选择；中转站的价值主要在多模型统一接入。",
  },
  {
    key: "智谱",
    slug: "zhipu-glm",
    label: "智谱 GLM",
    keyword: "GLM API 中转站",
    intro: "智谱 GLM 在国内合规场景中使用较多，企业采购时对发票和对公转账的要求通常是硬性的。"
      + "相比在线率的细微差别，能否提供合规票据、签订服务协议往往才是决定性因素。"
      + "本页的服务政策列可以直接用来筛掉不支持开票的站点。",
    tip: "企业采购 GLM 通道时，建议先确认发票类型（普票／专票）和开票主体，再评估技术指标。",
  },
  {
    key: "月之暗面",
    slug: "kimi",
    label: "月之暗面 Kimi",
    keyword: "Kimi API 中转站",
    intro: "Kimi 的强项是超长上下文处理，常见用途是长文档分析和资料整理。这类请求单次 token 消耗大、处理时间长，"
      + "对中转站的超时配置比较敏感——有些站点的网关超时设置偏短，长文档请求还没处理完就被切断。"
      + "选站时建议直接用一份真实长度的文档测试，而不是看平均延迟指标。",
    tip: "长上下文请求容易触发中转层的网关超时，实测时请用你实际会处理的文档长度。",
  },
  {
    key: "xAI",
    slug: "xai-grok",
    label: "xAI Grok",
    keyword: "Grok API 中转站",
    intro: "Grok 的中转覆盖率明显低于 OpenAI 和 Anthropic，可选站点数量有限，因此挑选空间较小。"
      + "在可选项本就不多的情况下，建议优先考虑同时接入多家厂商的综合型站点，"
      + "这样即使 Grok 通道出现问题也有替代方案，而不必重新找服务商。",
    tip: "Grok 通道的可选站点较少，建议选综合型站点以便在通道异常时快速切换到其他模型。",
  },
  {
    key: "SpaceXAI",
    slug: "spacexai",
    label: "SpaceXAI",
    keyword: "SpaceXAI 中转站",
    intro: "SpaceXAI 在榜单中的覆盖数量中等，接入的站点以综合型服务为主，通常同时提供多家厂商的通道。"
      + "由于公开的第三方使用反馈相对较少，建议把用户评分和评价条数作为重要参考，"
      + "并在正式接入前用小额充值验证实际可用性。",
    tip: "该厂商的公开评测数据较少，建议以小额充值实测为主，不要仅依据榜单指标决策。",
  },
  {
    key: "MiniMax",
    slug: "minimax",
    label: "MiniMax",
    keyword: "MiniMax API 中转站",
    intro: "MiniMax 的语音和多模态能力是差异化卖点，但并非所有中转站都完整转发这些非文本接口——"
      + "很多站点只支持标准的文本对话补全。如果你需要的是语音合成或多模态能力，"
      + "接入前必须逐项确认接口支持范围，仅看「支持 MiniMax」的标注是不够的。",
    tip: "中转站标注支持 MiniMax 通常只覆盖文本接口，语音和多模态能力需要单独确认。",
  },
  {
    key: "阿里云",
    slug: "alibaba-qwen",
    label: "阿里云通义",
    keyword: "通义千问 API 中转站",
    intro: "通义千问系列在国内生态中集成度较高，官方渠道本身就支持国内支付和开票，"
      + "所以选择中转站的主要动机通常是多模型统一接入，而非解决支付问题。"
      + "如果业务已经在阿里云体系内，直接使用官方接口在合规和稳定性上都更有优势。",
    tip: "已在阿里云体系内的业务，官方接口在合规与稳定性上通常优于中转；中转适合跨厂商统一调用。",
  },
  {
    key: "Xiaomi",
    slug: "xiaomi",
    label: "小米 MiMo",
    keyword: "小米 AI API 中转站",
    intro: "小米 MiMo 属于榜单中覆盖较窄的厂商，接入的中转站数量很少，样本量小意味着榜单指标的参考价值也相对有限。"
      + "在这种情况下，站点自身的综合可靠性——整体在线率、其他通道的表现、是否支持退款——"
      + "比单看该厂商的覆盖情况更值得参考。",
    tip: "该厂商接入站点较少，建议主要参考站点的整体可靠性指标，而非单一通道的覆盖情况。",
  },
  {
    key: "ByteDance",
    slug: "bytedance-doubao",
    label: "字节豆包",
    keyword: "豆包 API 中转站",
    intro: "豆包在第三方中转站中的覆盖非常有限，目前可选站点极少。",
    tip: "可选站点极少，建议优先考虑官方渠道。",
  },
];

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
                    <a class="site-link" href="${escapeHtml(url)}" target="_blank" rel="nofollow noopener" referrerpolicy="strict-origin-when-cross-origin">
                      <span class="site-avatar">${escapeHtml(initial)}</span>
                      <span class="site-copy">
                        <span class="site-name">${escapeHtml(site.name)}<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3h7v7M13 3 6 10M11 9v4H3V5h4"></path></svg></span>${renderEstablishedDate(site)}
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
    return `<a href="${url}" rel="nofollow noopener" referrerpolicy="strict-origin-when-cross-origin">${escapeHtml(site.name)}</a> 排名第 ${site.rank}，在线率 ${formatPercent(site.uptime)}、平均延迟 ${formatLatency(site.latencyMs)}，覆盖 ${site.modelCount} 个模型`;
  }).join("；");

  return `        <div class="seo-ranking-summary">
          <h3>${monthText} AI 中转站榜单摘要</h3>
          <p>当前榜单共评测 ${sites.length} 家 AI API 中转站。${details}。</p>
          <p>榜单前十五名还包括${rest}，覆盖 Claude Code、OpenAI GPT、Grok、Gemini、GLM、Kimi、DeepSeek 等主流模型及开发工具。</p>
        </div>`;
}

function buildCoverage(sites) {
  const measured = (key) => sites.filter((site) => Number.isFinite(site[key])).length;
  const uptimes = sites.map((site) => site.uptime).filter(Number.isFinite);
  const latencies = sites.map((site) => site.latencyMs).filter(Number.isFinite).sort((a, b) => a - b);

  return {
    total: sites.length,
    uptimeMeasured: measured("uptime"),
    latencyMeasured: measured("latencyMs"),
    ratingMeasured: measured("userRating"),
    highUptime: uptimes.filter((value) => value >= 99.5).length,
    medianLatency: latencies.length ? latencies[Math.floor(latencies.length / 2)] : NaN,
    refundYes: sites.filter((site) => site.supportsRefund === true).length,
    invoiceYes: sites.filter((site) => site.supportsInvoice === true).length,
    wellReviewed: sites.filter((site) => site.ratingCount >= 5).length,
  };
}

function buildFaq(coverage, updatedDate) {
  const dateText = /^\d{4}-\d{2}-\d{2}$/.test(updatedDate) ? updatedDate : "最近一次同步";
  return [
    {
      question: "这份 AI 中转站排行榜的数据是怎么来的？",
      answer: `榜单收录 ${coverage.total} 家 AI API 中转站，数据来自禾维 AI 的公开监测，每天同步两次，当前快照日期为 ${dateText}。榜单不接受赞助，排名不出售。需要说明的是，并非所有站点都有完整监测数据：${coverage.total} 家中有 ${coverage.uptimeMeasured} 家有在线率数据、${coverage.latencyMeasured} 家有延迟数据、${coverage.ratingMeasured} 家有用户评分，其余站点仅收录基础信息，指标显示为“--”。`,
    },
    {
      question: "在线率和延迟数据可信吗？",
      answer: `这些数据来自第三方探测节点的周期性采样，反映的是探测点到中转站的网络状况，不等于你本地的实际体验。在线率和延迟会随时间、地区、运营商和网络环境显著波动。当前有数据的站点中位延迟约 ${formatLatency(coverage.medianLatency)}，仅 ${coverage.highUptime} 家在线率达到 99.5% 以上。正式接入前建议自行小额充值实测。`,
    },
    {
      question: "AI 中转站和官方 API 该怎么选？",
      answer: "对数据隐私、长期稳定性要求高，且具备海外支付方式和网络条件的，优先选官方 API，请求直达厂商。需要低门槛接入、用一个 Key 调用多家厂商模型、或没有海外支付条件的，中转站更方便。中转站的请求会经过第三方系统，不建议传输敏感数据。",
    },
    {
      question: "选择中转站时应该重点看哪些指标？",
      answer: `建议按这个顺序看：一是在线率，低于 97.5% 的站点在生产环境容易出问题；二是延迟，超过 7.5 秒的体感明显；三是服务政策，榜单中有 ${coverage.refundYes} 家明确支持退款、${coverage.invoiceYes} 家支持开发票，企业采购尤其需要确认；四是用户评分，但要留意评价数量，只有 ${coverage.wellReviewed} 家的评价数达到 5 条以上，样本太小的评分参考价值有限。`,
    },
    {
      question: "中转站支持哪些支付方式？",
      answer: "榜单收录的站点中，支付宝和微信是最普遍的支付方式，部分站点还支持对公转账、信用卡和 USDT。对公转账和发票支持通常是企业采购的硬性要求，可以用榜单的“服务能力”筛选器快速过滤。",
    },
    {
      question: "排名靠前就一定更好吗？",
      answer: "不一定。排名是多项指标的综合结果，但你的实际需求可能只关心其中一项。比如你只用 Claude Code，那么一个模型覆盖少但 Anthropic 通道稳定的站点可能比综合排名更高的站点更适合。建议用筛选和排序功能，按自己关心的维度重新排列，而不是直接取榜首。",
    },
  ];
}

function renderContentSection(coverage, faq, updatedDate, vendorCounts) {
  const dateText = /^\d{4}-\d{2}-\d{2}$/.test(updatedDate) ? updatedDate.replaceAll("-", ".") : "最近一次同步";
  const faqItems = faq.map((item) => `            <details class="faq-item">
              <summary>${escapeHtml(item.question)}</summary>
              <p>${escapeHtml(item.answer)}</p>
            </details>`).join("\n");
  const vendorLinks = VENDOR_PAGES
    .filter((vendor) => (vendorCounts.get(vendor.key) || 0) >= 5)
    .map((vendor) => `            <a href="./vendor/${vendor.slug}/">${escapeHtml(vendor.label)} <span>${vendorCounts.get(vendor.key)}</span></a>`)
    .join("\n");

  return `      <section class="guide-section shell" aria-labelledby="guide-title">
        <div class="section-heading">
          <div>
            <p class="section-index">03 / 使用说明</p>
            <h2 id="guide-title">怎样读这份榜单</h2>
          </div>
        </div>

        <div class="guide-grid">
          <article class="guide-card">
            <h3>数据从哪里来</h3>
            <p>榜单收录 ${coverage.total} 家 AI API 中转站，指标来自禾维 AI 的公开监测数据，每天更新两次，当前数据日期为 ${escapeHtml(dateText)}。榜单不接受赞助投放，排名不出售。</p>
          </article>

          <article class="guide-card">
            <h3>数据覆盖率</h3>
            <p>并非所有收录站点都有完整监测数据。当前 ${coverage.total} 家中，${coverage.uptimeMeasured} 家有在线率数据，${coverage.latencyMeasured} 家有延迟数据，${coverage.ratingMeasured} 家有用户评分。缺失指标在表格中显示为“--”，不参与推断，也不按 0 计算。</p>
          </article>

          <article class="guide-card">
            <h3>指标怎么读</h3>
            <p>在线率 ≥99.5% 记为良好，97.5%–99.5% 为中等；延迟 ≤5 秒为良好，5–7.5 秒为中等。当前有数据的站点中位延迟约 ${formatLatency(coverage.medianLatency)}，达到 99.5% 在线率的仅 ${coverage.highUptime} 家。这些数字来自第三方探测节点，不等于你本地的真实体验。</p>
          </article>

          <article class="guide-card">
            <h3>已知局限</h3>
            <p>监测是周期性采样而非连续观测，短时故障可能被漏掉。延迟受探测点地理位置影响，与你所在网络环境的结果会有差异。评分样本普遍偏小，仅 ${coverage.wellReviewed} 家评价数达到 5 条以上。榜单仅供选型参考，不构成服务背书。</p>
          </article>
        </div>

        <div class="faq-block">
          <h3 id="faq-title">常见问题</h3>
          <div class="faq-list">
${faqItems}
          </div>
        </div>

        <div class="vendor-links">
          <h3>按模型厂商查看中转站</h3>
          <p>只关心某一家模型？下面的分类页只列出支持该厂商的中转站，指标同步自总榜。</p>
          <div class="vendor-link-list">
${vendorLinks}
          </div>
        </div>
      </section>`;
}

function renderVendorRow(site, position) {
  const url = safeUrl(site.url);
  const uptimeClass = qualityClass("uptime", site.uptime);
  const latencyClass = qualityClass("latency", site.latencyMs);
  const otherModels = site.models.filter((model) => model !== site.__vendorKey);

  return `            <tr>
              <td class="rank-cell"><span class="rank-number${position <= 3 ? ` rank-number--${position}` : ""}">${position}</span></td>
              <th class="site-cell" scope="row">
                <a class="site-link" href="${escapeHtml(url)}" target="_blank" rel="nofollow noopener" referrerpolicy="strict-origin-when-cross-origin">
                  <span class="site-avatar">${escapeHtml(Array.from(site.name.trim())[0] || "A")}</span>
                  <span class="site-copy">
                    <span class="site-name">${escapeHtml(site.name)}</span>${renderEstablishedDate(site)}
                  </span>
                </a>
              </th>
              <td class="quality-cell">
                <div class="quality-grid">
                  <div class="quality-item"><span>在线率</span><strong class="${uptimeClass}">${formatPercent(site.uptime)}</strong></div>
                  <div class="quality-item"><span>平均延迟</span><strong class="${latencyClass}">${formatLatency(site.latencyMs)}</strong></div>
                </div>
              </td>
              <td class="models-cell"><div class="model-headline"><strong>${numberFormatter.format(site.modelCount)}</strong><span>个模型</span></div><div class="tag-list">${renderModelTags(otherModels)}</div></td>
              <td class="rating-cell">${renderRating(site)}</td>
              <td class="payment-cell"><div class="payment-list">${renderPaymentTags(site.paymentMethods)}</div></td>
              <td class="policy-cell"><div class="policy-list"><div class="policy-item"><span class="policy-label">退款</span>${policyStatus(site.supportsRefund)}</div><div class="policy-item"><span class="policy-label">发票</span>${policyStatus(site.supportsInvoice)}</div></div></td>
            </tr>`;
}

function buildVendorStats(matches) {
  const uptimes = matches.map((site) => site.uptime).filter(Number.isFinite);
  const latencies = matches.map((site) => site.latencyMs).filter(Number.isFinite).sort((a, b) => a - b);
  const companions = new Map();
  for (const site of matches) {
    for (const model of site.models) {
      if (model === site.__vendorKey) continue;
      companions.set(model, (companions.get(model) || 0) + 1);
    }
  }

  return {
    count: matches.length,
    highUptime: uptimes.filter((value) => value >= 99.5).length,
    averageUptime: uptimes.length ? uptimes.reduce((sum, value) => sum + value, 0) / uptimes.length : NaN,
    medianLatency: latencies.length ? latencies[Math.floor(latencies.length / 2)] : NaN,
    fastest: latencies.length ? latencies[0] : NaN,
    refundYes: matches.filter((site) => site.supportsRefund === true).length,
    invoiceYes: matches.filter((site) => site.supportsInvoice === true).length,
    topCompanions: [...companions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4),
  };
}

function renderVendorPage(vendor, matches, updatedDate, totalSites) {
  const stats = buildVendorStats(matches);
  const canonical = `${siteOrigin}/vendor/${vendor.slug}/`;
  const dateText = /^\d{4}-\d{2}-\d{2}$/.test(updatedDate) ? updatedDate : "";
  const displayDate = dateText ? dateText.replaceAll("-", ".") : "最近一次同步";
  const title = `${vendor.keyword}推荐排行榜 2026 - ${stats.count}家实测对比`;
  const description = `2026 年支持 ${vendor.label} 的 AI API 中转站排行榜，收录 ${stats.count} 家可用中转站，`
    + `平均在线率 ${formatPercent(stats.averageUptime)}、中位延迟 ${formatLatency(stats.medianLatency)}。`
    + `${vendor.tip}数据更新于 ${displayDate}，不接受赞助投放。`;
  const top = matches.slice(0, 3);
  const topText = top.map((site) => `${site.name}（在线率 ${formatPercent(site.uptime)}、延迟 ${formatLatency(site.latencyMs)}）`).join("、");
  const companionText = stats.topCompanions.length
    ? stats.topCompanions.map(([model, count]) => `${model}（${count} 家）`).join("、")
    : "暂无其他厂商数据";

  const faq = [
    {
      question: `哪些 AI 中转站支持 ${vendor.label}？`,
      answer: `当前榜单收录的 ${totalSites} 家中转站中，有 ${stats.count} 家提供 ${vendor.label} 通道。`
        + `按综合排名靠前的包括 ${topText}。完整列表见本页表格，每天同步两次。`,
    },
    {
      question: `${vendor.label} 中转站的稳定性如何？`,
      answer: `这 ${stats.count} 家的平均在线率为 ${formatPercent(stats.averageUptime)}，其中 ${stats.highUptime} 家达到 99.5% 以上；`
        + `中位延迟约 ${formatLatency(stats.medianLatency)}，最快的一家约 ${formatLatency(stats.fastest)}。`
        + `数据来自第三方探测节点的周期性采样，会随地区和网络环境波动，正式接入前建议小额实测。`,
    },
    {
      question: `选 ${vendor.label} 中转站要注意什么？`,
      answer: `${vendor.tip} 此外建议确认服务政策：这 ${stats.count} 家中有 ${stats.refundYes} 家明确支持退款、${stats.invoiceYes} 家支持开发票，`
        + `企业采购需要重点核对。中转站的请求会经过第三方系统，涉及敏感数据的场景建议直接使用官方 API。`,
    },
  ];

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${canonical}#webpage`,
        url: canonical,
        name: title,
        description,
        inLanguage: "zh-CN",
        ...(dateText ? { dateModified: dateText } : {}),
        isPartOf: { "@id": `${siteOrigin}/#website` },
        breadcrumb: { "@id": `${canonical}#breadcrumb` },
        mainEntity: { "@id": `${canonical}#list` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${canonical}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "AI 中转站排行榜", item: `${siteOrigin}/` },
          { "@type": "ListItem", position: 2, name: `${vendor.label} 中转站`, item: canonical },
        ],
      },
      {
        "@type": "ItemList",
        "@id": `${canonical}#list`,
        name: `支持 ${vendor.label} 的 AI 中转站排行榜`,
        numberOfItems: matches.length,
        itemListOrder: "https://schema.org/ItemListOrderAscending",
        itemListElement: matches.map((site, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: site.name,
          url: safeUrl(site.url),
        })),
      },
      {
        "@type": "FAQPage",
        "@id": `${canonical}#faq`,
        inLanguage: "zh-CN",
        mainEntity: faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      },
    ],
  };

  const jsonLd = JSON.stringify(structuredData, null, 2).replaceAll("<", "\\u003c");
  const otherVendorLinks = VENDOR_PAGES
    .filter((item) => item.slug !== vendor.slug)
    .map((item) => `<a href="../${item.slug}/">${escapeHtml(item.label)}</a>`)
    .join("\n            ");

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
    <meta name="theme-color" content="#0b1020" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:site_name" content="AI API Rank" />
    <meta property="og:locale" content="zh_CN" />
    <meta property="og:image" content="${siteOrigin}/og-image.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${siteOrigin}/og-image.png" />
    <link rel="canonical" href="${canonical}" />
    <link rel="alternate" hreflang="zh-CN" href="${canonical}" />
    <link rel="alternate" hreflang="x-default" href="${canonical}" />
    <link rel="icon" href="../../favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="../../styles.css?v=20260726-1" />
    <script type="application/ld+json">
${jsonLd.split("\n").map((line) => `      ${line}`).join("\n")}
    </script>
  </head>
  <body>
    <header class="site-header">
      <div class="shell header-inner">
        <a class="brand" href="../../" aria-label="AI API Rank 首页">
          <span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></span>
          <span><strong>AI API</strong><small>RANK / 2026</small></span>
        </a>
        <nav class="site-nav" aria-label="主要导航">
          <a href="../../">完整榜单</a>
          <a href="../../#faq-title">常见问题</a>
        </nav>
      </div>
    </header>

    <main>
      <section class="hero shell vendor-hero" aria-labelledby="page-title">
        <div class="hero-copy">
          <nav class="breadcrumb" aria-label="面包屑导航">
            <a href="../../">AI 中转站排行榜</a> <span aria-hidden="true">/</span> <span>${escapeHtml(vendor.label)}</span>
          </nav>
          <h1 id="page-title">${escapeHtml(vendor.keyword)}推荐排行榜</h1>
          <p class="hero-description">在 ${totalSites} 家中转站中筛选出 ${stats.count} 家支持 ${escapeHtml(vendor.label)} 的服务，按综合表现排序。数据更新于 ${escapeHtml(displayDate)}。</p>
        </div>
        <aside class="snapshot-card" aria-label="榜单概览">
          <dl class="snapshot-grid">
            <div><dt>支持站点</dt><dd>${stats.count}</dd></div>
            <div><dt>平均在线率</dt><dd>${formatPercent(stats.averageUptime)}</dd></div>
            <div><dt>中位延迟</dt><dd>${formatLatency(stats.medianLatency)}</dd></div>
            <div><dt>高可用站点</dt><dd>${stats.highUptime}</dd></div>
          </dl>
          <div class="snapshot-card__footer"><span>更新于</span><strong>${escapeHtml(displayDate)}</strong></div>
        </aside>
      </section>

      <section class="ranking-section shell" aria-labelledby="list-title">
        <div class="section-heading">
          <div>
            <p class="section-index">01 / ${escapeHtml(vendor.slug.toUpperCase())}</p>
            <h2 id="list-title">支持 ${escapeHtml(vendor.label)} 的中转站列表</h2>
          </div>
          <p>${stats.count} 家</p>
        </div>

        <div class="seo-ranking-summary">
          <h3>${escapeHtml(vendor.label)} 中转站概况</h3>
          <p>当前有 ${stats.count} 家中转站提供 ${escapeHtml(vendor.label)} 通道，平均在线率 ${formatPercent(stats.averageUptime)}，中位延迟 ${formatLatency(stats.medianLatency)}，其中 ${stats.highUptime} 家在线率达到 99.5% 以上。综合排名靠前的是 ${escapeHtml(topText)}。</p>
          <p>这些站点通常还同时接入 ${escapeHtml(companionText)}，适合需要一个 Key 调用多家模型的场景。服务政策方面，${stats.refundYes} 家支持退款，${stats.invoiceYes} 家可开发票。</p>
        </div>

        <div class="vendor-intro">
          <h3>选择 ${escapeHtml(vendor.label)} 中转站前值得知道的</h3>
          <p>${escapeHtml(vendor.intro)}</p>
          <p class="vendor-tip"><strong>提示</strong>${escapeHtml(vendor.tip)}</p>
        </div>

        <div class="table-shell">
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th class="rank-column" scope="col">排名</th>
                  <th class="site-column" scope="col">站点</th>
                  <th scope="col">运行质量</th>
                  <th scope="col">其他模型</th>
                  <th scope="col">用户口碑</th>
                  <th scope="col">支付方式</th>
                  <th scope="col">服务政策</th>
                </tr>
              </thead>
              <tbody>
${matches.map((site, index) => renderVendorRow(site, index + 1)).join("\n")}
              </tbody>
            </table>
          </div>
        </div>

        <p class="data-note">排名沿用总榜的综合顺序，仅筛选出支持 ${escapeHtml(vendor.label)} 的站点。在线率与延迟为第三方探测采样，接入前请自行小额测试。</p>
      </section>

      <section class="guide-section shell" aria-labelledby="faq-title">
        <div class="section-heading">
          <div>
            <p class="section-index">02 / FAQ</p>
            <h2 id="faq-title">关于 ${escapeHtml(vendor.label)} 中转站</h2>
          </div>
        </div>
        <div class="faq-block">
          <div class="faq-list">
${faq.map((item) => `            <details class="faq-item">
              <summary>${escapeHtml(item.question)}</summary>
              <p>${escapeHtml(item.answer)}</p>
            </details>`).join("\n")}
          </div>
        </div>

        <div class="vendor-links">
          <h3>按模型厂商浏览</h3>
          <div class="vendor-link-list">
            <a href="../../">全部 ${totalSites} 家</a>
            ${otherVendorLinks}
          </div>
        </div>
      </section>
    </main>

    <footer class="site-footer">
      <div class="shell footer-inner">
        <div>
          <a class="brand brand--footer" href="../../">
            <span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></span>
            <span><strong>AI API</strong><small>RANK / 2026</small></span>
          </a>
          <p>先比较，再小额测试；重要调用保留备用方案。</p>
        </div>
        <div class="footer-meta">
          <p>数据来源：<a href="https://www.hvoyai.com" target="_blank" rel="noreferrer">禾维 AI</a></p>
          <p>仅供选择参考，不构成服务背书或购买建议。</p>
        </div>
      </div>
    </footer>
  </body>
</html>
`;
}

async function generateVendorPages(sites, updatedDate) {
  const generated = [];
  await mkdir(vendorDirectory, { recursive: true });

  for (const vendor of VENDOR_PAGES) {
    const matches = sites
      .filter((site) => site.models.includes(vendor.key))
      .map((site) => ({ ...site, __vendorKey: vendor.key }));

    // Too few sites would make a thin page that dilutes the whole domain.
    if (matches.length < 5) {
      process.stdout.write(`跳过 ${vendor.slug}：仅 ${matches.length} 家，内容过薄\n`);
      continue;
    }

    const directory = path.join(vendorDirectory, vendor.slug);
    await mkdir(directory, { recursive: true });
    await writeAtomically(
      path.join(directory, "index.html"),
      renderVendorPage(vendor, matches, updatedDate, sites.length),
    );
    generated.push({ slug: vendor.slug, count: matches.length });
  }

  return generated;
}

function buildSitemap(vendorPages, updatedDate) {
  const lastmod = /^\d{4}-\d{2}-\d{2}$/.test(updatedDate) ? updatedDate : "";
  const entry = (loc, priority, changefreq) => [
    "  <url>",
    `    <loc>${loc}</loc>`,
    ...(lastmod ? [`    <lastmod>${lastmod}</lastmod>`] : []),
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    "  </url>",
  ].join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entry(`${siteOrigin}/`, "1.0", "daily"),
    ...vendorPages.map((page) => entry(`${siteOrigin}/vendor/${page.slug}/`, "0.8", "daily")),
    "</urlset>",
    "",
  ].join("\n");
}

function buildStructuredData(data, sites, faq) {
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
      {
        "@type": "FAQPage",
        "@id": "https://aiapirank.github.io/#faq",
        isPartOf: { "@id": "https://aiapirank.github.io/#webpage" },
        inLanguage: "zh-CN",
        mainEntity: faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
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

function replaceTitle(html, title) {
  const pattern = /<title>[^<]*<\/title>/;
  if (!pattern.test(html)) throw new Error("index.html 中找不到 title");
  return html.replace(pattern, `<title>${escapeHtml(title)}</title>`);
}

function replaceSocialDescription(html, attribute, name, description) {
  const pattern = new RegExp(`(<meta\\s+${attribute}="${name}"\\s+content=")[^"]*("\\s*/?>)`, "s");
  if (!pattern.test(html)) throw new Error(`index.html 中找不到 ${name} meta`);
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
  const vendorCounts = new Map();
  for (const site of sites) {
    for (const model of site.models) vendorCounts.set(model, (vendorCounts.get(model) || 0) + 1);
  }
  const updatedDate = data.updatedDate || data.generatedAt || "";
  const updatedDisplay = /^\d{4}-\d{2}-\d{2}$/.test(updatedDate)
    ? updatedDate.replaceAll("-", ".")
    : updatedDate;

  let html = await readFile(indexPath, "utf8");
  const coverage = buildCoverage(sites);
  const faq = buildFaq(coverage, updatedDate);
  const structuredData = JSON.stringify(buildStructuredData(data, sites, faq), null, 2).replaceAll("<", "\\u003c");
  const jsonLd = `    <script type="application/ld+json">\n${structuredData.split("\n").map((line) => `      ${line}`).join("\n")}\n    </script>`;
  const rows = `              <tbody id="ranking-body">\n${sites.map(renderSite).join("\n")}\n              </tbody>`;
  const summary = renderSeoSummary(sites, updatedDate);

  html = replaceGeneratedBlock(html, "JSON_LD", jsonLd, /    <script type="application\/ld\+json">[\s\S]*?<\/script>/);
  html = replaceGeneratedBlock(html, "SEO_SUMMARY", summary, /        <div class="seo-ranking-summary">[\s\S]*?<\/div>/);
  html = replaceGeneratedBlock(html, "RANKING_ROWS", rows, /              <tbody id="ranking-body">[\s\S]*?<\/tbody>/);
  html = replaceGeneratedBlock(html, "GUIDE", renderContentSection(coverage, faq, updatedDate, vendorCounts));
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
  const socialDescription = `真实体验无赞助，对比 ${sites.length} 家 Claude Code、GPT、Grok、Gemini、GLM、Kimi AI 中转站的在线率、延迟、模型覆盖、评分和服务政策。`;
  html = replaceSocialDescription(html, "property", "og:description", socialDescription);
  html = replaceSocialDescription(html, "name", "twitter:description", socialDescription);

  const pageTitle = `2026 AI中转站推荐排行榜 - ${sites.length}家Claude Code/GPT/Gemini API中转站实测对比`;
  html = replaceTitle(html, pageTitle);
  html = replaceSocialDescription(html, "property", "og:title", pageTitle);
  html = replaceSocialDescription(html, "name", "twitter:title", pageTitle);

  await writeAtomically(indexPath, html);

  const vendorPages = await generateVendorPages(sites, updatedDate.slice(0, 10));
  await writeAtomically(sitemapPath, buildSitemap(vendorPages, updatedDate.slice(0, 10)));

  process.stdout.write(`已生成 index.html：${sites.length} 个静态表格行，数据日期 ${updatedDate || "未知"}\n`);
  process.stdout.write(`已生成 ${vendorPages.length} 个厂商页：${vendorPages.map((page) => `${page.slug}(${page.count})`).join("、")}\n`);
}

if (shouldSync) await syncData();
await generatePage();
