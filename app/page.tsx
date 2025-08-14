"use client";

import { useMemo, useRef, useState } from "react";

type InputRow = {
  id: number;
  company_name: string;
  valid: boolean;
  note?: string;
};

type Status = "idle" | "validating" | "running" | "done" | "failed";

type ResultRow = {
  company_name: string;
  domain: string;
  address?: string;
  industry?: string;
  contacts?: string;
  ceo?: string;
  status: "ok" | "error";
  error?: string;
};

function parseTextToRows(text: string): InputRow[] {
  const tokens = text
    .split(/\n|,/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const seen = new Set<string>();
  const rows: InputRow[] = [];
  let i = 1;
  for (const name of tokens) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ id: i++, company_name: name, valid: true });
  }
  return rows;
}

function guessDomain(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join("");
  return slug ? `${slug}.com` : "";
}

function downloadCSV(filename: string, rows: ResultRow[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]) as (keyof ResultRow)[];
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"text" | "excel">("text");
  const [textValue, setTextValue] = useState("");
  const [inputRows, setInputRows] = useState<InputRow[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);
  const [mockMode, setMockMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stats = useMemo(() => {
    const total = inputRows.length;
    const dedup = inputRows.length; // already deduped
    const invalid = inputRows.filter((r) => !r.valid).length;
    return { total, dedup, invalid };
  }, [inputRows]);

  function onParse() {
    const rows = parseTextToRows(textValue);
    setInputRows(rows.slice(0, 10000));
  }

  function clearInput() {
    setTextValue("");
    setInputRows([]);
  }

  async function onRun() {
    if (!inputRows.length) return;
    setProgress(0);
    setResults([]);

    // Mock mode: simulate progressive results
    if (mockMode) {
      setStatus("running");
      const rows = inputRows;
      const total = rows.length;
      let completed = 0;
      const out: ResultRow[] = Array.from({ length: total });
      const cities = [
        "Geneva, Switzerland",
        "Zurich, Switzerland",
        "London, United Kingdom",
        "Paris, France",
        "New York, USA",
      ];

      function makeMock(r: InputRow): ResultRow {
        const err = /fail|error|unknown/i.test(r.company_name) && Math.random() < 0.6;
        if (err) {
          return {
            company_name: r.company_name,
            domain: guessDomain(r.company_name),
            address: "",
            industry: "",
            contacts: "",
            ceo: "",
            status: "error",
            error: "Mock: not found or blocked",
          };
        }
        const dom = guessDomain(r.company_name);
        const email = `info@${dom}`;
        const phone = "+41 22 555 1234";
        const contact = [email, phone, `https://www.${dom.replace(/^www\./, "")}/contact`].join(" | ");
        return {
          company_name: r.company_name,
          domain: `www.${dom}`,
          address: cities[Math.floor(Math.random() * cities.length)],
          industry: "Wealth Management",
          contacts: contact,
          ceo: "John Doe",
          status: "ok",
        };
      }

      inputRows.forEach((row, idx) => {
        setTimeout(() => {
          out[idx] = makeMock(row);
          completed += 1;
          setProgress(Math.round((completed / total) * 100));
          setResults([...out.filter(Boolean)] as ResultRow[]);
          if (completed === total) setStatus("done");
        }, 300 + idx * 350);
      });
      return;
    }

    // Real mode: validate and batch call API
    setStatus("validating");
    const validRows = inputRows.filter((r) => r.valid && r.company_name.trim().length > 0);
    if (!validRows.length) {
      setStatus("failed");
      return;
    }
    setStatus("running");

    const total = validRows.length;
    let completed = 0;
    const out: ResultRow[] = Array.from({ length: total });

    async function worker(row: InputRow, index: number) {
      try {
        const res = await fetch("/api/company", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company: row.company_name }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string })?.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        const website: string = data.website || "";
        const address: string = data.headquarters || (Array.isArray(data.addresses) ? data.addresses[0] : "") || "";
        const emails: string[] = data.contacts?.emails || [];
        const phones: string[] = data.contacts?.phones || [];
        const contactPage: string = data.contacts?.contact_page || data.contact_page || "";
        const ceo: string = data.executives?.ceo || "";
        const contacts = [emails[0], phones[0], contactPage].filter(Boolean).join(" | ");

        out[index] = {
          company_name: data.company || row.company_name,
          domain: website.replace(/^https?:\/\//, ""),
          address,
          industry: "",
          contacts,
          ceo,
          status: "ok",
        };
      } catch (e: unknown) {
        const error = e as Error;
        out[index] = {
          company_name: row.company_name,
          domain: guessDomain(row.company_name),
          address: "",
          industry: "",
          contacts: "",
          ceo: "",
          status: "error",
          error: error?.message || "fetch failed",
        };
      } finally {
        completed += 1;
        setProgress(Math.round((completed / total) * 100));
        setResults([...out.filter(Boolean)] as ResultRow[]);
      }
    }

    const limit = Math.min(4, navigator.hardwareConcurrency || 2);
    const queue = validRows.map((r, i) => () => worker(r, i));
    const runners: Promise<void>[] = [];
    for (let i = 0; i < Math.min(limit, queue.length); i++) {
      runners.push(
        (async function run() {
          while (queue.length) {
            const job = queue.shift();
            if (!job) break;
            await job();
          }
        })()
      );
    }
    await Promise.all(runners);
    setStatus("done");
  }

  function onDownloadCSV() {
    if (!results.length) return;
    downloadCSV("companies.csv", results);
  }

  function onUploadFile(file: File) {
    // Simple CSV support without external deps. Excel (xlsx) requires SheetJS.
    if (!file) return;
    const name = file.name.toLowerCase();
    if (name.endsWith(".csv") || name.endsWith(".txt")) {
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result || "");
        const lines = text.split(/\r?\n/).map((l) => l.trim());
        const values: string[] = [];
        for (const line of lines) {
          if (!line) continue;
          // naive split by comma; collapse to first cell
          const first = line.split(",")[0]?.trim();
          if (first) values.push(first);
        }
        const rows = parseTextToRows(values.join("\n"));
        setInputRows(rows);
        setActiveTab("excel");
      };
      reader.readAsText(file);
    } else {
      // Fallback: accept file but only show metadata
      alert("Only CSV/TXT preview is supported in this build.");
      setActiveTab("excel");
    }
  }

  const filteredResults = useMemo(() => {
    return showErrorsOnly ? results.filter((r) => r.status === "error") : results;
  }, [results, showErrorsOnly]);

  return (
    <div className="min-h-screen p-6 sm:p-10">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Find the Company</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          输入公司列表（文本或表格），预览后运行并下载结果。
        </p>
      </header>

      {/* Two-column adaptive layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left column */}
        <div className="space-y-6">
          {/* Input Mode (Tabs) */}
          <div className="border border-gray-200 dark:border-gray-800 rounded-xl">
            <div className="flex border-b border-gray-200 dark:border-gray-800 p-2 gap-2">
              <button
                className={`px-3 py-1.5 rounded-md text-sm ${
                  activeTab === "text"
                    ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-black"
                    : "hover:bg-gray-100 dark:hover:bg-gray-900"
                }`}
                onClick={() => setActiveTab("text")}
              >
                Text List
              </button>
              <button
                className={`px-3 py-1.5 rounded-md text-sm ${
                  activeTab === "excel"
                    ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-black"
                    : "hover:bg-gray-100 dark:hover:bg-gray-900"
                }`}
                onClick={() => setActiveTab("excel")}
              >
                CSV/Excel Upload
              </button>
            </div>

            {activeTab === "text" ? (
              <div className="p-4 space-y-3">
                <textarea
                  className="w-full h-40 rounded-md border border-gray-200 dark:border-gray-800 bg-transparent p-3 text-sm"
                  placeholder="每行一个公司名 或 用逗号分隔"
                  value={textValue}
                  onChange={(e) => setTextValue(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={onParse}
                    className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Parse
                  </button>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    rows: {stats.total} · 去重数: {stats.dedup} · 无效数: {stats.invalid}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                <div
                  className="border border-dashed border-gray-300 dark:border-gray-700 rounded-md p-6 text-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (file) onUploadFile(file);
                  }}
                >
                  <p className="text-sm">拖拽 CSV/TXT 到此处 或 点击上传</p>
                  <p className="text-xs text-gray-500 mt-1">XLSX 预览需外部库，当前仅支持 CSV/TXT</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt,.xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onUploadFile(f);
                    }}
                  />
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  rows: {stats.total} · 去重数: {stats.dedup} · 无效数: {stats.invalid}
                </div>
              </div>
            )}
          </div>

          {/* Input Preview Grid */}
          <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-800 text-sm font-medium">
              Input Preview（前 50 行）
            </div>
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 w-16">#</th>
                    <th className="text-left px-3 py-2">company_name</th>
                    <th className="text-left px-3 py-2 w-24">valid</th>
                    <th className="text-left px-3 py-2">note</th>
                  </tr>
                </thead>
                <tbody>
                  {inputRows.slice(0, 50).map((r, idx) => (
                    <tr key={r.id} className="border-t border-gray-100 dark:border-gray-900">
                      <td className="px-3 py-2 text-gray-600">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <input
                          className="w-full bg-transparent border border-gray-200 dark:border-gray-800 rounded px-2 py-1"
                          value={r.company_name}
                          onChange={(e) => {
                            const v = e.target.value;
                            setInputRows((rows) =>
                              rows.map((x) =>
                                x.id === r.id ? { ...x, company_name: v, valid: v.trim().length > 0 } : x
                              )
                            );
                          }}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            r.valid
                              ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                              : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                          }`}
                        >
                          {r.valid ? "valid" : "invalid"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="w-full bg-transparent border border-gray-200 dark:border-gray-800 rounded px-2 py-1"
                          value={r.note ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setInputRows((rows) => rows.map((x) => (x.id === r.id ? { ...x, note: v } : x)));
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                  {inputRows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-gray-500">
                        无输入数据，先在上方粘贴文本或上传 CSV
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-800 flex items-center gap-2">
              <button
                onClick={clearInput}
                className="px-3 py-1.5 text-sm rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Run Controls */}
          <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Run</div>
              <div className="flex items-center gap-3">
                <label className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                  <input type="checkbox" checked={mockMode} onChange={(e) => setMockMode(e.target.checked)} />
                  Mock mode
                </label>
                <div className="text-xs text-gray-600 dark:text-gray-400">{status}</div>
              </div>
            </div>
            <div className="h-2 rounded bg-gray-100 dark:bg-gray-900 overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <button
              onClick={onRun}
              disabled={!inputRows.length || status === "running"}
              className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Run
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const names = [
                    "1875 Finance",
                    "BlackRock",
                    "Pictet Group",
                    "Partners Group",
                    "UBS Wealth Management",
                    "Credit Suisse",
                    "Amundi",
                    "Schroders",
                  ];
                  const rows: InputRow[] = names.map((n, i) => ({ id: i + 1, company_name: n, valid: true }));
                  setInputRows(rows);
                  setActiveTab("text");
                }}
                className="px-3 py-1.5 text-sm rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900"
              >
                Load mock companies
              </button>
              <span className="text-xs text-gray-500">快速填充示例公司并演示运行效果</span>
            </div>
          </div>

          {/* Result Preview */}
          <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <div className="text-sm font-medium">Result Preview</div>
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={showErrorsOnly}
                  onChange={(e) => setShowErrorsOnly(e.target.checked)}
                />
                show errors only
              </label>
            </div>
            <div className="max-h-[480px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2">company_name</th>
                    <th className="text-left px-3 py-2">domain</th>
                    <th className="text-left px-3 py-2">address</th>
                    <th className="text-left px-3 py-2">industry</th>
                    <th className="text-left px-3 py-2">contacts</th>
                    <th className="text-left px-3 py-2">ceo</th>
                    <th className="text-left px-3 py-2">status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.map((r, i) => (
                    <tr key={`${r.company_name}-${i}`} className="border-t border-gray-100 dark:border-gray-900">
                      <td className="px-3 py-2">{r.company_name}</td>
                      <td className="px-3 py-2">{r.domain}</td>
                      <td className="px-3 py-2">{r.address}</td>
                      <td className="px-3 py-2">{r.industry}</td>
                      <td className="px-3 py-2">{r.contacts}</td>
                      <td className="px-3 py-2">{r.ceo}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            r.status === "ok"
                              ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                              : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                          }`}
                        >
                          {r.status}
                        </span>
                        {r.error && (
                          <span className="ml-2 text-xs text-gray-500">{r.error}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {results.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                        还没有结果。点击 Run 开始。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-800 flex items-center gap-2">
              <button
                onClick={onDownloadCSV}
                disabled={!results.length}
                className="px-3 py-1.5 text-sm rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-50"
              >
                Download CSV
              </button>
              <button
                onClick={() => alert("XLSX 导出需要引入 SheetJS 等库，当前未启用。")}
                disabled={!results.length}
                className="px-3 py-1.5 text-sm rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-50"
              >
                Download XLSX
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
