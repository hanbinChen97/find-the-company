0) Core idea
	•	两种 Input：Text list（用逗号/换行分隔） 或 Excel upload。
	•	统一进入 Preview (input preview) → Run → Preview (result preview) → Download。

⸻

1) Page Layout（单页、双栏自适应）
	•	Header：产品名 + 简述
	•	Card: Input Mode（Tabs）
		•	Tab A: Text List
		•	Textarea（placeholder: 每行一个公司名 或 用逗号分隔）
		•	Parse Button（将文本解析为 rows）
		•	Info Bar（统计：rows、去重数、无效数）
		•	Tab B: Excel Upload
		•	Upload Zone（拖拽/点击）
		•	File meta（文件名、行列数、sheet 选择器【可选】）
	•	Card: Input Preview（表格样式，显示前 50 行）
	•	Columns：row_index, company_name, valid（badge），note
	•	Actions：Clear, Edit inline（可选）
	•	Run Section
	•	Run Button（primary）
	•	Progress Bar + Status text（idle / validating / running / done / failed）
	•	Card: Result Preview
	•	Result Grid（分页/虚拟滚动）
	•	Columns（最小集）：company_name, domain, address, industry, contacts, ceo, status
	•	Filter：show errors only
	•	Download Button（XLSX/CSV）

⸻

2) Component Tree（前端）
	•	AppLayout
	•	InputTabs
	•	TextListPanel
	•	CompanyTextarea
	•	ParseButton / InfoBar
	•	ExcelUploadPanel
	•	UploadZone / FileMeta / SheetSelector（可选）
	•	InputPreviewGrid
	•	RunControls（Run / Progress / Status）
	•	ResultPreviewGrid
	•	DownloadButton
	•	Toasts（error/success）

UI 库建议：shadcn/ui（Tabs、Card、Button、Progress、Badge、Toast） + 表格用 TanStack Table 或 AG Grid。Excel 解析预览用 SheetJS。


⸻

3) wealth_manager.ipynb 概要（数据抓取与联系方式提取）

- 目标：从 SWFI（Europe Wealth Manager 列表）抓取公司基础信息，补充官网/联系方式等字段，形成结构化的 companies_list（list[dict]）。
- 列表页抓取：访问 `https://dev.swfinstitute.org/profiles/wealth-manager/europe`，用 BeautifulSoup 定位 `div.list-group.list-group-wrap`，解析其中的 `<a>`（仅保留包含 `/profile/` 的链接）。
- 公司列表解析：`parse_company_urls(container)` 返回 `[{'company_name', 'url'}...]`；公司名优先取 `<strong.list-group-item-title>`，否则回退为 `<a>` 文本。


- 详情页属性补充：`fetch_profile_attributes(url)` 请求 profile 页面，解析表格（Phone、Country、City 等键值对），将返回字典合并到对应公司对象上。


- 预览：构造 preview（前 5 条）查看 `company_name / url / Phone / Country / City / contact_page` 等。
- 联系页面定位（两阶段）：
  - 规则猜测：`guess_contact_from_website(website)` 基于官网域名尝试常见路径（`/contact`、`/contact-us`、`/contacts`、`/kontakt`、`/impressum` 等），优先 `HEAD`，必要时回退 `GET`；返回首个可用 URL。
  - 搜索 + LLM：`select_contact_page(company)` 通过 `google_search_formattedUrl` 获取候选列表，交给 `llm.chat_once` 让模型按规则只选出 1 个最可能的官方联系页。
- 联系方式抽取：`extract_company_contact_info(company)` 请求 `contact_page`，用 BeautifulSoup 解析 HTML，再调用 `llm.extract_contact_info(soup)` 提取邮箱、电话，写回 `company['contact_email']` 与 `company['contact_phone']`。
- 运行控制：遍历 `companies_list`，对已有字段会跳过；为避免触发风控，HTTP 请求统一带浏览器 UA，并在批量处理中 `time.sleep(1)` 做友好限速。
- 依赖与模块：`requests`、`bs4`、`urllib.parse`；外部自定义模块 `google_search_api.google_search_formattedUrl`、`llm.chat_once`、`llm.extract_contact_info`（需在本地实现或引入）。
- 输出形态：数据保存在内存变量 `companies_list` 中（未见落盘逻辑）；Notebook 会打印解析数量、进度与若干预览行。
