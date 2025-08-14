"use client";

import { useMemo, useRef, useState } from "react";

type InputRow = {
  id: number;
  company_name: string;
  valid: boolean;
  note?: string;
};

type Status = "idle" | "validating" | "running" | "done" | "failed";

const getStatusText = (status: Status): string => {
  switch (status) {
    case "idle": return "bereit";
    case "validating": return "validierung";
    case "running": return "läuft";
    case "done": return "fertig";
    case "failed": return "fehler";
    default: return status;
  }
};

type CompanyListItem = {
  company_name: string;
};

type ResultRow = {
  company_name: string;
  homepage?: string;
  contact_page?: string;
  phone?: string;
  country?: string;
  city?: string;
  ceo?: string;
  cofounders?: string[];
  status: "ok" | "error";
  error?: string;
  raw_text?: string; // Store the raw AI response
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
  const [activeTab, setActiveTab] = useState<"text" | "excel" | "wealth">("wealth");
  const [textValue, setTextValue] = useState("");
  const [inputRows, setInputRows] = useState<InputRow[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);
  const [mockMode, setMockMode] = useState(false);
  const [isLoadingWealthManagers, setIsLoadingWealthManagers] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [companyLimit, setCompanyLimit] = useState(10);
  const [currentlyProcessing, setCurrentlyProcessing] = useState<string>("");
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

  async function loadWealthManagers() {
    setIsLoadingWealthManagers(true);
    setStatus("running");
    setProgress(0);
    setResults([]);
    
    try {
      console.log(`Loading ${companyLimit} wealth managers from target URL...`);
      
      // First, get the company list without details
      const listResponse = await fetch('/api/scrape-wealth-managers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fetchDetails: false, limit: companyLimit })
      });
      
      if (!listResponse.ok) {
        throw new Error(`HTTP ${listResponse.status}`);
      }
      
      const listData = await listResponse.json();
      console.log('Loaded company list:', listData);
      
      if (!listData.companies || !Array.isArray(listData.companies)) {
        throw new Error('No companies found');
      }
      
      const companies = listData.companies;
      
      // Convert to InputRow format
      const rows: InputRow[] = companies.map((company: CompanyListItem, index: number) => ({
        id: index + 1,
        company_name: company.company_name,
        valid: true
      }));
      
      setInputRows(rows);
      
      // Initialize results array with basic company info
      const initialResults: ResultRow[] = companies.map((company: CompanyListItem) => ({
        company_name: company.company_name,
        status: "ok" as const
      }));
      
      setResults(initialResults);
      
      // Now fetch details for each company one by one
      const enhancedResults = [...initialResults];
      
      for (let i = 0; i < companies.length; i++) {
        const company = companies[i];
        console.log(`Fetching details for: ${company.company_name}`);
        
        try {
          // Update status to show which company is being processed
          setStatus("running");
          setCurrentlyProcessing(company.company_name);
          
          const detailResponse = await fetch('/api/scrape-wealth-managers/details', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: company.url })
          });
          
          if (detailResponse.ok) {
            const detailData = await detailResponse.json();
            
            // Update the specific company's data
            enhancedResults[i] = {
              ...enhancedResults[i],
              phone: detailData.phone,
              country: detailData.country,
              city: detailData.city
            };
            
            // Update UI immediately
            setResults([...enhancedResults]);
            setProgress(Math.round(((i + 1) / companies.length) * 100));
          }
        } catch (error) {
          console.error(`Error fetching details for ${company.company_name}:`, error);
          // Mark this company as having an error but continue
          enhancedResults[i] = {
            ...enhancedResults[i],
            status: "error" as const,
            error: "Failed to fetch details"
          };
          setResults([...enhancedResults]);
        }
        
        // Add delay between requests to be respectful
        if (i < companies.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      setStatus("done");
      setProgress(100);
      setCurrentlyProcessing("");
      console.log('Completed loading all wealth managers');
      
    } catch (error) {
      console.error('Error loading wealth managers:', error);
      alert(`Failed to load wealth managers: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setStatus("failed");
      setCurrentlyProcessing("");
    } finally {
      setIsLoadingWealthManagers(false);
    }
  }

  async function enhanceWithExecutives() {
    if (!results.length) return;
    
    setIsEnhancing(true);
    try {
      const enhancedResults = [...results];
      
      for (let i = 0; i < enhancedResults.length; i++) {
        const company = enhancedResults[i];
        if (company.status !== "ok") continue;
        
        console.log(`Enhancing ${company.company_name} with executive info...`);
        
        try {
          const response = await fetch('/api/company', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              company: company.company_name,
              country: company.country,
              city: company.city,
              enhance: true // Signal for executive lookup
            })
          });
          
          if (response.ok) {
            const data = await response.json();
            
            // Use structured data if available, otherwise fallback to text parsing
            if (data.structured) {
              // Direct assignment from structured response
              if (data.ceo) {
                enhancedResults[i].ceo = data.ceo;
              }
              if (data.cofounders && data.cofounders.length > 0) {
                enhancedResults[i].cofounders = data.cofounders;
              }
            } else if (data.raw_text) {
              // Fallback to text parsing for backwards compatibility
              const rawText = data.raw_text.toLowerCase();
              
              // Simple extraction - look for CEO mentions
              const ceoMatch = rawText.match(/ceo[:\s]+([^.\n]+)/i);
              if (ceoMatch) {
                enhancedResults[i].ceo = ceoMatch[1].trim();
              }
              
              // Look for founder/cofounder mentions
              const founderMatches = rawText.match(/(co-?founder|founder)[:\s]+([^.\n]+)/gi);
              if (founderMatches) {
                enhancedResults[i].cofounders = founderMatches.map((match: string) => 
                  match.replace(/(co-?founder|founder)[:\s]+/i, '').trim()
                );
              }
              
              // Update raw_text with executive info
              enhancedResults[i].raw_text = `${company.raw_text || ''}\n\n--- EXECUTIVE INFO ---\n${data.raw_text}`;
            }
          }
        } catch (error) {
          console.error(`Error enhancing ${company.company_name}:`, error);
        }
        
        // Update progress
        setResults([...enhancedResults]);
        
        // Add delay between requests
        if (i < enhancedResults.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      console.log('Enhancement complete');
    } catch (error) {
      console.error('Enhancement error:', error);
      alert(`Enhancement failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsEnhancing(false);
    }
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
            homepage: "",
            contact_page: "",
            status: "error",
            error: "Demo: nicht gefunden oder blockiert",
          };
        }
        const dom = guessDomain(r.company_name);
        return {
          company_name: r.company_name,
          homepage: `https://www.${dom}`,
          contact_page: `https://www.${dom}/contact`,
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
        console.log(`🔍 Fetching data for: ${row.company_name}`);
        const res = await fetch("/api/company", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company: row.company_name }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error(`❌ API Error for ${row.company_name}:`, err);
          throw new Error((err as { error?: string })?.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        console.log(`✅ Received data for ${row.company_name}:`, data);
        
        // Also log if there's raw_text field
        if (data.raw_text) {
          console.log(`📝 Raw AI response for ${row.company_name}:`, data.raw_text);
        }
        const homepage: string = data.homepage || "";
        const contactPage: string = data.contacts?.contact_page || "";

        out[index] = {
          company_name: data.company || row.company_name,
          homepage: homepage,
          contact_page: contactPage,
          status: "ok",
          raw_text: data.raw_text || "",
        };
      } catch (e: unknown) {
        const error = e as Error;
        out[index] = {
          company_name: row.company_name,
          homepage: "",
          contact_page: "",
          status: "error",
          error: error?.message || "Abruf fehlgeschlagen",
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
    console.log(`🎉 Completed processing ${total} companies`);
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
      alert("Nur CSV/TXT-Vorschau wird in dieser Version unterstützt.");
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
        <h1 className="text-2xl font-semibold">Unternehmen Finden</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Geben Sie eine Unternehmensliste ein (Text oder Tabelle), führen Sie sie aus und laden Sie die Ergebnisse herunter.
        </p>
      </header>

      {/* Single column full-width layout */}
      <div className="max-w-full">
        <div className="space-y-6">
          {/* Combined Input and Run Section */}
          <div className="border border-gray-200 dark:border-gray-800 rounded-xl">
            {/* Input Mode (Tabs) */}
            <div className="flex border-b border-gray-200 dark:border-gray-800 p-2 gap-2">
              <button
                className={`px-3 py-1.5 rounded-md text-sm ${
                  activeTab === "wealth"
                    ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-black"
                    : "hover:bg-gray-100 dark:hover:bg-gray-900"
                }`}
                onClick={() => setActiveTab("wealth")}
              >
                Wealth Managers (Europe)
              </button>
              <button
                className={`px-3 py-1.5 rounded-md text-sm ${
                  activeTab === "text"
                    ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-black"
                    : "hover:bg-gray-100 dark:hover:bg-gray-900"
                }`}
                onClick={() => setActiveTab("text")}
              >
                Textliste
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

            {/* Input Content */}
            {activeTab === "wealth" ? (
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600 dark:text-gray-400">Anzahl der Unternehmen:</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={companyLimit}
                    onChange={(e) => setCompanyLimit(parseInt(e.target.value) || 10)}
                    className="w-16 px-2 py-1 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-transparent"
                    placeholder="10"
                  />
                  <button
                    onClick={loadWealthManagers}
                    disabled={isLoadingWealthManagers}
                    className="px-3 py-1.5 text-sm rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
                  >
                    {isLoadingWealthManagers ? 'Loading...' : 'Load Wealth Managers'}
                  </button>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  Lädt automatisch Vermögensverwalter aus Europa mit Details wie Telefon, Land und Stadt.
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  Zeilen: {stats.total} · Dedupliziert: {stats.dedup} · Ungültig: {stats.invalid}
                </div>
              </div>
            ) : activeTab === "text" ? (
              <div className="p-4 space-y-3">
                <textarea
                  className="w-full h-40 rounded-md border border-gray-200 dark:border-gray-800 bg-transparent p-3 text-sm"
                  placeholder="Ein Unternehmen pro Zeile oder durch Kommas getrennt"
                  value={textValue}
                  onChange={(e) => setTextValue(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={onParse}
                    className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Analysieren
                  </button>
                  <button
                    onClick={onRun}
                    disabled={!inputRows.length || status === "running"}
                    className="px-3 py-1.5 text-sm rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    Ausführen
                  </button>
                  <button
                    onClick={clearInput}
                    className="px-3 py-1.5 text-sm rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900"
                  >
                    Löschen
                  </button>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    Zeilen: {stats.total} · Dedupliziert: {stats.dedup} · Ungültig: {stats.invalid}
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
                  <p className="text-sm">CSV/TXT hierher ziehen oder zum Hochladen klicken</p>
                  <p className="text-xs text-gray-500 mt-1">XLSX-Vorschau erfordert externe Bibliotheken, derzeit nur CSV/TXT unterstützt</p>
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
                <div className="flex items-center gap-2">
                  <button
                    onClick={onRun}
                    disabled={!inputRows.length || status === "running"}
                    className="px-3 py-1.5 text-sm rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    Ausführen
                  </button>
                  <button
                    onClick={clearInput}
                    className="px-3 py-1.5 text-sm rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900"
                  >
                    Löschen
                  </button>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    Zeilen: {stats.total} · Dedupliziert: {stats.dedup} · Ungültig: {stats.invalid}
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Input Preview */}
          {inputRows.length > 0 && (
            <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-800 text-sm font-medium">
                Eingabe Vorschau ({inputRows.length} Unternehmen)
              </div>
              <div className="max-h-60 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 w-16">#</th>
                      <th className="text-left px-3 py-2">Firmenname</th>
                      <th className="text-left px-3 py-2 w-20">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inputRows.slice(0, 50).map((row, idx) => (
                      <tr key={row.id} className="border-t border-gray-100 dark:border-gray-900">
                        <td className="px-3 py-2 text-gray-600">{idx + 1}</td>
                        <td className="px-3 py-2">{row.company_name}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              row.valid
                                ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                                : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                            }`}
                          >
                            {row.valid ? "bereit" : "ungültig"}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {inputRows.length > 50 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-2 text-center text-gray-500 text-xs">
                          ... und {inputRows.length - 50} weitere
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Result Preview */}
          <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <div className="text-sm font-medium">Ergebnisvorschau</div>
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={showErrorsOnly}
                  onChange={(e) => setShowErrorsOnly(e.target.checked)}
                />
                nur Fehler anzeigen
              </label>
            </div>
            <div className="max-h-[500px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2">Firmenname</th>
                    <th className="text-left px-3 py-2">Phone</th>
                    <th className="text-left px-3 py-2">Country</th>
                    <th className="text-left px-3 py-2">City</th>
                    <th className="text-left px-3 py-2">CEO</th>
                    <th className="text-left px-3 py-2">Cofounders</th>
                    <th className="text-left px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.map((r, i) => (
                    <tr key={`${r.company_name}-${i}`} className="border-t border-gray-100 dark:border-gray-900">
                      <td className="px-3 py-2">{r.company_name}</td>
                      <td className="px-3 py-2">
                        {r.phone ? (
                          <span className="text-sm">{r.phone}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.country ? (
                          <span className="text-sm">{r.country}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.city ? (
                          <span className="text-sm">{r.city}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.ceo ? (
                          <span className="text-sm">{r.ceo}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.cofounders && r.cofounders.length > 0 ? (
                          <span className="text-sm">{r.cofounders.join(', ')}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
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
                        Noch keine Ergebnisse. Klicken Sie auf Ausführen, um zu beginnen.
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
                CSV herunterladen
              </button>
              <button
                onClick={() => alert("XLSX-Export erfordert externe Bibliotheken wie SheetJS, derzeit nicht aktiviert.")}
                disabled={!results.length}
                className="px-3 py-1.5 text-sm rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-50"
              >
                XLSX herunterladen
              </button>
              <button
                onClick={enhanceWithExecutives}
                disabled={!results.length || isEnhancing}
                className="px-3 py-1.5 text-sm rounded-md bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {isEnhancing ? 'Enhancing...' : 'Enhance with CEO/Founders'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
