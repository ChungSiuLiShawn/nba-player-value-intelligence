# NBA 球员价值情报平台 — 架构设计文档 v2.0

版本：v2.0（2026-08-10，方向调整后替代 v1.0）
状态：v2 前端原型已交付（版本 8939568），待评审后进入数据管道开发

---

## 1. 方向变更说明

v1.0 针对腾讯《美职篮全明星》游戏内身价做预测，依赖封闭的游戏数据（需从小助手抓包/导出），数据可得性风险过高，项目已转向：

**v2.0 定位：基于公开新闻情绪与 NBA 官方数据的球员价值预测平台。**

- 数据 100% 来自公开渠道（新闻、官方统计、合同信息），无合规灰色地带，可持续运行
- 预测目标从"游戏币身价"改为自建「价值指数」（Player Value Index, 0–100）
- 用户 v1 阶段自建的五维评分体系（三分/篮板/热度/基本盘/防守）融入 v2 的"竞技表现"与"新闻情绪"维度，历史回测结论（MAPE 20.5%、方向准确率 66.7%）作为模型基准

---

## 2. 核心产品逻辑

```
每日抓取六大信源新闻
  → 事件聚类去重 → 球员实体识别 → 利好/利空分类+严重度打分
  → 可信度折减（传闻 vs 官宣）→ 信源加权 × 时效衰减
  → 球员每日「净情绪值」
  → 叠加竞技基本盘（PER/WS/BPM）+ 角色/合同 + 年龄曲线
  → 价值指数（0–100）每日更新
  → AI 预测未来 7 天指数走向 + 上涨概率 + 归因报告
  → 每季度用代理指标（2K 评分调整 / Fantasy ADP / 合同金额）校准回测
```

## 3. 信源体系（已确认）

| 层级 | 信源 | 内容 | 权重 | 采集方式 |
|---|---|---|---|---|
| Tier 1 | NBA 官网 | 官方伤病报告、交易官宣、奖项 | 1.0（免传闻折减） | 官方页面/RSS |
| Tier 1 | Shams Charania（ESPN） | 爆料、交易签约内幕 | 0.95（爆料≈官宣） | ESPN 专栏页跟踪 |
| Tier 1 | ESPN 主站 | 资深记者报道、深度分析 | 0.9 | RSS |
| Tier 2 | 虎扑 | 中文社区讨论、翻译快讯 | 0.6 | 趋势级采集 |
| Tier 2 | 直播吧 | 快讯滚动 | 0.6 | 快讯流 |
| Tier 2 | 腾讯体育 | 深度稿、赛前赛后 | 0.6 | 页面采集 |

**中文三源的交叉验证规则**：
- 英文爆料 2 小时内被中文源跟进 → 传播广度加分
- 仅中文圈流传、英文主源查无此事 → 降权并按传闻处理（过滤翻译号假新闻）

## 4. 情绪引擎管道（核心）

### 4.1 处理流程

```
Step 1  采集：六家信源定时抓取（Tier1 每小时，Tier2 每日 2 次）
Step 2  事件聚类去重：同一事件多家转载只计一次，转载量另记为"传播广度"
Step 3  球员实体识别：NER + 主角判定（标题提及 > 正文核心 > 顺带提及不计分）
Step 4  利好/利空分类：十类分类 + 严重度 1–3 档
Step 5  可信度折减：官宣 ×1.0 / 名记爆料 ×0.9 / 传闻 ×0.3–0.5
Step 6  加权聚合：信源权重 × 时效衰减（半衰期 3 天）→ 每日净情绪值
```

### 4.2 利好/利空分类体系（用户框架 + 工程补强）

| 方向 | 类别 | 典型场景 | 严重度判定依据 |
|---|---|---|---|
| 📈 利好 | 竞技爆发 | 连续高分/三双/效率暴涨 | 数据偏离赛季均值幅度 |
| 📈 利好 | 角色提升 | 升首发/球权增加/交易到强队 | 出场时间与使用率变化 |
| 📈 利好 | 合同利好 | 提前续约/大合同/被看好试水 | 合同金额 vs 预期 |
| 📈 利好 | 荣誉认可 | 全明星/周最佳/奖项候选 | 奖项级别 |
| 📈 利好 | 商业增值 | 大牌代言/球衣销量/粉丝暴涨 | 品牌级别 |
| 📉 利空 | 伤病 | 大伤/反复伤/长期缺阵 | 缺阵时长：日观察→周→月→赛季报销 |
| 📉 利空 | 角色萎缩 | 贬替补/DNP/交易到摆烂队 | 出场时间降幅 |
| 📉 利空 | 合同纠纷 | 续约破裂/想离队/合同年拉胯 | 是否本人官宣 |
| 📉 利空 | 状态下滑 | 连续低效/命中率暴跌/老化 | 连续场次与幅度 |
| 📉 利空 | 场外负面 | 法律问题/纪律处罚/更衣室矛盾 | 联盟是否介入 |

**工程补强四点**（v1 评审结论）：
1. **严重度分档**：同类别影响差 10 倍（脚踝酸痛 vs 跟腱撕裂），倾向分 = 方向 × 严重度
2. **传闻≠事实**：传闻折减 0.3–0.5 并标注"未证实"角标，官宣后按新事件重新计分
3. **事件去重**：先聚类后计分，避免转载量绑架情绪值
4. **主角判定**：战报类新闻只给核心球员计分，顺带提及不污染数据

## 5. 价值指数模型

### 5.1 M0 规则期（上线即有）

```
价值指数(0-100) = 竞技基本盘(40%) + 新闻情绪动量(25%)
                + 角色/合同(20%) + 年龄曲线(10%) + 商业价值(5%)
```

- **竞技基本盘**：PER / WS / BPM 综合 + 近 10 场 vs 赛季均值增量
- **新闻情绪动量**：§4 管道产出的净情绪值（归一化）
- **角色/合同**：首发与否、使用率、合同年限与金额健康度
- **年龄曲线**：峰值期（25–29）最高，两端递减的经验曲线
- **商业价值**：代言、球衣销量、社媒粉丝（低频更新）

### 5.2 代理锚定与回测（解决"价值无法验证"问题）

| 锚定指标 | 更新频率 | 用途 |
|---|---|---|
| NBA 2K 能力值调整 | 赛季中约每月 | 校准指数绝对水位 |
| Fantasy ADP 排名 | 季前+赛季中 | 校准球员间相对排序 |
| Spotrac 合同金额 | 事件驱动 | 验证"合同利好"类预测 |

每季度回测：指数变动与锚定指标变动的相关性，目标相关系数 ≥ 0.7。

### 5.3 模型演进

- **M0（第 1 天起）**：上述规则加权，页面标注"模型学习中"
- **M1（60–90 天后）**：XGBoost 回归（指数变动）+ 分类（上涨概率），特征 = 每日快照
- **M2（数据充足后）**：时序模型捕捉情绪→指数的传导时滞

## 6. 数据库设计（v2 主要表）

| 表 | 说明 |
|---|---|
| players | 球员主表（含年龄、2K 评分、合同信息） |
| daily_stats | 每日比赛数据（PER/WS/BPM 由此计算） |
| news_items | 新闻原始记录（信源/层级/分类/严重度/倾向分/传闻标记） |
| news_events | 事件聚类表（同一事件的转载归并） |
| sentiment_daily | 球员每日净情绪值（管道产出） |
| index_history | 价值指数时序（每日快照，模型训练数据源） |
| predictions | 预测记录 + 7 天后回填实际值（准确率看板） |
| anchor_calibrations | 代理锚定校准记录（2K/ADP/合同） |
| source_health | 信源抓取状态监控 |

## 7. 网站功能（v2 原型已实现）

| 页面 | 已实现（模拟数据） | 接入真实数据后 |
|---|---|---|
| 首页 | 搜索、指数涨跌概览、上涨榜/情绪榜/利空预警、最新情报流 | 数据源替换，结构不变 |
| 球员详情 | 价值指数走势（事件标记）、AI 预测、六维雷达、利好/利空新闻流、归因报告 | 同上 |
| 排行榜 | 涨幅/跌幅/情绪/利空预警/AI 看涨 五榜 | 同上 |
| 管理后台 | 模型看板、六信源状态、情绪管道可视化、球员数据库 | 同上 |

## 8. 后续开发计划

| 阶段 | 交付物 |
|---|---|
| ✅ v2 原型 | 前端四页面（版本 8939568） |
| Phase A | 后端 + 数据库 + 六信源采集器（Tier1 先行） |
| Phase B | 情绪分类管道（LLM 分类 + 规则兜底）+ 净情绪值产出 |
| Phase C | 价值指数 M0 上线，真实数据驱动网站 |
| Phase D | 锚定回测 + M1 XGBoost 切换 |

**合规说明**：全部采用 RSS 与公开页面的趋势级采集，Tier1 信源每小时一次、Tier2 每日两次的低频只读策略，不抓取用户内容、不绕过反爬。


---

## 附录 A：v2.1 规则更新（2026-08-10 用户确认）

1. **新闻窗口 = 7 天**：情绪引擎只计算最近 7 天内的新闻；超期新闻自动移出情绪计算（历史新闻仅保留在球员档案供查阅，不参与指数）。
   - 时效衰减参数相应调整：半衰期从 3 天收紧为 **2 天**，确保第 7 天的新闻权重趋近于 0，窗口边界平滑。
2. **无新闻不动指数**：球员近 7 天无相关新闻时，情绪维度贡献为 0，价值指数不做任何人为扰动，仅随竞技基本盘（真实比赛数据）自然变化。前端对这类球员标注"近 7 天无相关新闻，情绪维度保持中性"，趋势显示"持平"。
3. **覆盖全联盟现役球员**：30 支球队全员入库。重点球员（约 20 名高关注度球星）精调新闻流与归因；其余球员指数锚定竞技基本盘（2K 评分映射 + 年龄曲线 + 合同状况），情绪维度默认为中性，等待新闻事件激活。

> 数据库层面对应调整：`sentiment_daily` 增加窗口截止字段；`news_items` 保留全量但情绪聚合查询带 `date >= today - 7` 过滤；`players` 增加 `has_recent_news` 派生标记。


---

## 附录 B：v2.2 基础数据轨 —— 借鉴 surennba.com 的数据记录法（2026-09-24）

### B.1 对方网站的解读

surennba.com（俗人的篮球场，SvelteKit 构建，数据自 2015-16 赛季起）的球员数据记录体系：

- **15 项场均计数数据**：MIN / PTS / AST / OREB / DREB / STL / BLK / TOV / PF / FGM / FGA / 3PM / 3PA / FTM / FTA
- **两项派生效率指标**（该站核心算法）：
  - **TS%**（真实命中率）= PTS ÷ (2 × (FGA + 0.44 × FTA)) —— 已用该站每日最佳数据验算吻合
  - **GMSC**（Game Score，Hollinger 公式）= PTS + 0.4·FGM − 0.7·FGA − 0.4·(FTA−FTM) + 0.7·OREB + 0.3·DREB + STL + 0.7·AST + 0.7·BLK − 0.4·PF − TOV —— 该站"每日最佳"与赛季总览均以此为综合评分口径
- **数据治理**：最少出场时间过滤（每日 20 MIN / 赛季 500 MIN），避免小样本污染排名
- **薪资子站**：salary.surennba.com 用"百分位条形"表达球员薪资在全联盟的相对位置 —— 百分位是相对位置比较，不直接等同价值

### B.2 并入价值预估模型的方式（双轨并行）

| 轨道 | 内容 | 更新频率 | 在 PVI 中的角色 |
|---|---|---|---|
| **基础数据轨**（新增） | 15 项计数 → TS% / GMSC → 联盟百分位 | 每日赛后 | 「竞技基本盘」维度（40% 权重）的量化来源 |
| **新闻情绪轨**（原有） | 利好/利空十类 → 净情绪值（7 日窗口） | 每日抓取 | 「情绪动量」维度（25% 权重） |

- 竞技基本盘维度分 = GMSC 联盟百分位映射（替代原型阶段的纯 2K 评分代理）；TS% 作为效率修正项
- 原型阶段数据由 2K 评分 + 位置画像确定性生成；Phase A 接入每日赛果抓取后替换为真实累计场均
- 网站新增「数据总览」页：四张数据王卡片 + 可排序全联盟数据表（出场时间筛选 / 点列排序 / 点击行进详情），球员详情页新增赛季基础数据区块与 GMSC 百分位条


---

## 附录 C：Phase A 交付记录（2026-09-24，版本 90ddb23）

### C.1 已交付

- **后端嫁接**：tRPC + Drizzle ORM + Hono + MySQL（backend-building，db 模式，无登录墙，网站公开只读）
- **数据库 9 张表全部落地**：players（47 列，含 15 项赛季基础数据 + GMSC/TS% + 六维 + 归因）、index_history、news_items、news_events、sentiment_daily、predictions、source_health、anchor_calibrations
- **种子数据**：169 名球员全量入库（含 15210 条指数时序、48 条新闻）
- **Tier 1 采集器**（`api/collectors/`）：
  - `espn.ts` —— ESPN site.api JSON 主通道 + RSS 备用（实测可用，单次 50 条）
  - `nba.ts` —— NBA 官网 RSS（当前返回 404，信源健康表已记录 error 状态，待换端点）
  - `shams.ts` —— 从 ESPN 聚合流按署名/byline 过滤 Shams 爆料（X 已封闭 API，此为合规替代）
  - `match.ts` —— 球员实体识别（全名/姓氏/中文名别名 + 单词边界匹配，主角判定按命中强度排序）
  - `classify.ts` —— M0 规则分类器（利好/利空十类关键词词典 + 严重度 1–3 档 + 传闻识别），Phase B 由 LLM 替换
  - `run.ts` —— 编排器：去重（标题+URL 哈希唯一键）→ 球员识别 → 分类 → 入库 → 7 日窗口净情绪聚合（信源权重 × 传闻折减 0.4 × 半衰期 2 天衰减）
- **定时任务**：生产环境自动启动 —— Tier1 每小时 :05 运行，情绪聚合每日 08:00
- **tRPC 路由**：players.list/detail/board/count、news.recent、stats.leaders、admin.sourceHealth/runCollectors/recomputeSentiment

### C.2 首次真实采集验证（2026-09-24）

ESPN 抓到 50 条真实稿件，入库 16 条（去重 16 / 无球员匹配 27 / 规则无法分类 15），例如：
- "Sources: Mavs' Dereck Lively II (foot) not cleared for camp" → 命中德里克·莱夫利二世 → 伤病 -0.72
- "Raptors agree to 2-year, $115M extension with Kawhi Leonard" → 命中科怀·伦纳德 → 合同利好 +0.45

### C.3 已知限制（留给 Phase B）

1. M0 规则分类器会把 "Extension talks stall"（谈判停滞）误判为合同利好 → Phase B 用 LLM 分类修正
2. 同一事件被 ESPN 与 Shams 过滤器重复入库（不同 dedupKey）→ Phase B 用 news_events 事件聚类归并
3. NBA 官网 RSS 404 → 需换用官网 JSON 端点
4. Tier 2（虎扑/直播吧/腾讯体育）采集器未实现
5. 前端仍读静态数据集 → Phase C 切换到 tRPC 数据源


---

## 附录 D：Phase B 交付记录（2026-09-24，版本 6d04057）

### D.1 已交付

**1. M1 语境感知规则分类器**（`api/collectors/classify.ts` 重写）
- 否定/转折窗口：关键词命中后检查前后 60 字符语境的否定词（stall / fail / deny / 未 / 停滞 / 破裂 / 拒绝），利好被否定时压制为利空
- 正负双向词典：合同类拆分 "agree/sign/max"（合同利好）与 "talks stall / holdout / trade request"（合同纠纷）
- 伤病类"复出/伤愈"语境自动翻转为弱利好（角色提升 +0.35）
- 严重度加权词：season-ending / torn ACL / supermax 等触发 3 档严重度
- **验证**：M0 误判案例 "Extension talks stall between Knicks, Karl-Anthony Towns" 已由 合同利好 +0.45 修正为 **合同纠纷 -0.5**

**2. 向量事件聚类**（`api/collectors/embed.ts` + `events.ts`）
- bge-m3 多语言向量（agent-gw embeddings 服务，中英标题通吃），余弦相似度 ≥0.80 判定为同一事件
- 向量服务不可用时自动降级为标题词集合 Jaccard（阈值 0.45）
- 判定窗口：同球员 ±4 天内的事件；归并时保留更权威信源与更强情绪
- **验证**：伦纳德续约新闻 ESPN 与 Shams 双源报道归并为同一事件（item_count=2）；64 条新闻 → 57 个事件，向量覆盖率 100%

**3. 事件级情绪聚合**（`recomputeSentiment` 重写）
- 同一事件的多源转载只计权重最高的一条，不再重复计权
- 无事件归属的新闻按 date+category+方向 分组兜底
- schema 变更：`news_items` 增加 severity / classifier / embedding 三列（增量迁移，无损）

**4. 运维入口**：`admin.reclassifyAll`（tRPC）——存量重分类 + 事件重建 + 全量情绪重算，一条命令完成

### D.2 LLM 分类的接入路径（预留）

平台内置凭证当前只开放向量端点，chat 端点无权限。LLM 分类器接口已预留为可插拔设计：配置 `KIMI_API_KEY` / `KIMI_BASE_URL` 环境变量（或任何 OpenAI 兼容端点）后，在 `ingest` 中将 `classifyArticle` 替换为批量 LLM 分类即可，规则分类器自动降级为置信度兜底。

### D.3 已知限制（留给 Phase C）

1. 前端仍读静态数据集 → Phase C 切换到 tRPC 真实数据源（接口已就绪：players.list/detail/board、news.recent、stats.leaders）
2. Tier 2（虎扑/直播吧/腾讯体育）采集器未实现
3. NBA 官网 RSS 404 待换端点
4. Dockerfile 部署时需处理数据库迁移（首启执行 migrate 或预置 schema）


---

## 附录 E：Phase C 交付记录（2026-09-24，版本 bbb49d5）—— 前端切换真实数据源

### E.1 已交付

- **数据访问层** `src/lib/api.ts`：tRPC hooks（usePlayers / usePlayerSearch / usePlayerDetail / useBoard / useRecentNews / useSourceHealth / useRunCollectors / useReclassify）+ DTO→前端类型适配器
- **类型解耦** `src/lib/types.ts`：页面与组件不再依赖静态数据集，旧的 `src/data/players.ts` 已删除（种子数据仍可通过 `npx tsx db/seed.ts` 重建）
- **五个页面全部切换实时数据**：
  - 首页：搜索、四张榜单、最新情报流均来自数据库（情报流标注"实时数据库"徽标）
  - 球员详情：历史走势 + 7 日窗口新闻 + GMSC 百分位（从全量 API 数据计算）
  - 排行榜：五榜实时
  - 数据总览：全联盟统计表实时
  - 管理后台：信源状态读 `source_health` 实时表（ESPN 正常 50 条/轮 · NBA 官网 404 异常可见 · Tier2 待接入），新增「立即采集」「重分类+重聚类」操作按钮
- 情绪引擎已在生产中自我造血：真实 ESPN 新闻持续入库 → M1 分类 → 事件聚类 → 净情绪值 → 榜单/指数随之更新（例：唐斯因"续约谈判停滞"净情绪 -35.4 登上利空预警第一）

### E.2 当前系统状态

| 层 | 状态 |
|---|---|
| 前端五页面 | ✅ 全实时数据 |
| tRPC API | ✅ players/news/stats/admin 四组路由 |
| MySQL | ✅ 169 球员 + 实时新闻持续入库 |
| 采集调度 | ✅ 每小时 Tier1 + 每日 08:00 情绪聚合（生产自启） |
| 分类器 | M1 语境规则（LLM 插拔位预留） |
| 事件聚类 | bge-m3 向量（Jaccard 降级兜底） |

### E.3 已知限制（留给 Phase D / 后续）

1. 价值指数本身的演化仍靠种子时的历史时序；M0 指数引擎（每日由净情绪驱动 index_history 增量）待 Phase D 完成闭环
2. Tier 2（虎扑/直播吧/腾讯体育）采集器未实现
3. NBA 官网 RSS 404 待换端点
4. 部署注意：首次启动需数据库 schema 已就位（db:generate 迁移已入库管理）


---

## 附录 F：v3.0 英文化 + surennba 风格重设计 + Phase D 交付记录（2026-09-24，版本 5489e40）

### F.1 UI 英文化与视觉重设计（仿 surennba.com）

- **全站英文**：导航（Home / Stats / Rankings / Pipeline）、五个页面、页脚、新闻卡片标签（Bullish/Bearish · 类目英译 · Top Tier/Major/Indie · Rumor · lean ±x.xx）全部英文化
- **视觉语言对齐 surennba**：米色底 `#f6f2e9`、砖红顶部导航 `#bf5546`、白卡片 + 浅石色描边；数据总览页四张数据王卡片采用彩色左边框（黄/橙/绿/紫）+ 大号粗体数字 + 球员头像；全联盟表格白底 + 逐格红绿着色（相对筛选池均值，±5% 以内中性灰色），分钟筛选改为红色滑块
- **DB 内容英文化**：`db/scripts/english-reports.ts` 按球员实时数据模板化重生成 169 名球员的 predictionReasons / reportSummary / reportFactors / reportVerdict 四个报告字段；source_health 信源名英文化（NBA.com / Hupu / Zhibo8 / Tencent Sports）
- 英文映射集中在 `src/lib/types.ts`：TEAM_EN（30 队）、CATEGORY_EN（10 类目）、POSITION_EN
- 修复：`db/seed.ts` 改为带类型检查的只读体检脚本（静态种子数据集已于 Phase C 删除，MySQL 为唯一数据源）

### F.2 Phase D：M0 指数引擎（`api/engine/m0.ts`）

日度流水线（每日 08:00，情绪聚合之后顺序执行）：

1. **runIndexDaily()**：指数日度演化
   - delta = clamp(7日净情绪 × 0.03, ±4)；**v2.1 规则保留：7 日窗口无新闻 → 当日指数不动**（仍落持平快照保证时序连续）
   - 幂等设计：基准取 index_history 中当日之前的最后一个值，同一天重跑不重复叠加
   - 新值 clamp 到 [0,100]，upsert 进 `index_history`（|delta| ≥ 0.5 时标注当日权重最高的事件标题）
   - change_7d / change_30d 从 history 窗口内参考点重算；**窗口内无参考点（引擎上线初期断档）时保留原值不归零**
   - 首跑验证：169 人中 7 名有新闻球员当日变动（唐斯 -35.4 净情绪 → PVI 76.1→75.0；伦纳德利好 → 75.5→77.7）
2. **snapshotPredictions()**：每日预测快照写入 `predictions`（predict_date + player 唯一键幂等）
   - M0 预测规则：predicted7d = 现值 + 情绪漂移（净情绪×0.15，±6）+ 动能延续（change7d×0.3，±2）+ 基本面锚定弱回归（2K 锚 = 30+OVR×0.65，拉力 ±1.5）
   - riseProbability = clamp(50 + 净情绪×0.6 + change7d×2, 5, 95)
   - 同步回写 players.predicted_index_7d / rise_probability（前端榜单即时可见）
3. **backfillPredictions()**：满 7 天的预测回填 actual_index_7d 并判定方向命中（预测涨跌方向 × 实际涨跌方向；|Δ|<0.5 视为持平）
4. **runAnchorCalibration()**：PVI 与 2K 评分的 Pearson 相关，季度落库 `anchor_calibrations`；每周日 09:00 自动运行
   - 首条记录：2026-Q3，r = 0.982（n=169）—— 指数与能力锚高度相关，情绪轨提供边际偏离

### F.3 新增 API（router.ts admin 组）

| 端点 | 类型 | 说明 |
|---|---|---|
| admin.runDailyEngine | mutation | 手动执行：情绪聚合 → 指数演化 → 预测快照 → 回填 |
| admin.snapshotPredictions / backfillPredictions | mutation | 单独触发对应步骤 |
| admin.predictionAccuracy | query | total / resolved / hits / accuracy（回填满 7 天后出数） |
| admin.anchorCalibrations | query | 最近 12 条校准记录 |
| admin.runAnchorCalibration | mutation | 手动校准 |
| admin.recentPredictions | query | 最近 20 条已回填预测（看板用） |

### F.4 调度与前端

- cron：Tier1 每小时（:05）；**每日 08:00 情绪聚合 + M0 引擎**；每周日 09:00 锚定校准
- Pipeline 页新增：「Run M0 Engine」按钮 + 结果横幅；模型看板「方向准确率」改为实时值（未回填时显示快照数与 66.7% 基线）；新增「Anchor Calibration」卡片（最新 r 值 + Calibrate Now）

### F.5 已知限制（后续阶段）

1. M0 为规则引擎：方向命中率需 7 天后才开始出数，60–90 天特征快照积累满后切换 XGBoost/LightGBM
2. Tier 2（Hupu / Zhibo8 / Tencent Sports）采集器未实现
3. NBA.com RSS 404 待换端点
4. 指数 7/30 天涨跌幅在引擎上线首周沿用历史断档前的参考值，第 8 天起完全由引擎时序驱动


---

## 附录 G：真实赛况数据接入（2026-09-24，版本 b4d9bbd）

### G.1 数据源

- **ESPN core API**：`sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/2026/types/2/statistics/0/byathlete`（单次 limit=600 拉全联盟 582 名球员赛季累计/场均数据，含 gamesPlayed、avgMinutes、avgPoints、投篮/三分/罚球出手命中、TS%、抢断盖帽失误犯规等全部所需字段）
- **球员映射表** `db/espn_athletes.json`：582 名运动员 id → {姓名, 球队缩写}，由 `db/scripts/build-espn-map.ts` 一次性构建（30 队 + 582 人，礼貌限速）；运动员 id 稳定，仅新人进联盟时需重建
- 此前数据错误根因：赛季统计与 2K 评分来自建库时手工生成的种子数据，系统只实时采集新闻情绪，从未接入赛况数据源

### G.2 同步管道（`api/collectors/stats.ts`）

1. 拉取全联盟赛季数据 → 折算场均（OREB/DREB 由总数 ÷ 场次）
2. 名称匹配：规范化（去重音/小写）精确匹配 → 手工别名表（Nic Claxton→Nicolas Claxton 等）→ 姓+名首字母兜底
3. 更新 15 项场均计数 + TS%（直接用 ESPN trueShootingPct）+ GMSC（本地按 Hollinger 公式计算）
4. **球队归属自动纠正**（ESPN 球队缩写 → 本地队名）：Kawhi→猛龙、Luka→湖人、Giannis→热火等与新闻时间线一致
5. GMSC 联盟百分位 → 「竞技表现」维度分（0-100）
6. 赛季报销/未出场球员（ESPN 无本赛季数据：Lillard、Haliburton、Kyrie、Butler、VanVleet）计数清零，与现实一致
7. 健康状态记录 source_health（key: espn-stats）

### G.3 调度与接口

- cron：每日 07:30 赛况同步（先于 08:00 情绪聚合 + M0 引擎，保证指数使用最新基本盘）
- API：`admin.syncSeasonStats` mutation 手动触发
- 首跑结果：164/169 更新，5 人赛季报销清零；验证 Luka 33.5 分（得分王）、Jokic 10.7 助 12.9 板（双料王）、Dyson Daniels 2.0 抢断王，均为真实 2025-26 数据

### G.4 已知限制

1. 2K 评分（overallRating）仍为种子值，无公开实时源，作为静态锚保留
2. ESPN athlete 映射表为静态文件，赛季中新秀/双向合同球员补充时需重跑 build-espn-map.ts

---

## 附录 H：身体基本盘 + 真实头像 + 中文信源（2026-09-24）

### H.1 身体基本盘（Physical Track）

**数据源**：ESPN core API 运动员详情端点 `/seasons/2026/athletes/{id}`（身高英寸、体重磅、头像 URL），`db/scripts/sync-physicals.ts` 批量同步（5 并发 + 120ms 间隔，低频只读）。169/169 全部落库，含伤缺球员手工 ID 覆盖（Kyrie 6442、Haliburton 4396993、Lillard 6606、VanVleet 2991230）与别名（Jimmy Butler III、Luguentz Dort、Herbert Jones）。

**新增字段**（players 表，migration 0002）：`height_in`、`weight_lbs`、`wingspan_in`、`vertical_in`、`strength_score`、`score_physical`、`espn_id`。

**估算模型**（ESPN 只有身高体重实测，臂展/弹跳/力量按位置常模推算）：

- 位置常模 POS_NORMS：ape index（臂展−身高）PG 4.0 / SG 4.5 / SF 5.0 / PF 5.5 / C 6.0 英寸；垂直弹跳常模 PG 33 / SG 34 / SF 33 / PF 31 / C 28 英寸
- 臂展 = 身高 + apeIndex + (身高−78)×0.08（身高放大效应）
- 弹跳 = 位置常模，随身高/体重衰减
- 力量 = BMI 基线 + 位置加成
- **scorePhysical** = 臂展 35% + 身高 20% + 弹跳 25% + 力量 20%（0-100，位置调整后归一）
-  sanity：Zach Edey 最高（71，7'3" 305lb），Ja Morant / Trae Young 最低（31）

**进入价值模型**：M0 预测锚从纯 2K 映射改为 **anchor = 25 + OVR×0.55 + scorePhysical×0.20**——身体基本盘是价值的硬约束，占锚定值 20% 权重；169 人预测快照已按新锚重算。

**前端**：雷达图扩为七维（新增 Physical）；球员页新增 Physical Profile 区块（身高/臂展/体重/弹跳/力量 + 基本盘得分条）。

### H.2 真实头像

- 头像 URL：`https://a.espncdn.com/i/headshots/nba/players/full/{espnId}.png`（CDN 公开直链，已验证 200）
- Avatar 组件改为「底色字母 + 头像覆盖层」：图片懒加载，`onError` 自动回退到字母头像，无 espnId 时保持原样式

### H.3 中文信源（Tier 2，权重 0.6）

**信源**（每日 07:20 / 19:20 两次，低频只读，不绕反爬）：

- **直播吧**：`news.zhibo8.com/nba/more.htm` 静态列表页正则解析（≤60 条，含时间与来源）
- **虎扑**：`voice.hupu.com/nba` 内嵌 `__NEXT_DATA__` JSON（50 条，相对时间「N小时前」换算）
- 腾讯体育：全部端点（matchweb / hotList / scrollNews / CDN JSON）均返回空数据，放弃

**中文球员名匹配**（`api/collectors/match.ts`）：

- 别名生成：中文全名去「·」+ 「·」后段（约基奇/东契奇）+ 长后段尾切（维克托文班亚马→文班亚马）；尾切要求尾段 ≥3 字且原后段 ≥5 字，避免「阿夫迪亚→迪亚」泛化误伤
- 匹配：英文别名用 `\b` 词边界正则；**中文别名 `\b` 对 CJK 无效，必须子串匹配**（本次 0 命中的根因）

**分类器中文词表扩充**（`api/collectors/classify.ts`）：

- 荣誉认可：百大排名提升/窜至/首次进、DPOY、历史唯N
- 状态下滑：跌至、不升反降、百大下滑、体重超标
- 合同纠纷：体重条款、不满报价、续约/谈判僵局
- 否定词修复：`未(?!来)` 防止「未来」误触发否定（伦纳德续约曾被误判利空）

**首跑结果**：110 条采集（直播吧 60 + 虎扑 50）→ 21 条入库（其余为无球员实体 49、无法分类噪音 38、去重）；样本质检：东契奇百大下滑→状态下滑 -0.4、杜伦体重条款→合同纠纷 -0.44、布伦森百大第 6→荣誉认可 +0.53，归因与倾向均正确。

### H.4 调度总表（当前）

| 任务 | cron | 说明 |
|---|---|---|
| Tier 1 英文信源 | 每小时 :05 | ESPN / NBA.com / Shams |
| Tier 2 中文信源 | 20 7,19 * * * | 直播吧 + 虎扑 |
| 赛季数据同步 | 30 7 * * * | ESPN 赛况 → GMSC/TS% |
| 情绪聚合 + M0 引擎 | 0 8 * * * | 指数演化 + 预测快照 |
| 锚定校准 | 0 9 * * 0 | PVI vs 2K 周度 Pearson |

---

## 附录 I：跨源新闻去重 + 榜单展开（2026-09-24）

### I.1 问题

同一事件被多源（含中英文）报道时重复计权，球员情绪被过度放大/压低。例如杜伦体重条款被直播吧两条相似标题分别计入、ESPN/Shams 同通稿双收。

### I.2 三层去重

1. **入库精确去重**：dedupKey 不再含信源前缀（`title|url` 哈希），同一通稿多源转载只收一次（首跑清理 6 条 ESPN/Shams 重复）
2. **事件聚类去重**（events.ts 阈值实测标定）：
   - 只嵌入标题（摘要含来源模板噪音，会稀释相似度 0.72→0.57）
   - 同语种向量阈值 0.72（实测：同事件 0.72-0.74，同球员不同事件最高 0.70）
   - **跨语种（一中一英）**：向量相似度系统性偏低（同一事件仅 0.54-0.72），中间区间 [0.52, 0.72) 需叠加「分类一致 + 实体重叠（数字/英文名）」才归并；≥0.72 直通
   - 降级路径（无向量服务）：同语种 Jaccard ≥0.45；跨语种用实体重叠 ≥0.5
3. **情绪聚合事件级计权**（既有逻辑，本次修复后真正生效）：同一事件多源转载只计权重最高一条

### I.3 前端

- 首页 Top Gainers / Hottest Buzz / Bearish Alerts 三张榜单卡：头部与底部均有「All N / Collapse」展开按钮，默认显示前 5，展开显示全部 25 名
- Stats 页移除 surennba.com 引用，改为 Hollinger method 说明

---

## 附录 J：持续更新保障 + 国际信源扩充（2026-10-16）

### J.1 国际权威信源实测结论

逐一探测后，可持续抓取的国外权威源：

| 信源 | 端点 | 状态 |
|---|---|---|
| ESPN | RSS + site.api JSON（双通道） | ✅ 50 条/次 |
| CBS Sports | RSS `cbssports.com/rss/headlines/nba/` | ✅ 36 条/次（替代已下线的 NBA.com RSS） |
| Shams Charania | 专栏 RSS | ✅ 低频但权威性最高 |
| The Athletic / Yahoo / Bleacher Report / SI / NBC / FOX NBA | 各 RSS/API | ❌ 403 / 404 / 付费墙 / 重定向失效，已弃用 |

Tier 1 现为 ESPN + CBS Sports + Shams 三家权威英文源（source_health 中 nba key 已更名 CBS Sports）。

### J.2 启动补跑机制（catchUpOnBoot）

问题：预览/部署环境重启后，错过的 cron 窗口不会自动补，导致新闻断更。

修复：服务启动 15 秒后自动检查并补跑——
- Tier1 任一源超 1 小时未跑 → 立即补采
- Tier2 任一源超 12 小时未跑 → 立即补采
- 赛季数据超 24 小时未同步 → 立即补同步
- sentiment_daily 最新日期早于今天 → 立即重算情绪 + 跑 M0 引擎

配合原有时刻表（Tier1 每小时 / Tier2 07:20+19:20 / 数据 07:30 / 情绪+指数 08:00 / 校准每周日 09:00），保证任何重启场景下每天必更新。
