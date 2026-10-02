const $ = (id) => document.getElementById(id);
const number = (value, digits = 2) => value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
const currency = (value) => value == null || !Number.isFinite(Number(value)) ? "—" : "$" + Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
const plotLayout = { paper_bgcolor: "#ffffff", plot_bgcolor: "#ffffff", font: { family: "DM Sans, Arial, sans-serif", size: 10, color: "#53656d" }, margin: { l: 52, r: 18, t: 10, b: 48 }, xaxis: { gridcolor: "#edf1ed", zerolinecolor: "#dce5df", linecolor: "#dce5df" }, yaxis: { gridcolor: "#edf1ed", zerolinecolor: "#dce5df", linecolor: "#dce5df" }, showlegend: false };
const plotConfig = { responsive: true, displaylogo: false, modeBarButtonsToRemove: ["lasso2d", "select2d"] };
let currentPage = 1;
let currentOverview = null;
let selectedCsvFile = null;

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function setStatus(message, isError = false) { $("status").textContent = message; $("status").classList.toggle("error", isError); }
function fillSelect(id, items, preferred, blank = false) {
  const select = $(id); const prior = select.value; select.replaceChildren();
  if (blank) select.add(new Option("Choose a feature…", ""));
  items.forEach((item) => select.add(new Option(item, item)));
  if (items.includes(prior)) select.value = prior;
  else if (items.includes(preferred)) select.value = preferred;
  else if (items.length) select.selectedIndex = blank ? 1 : 0;
}
function renderTable(table, headers, rows, emptyMessage = "No values to display.") {
  table.replaceChildren();
  const thead = table.createTHead(); const tr = thead.insertRow();
  headers.forEach((h) => { const th = document.createElement("th"); th.textContent = h.label; tr.appendChild(th); });
  const tbody = table.createTBody();
  if (!rows.length) { const row = tbody.insertRow(); const cell = row.insertCell(); cell.colSpan = headers.length; cell.className = "empty-state"; cell.textContent = emptyMessage; return; }
  rows.forEach((item) => { const row = tbody.insertRow(); headers.forEach((h) => { const cell = row.insertCell(); const value = item[h.key]; cell.textContent = h.format ? h.format(value) : value == null ? "—" : String(value); }); });
}
function renderCorrelationRanking(ranked) {
  const container = $("correlationRanking"); container.replaceChildren();
  if (!ranked.length) { const message = document.createElement("p"); message.className = "muted"; message.textContent = "SalePrice or other comparable numeric features are not available."; container.appendChild(message); return; }
  ranked.forEach((item) => {
    const row = document.createElement("div"); row.className = "rank-item";
    const name = document.createElement("span"); name.textContent = item.feature;
    const value = document.createElement("b"); value.textContent = number(item.correlation, 3);
    const bar = document.createElement("div"); bar.className = "rank-bar";
    const fill = document.createElement("i"); fill.style.width = `${Math.min(100, Math.abs(item.correlation) * 100)}%`;
    bar.appendChild(fill); row.append(name, value, bar); container.appendChild(row);
  });
}
function renderFindings(cards) {
  const grid = $("findingsGrid"); grid.replaceChildren();
  cards.forEach(([label, value, description]) => {
    const card = document.createElement("article"); card.className = "finding-card";
    const heading = document.createElement("span"); heading.className = "finding-label"; heading.textContent = label;
    const result = document.createElement("strong"); result.textContent = value;
    const detail = document.createElement("p"); detail.textContent = description;
    card.append(heading, result, detail); grid.appendChild(card);
  });
}
function plot(id, data, layout = {}) {
  if (!window.Plotly) { $(id).innerHTML = '<div class="empty-state">Charts require an internet connection to load Plotly.</div>'; return; }
  Plotly.react(id, data, { ...plotLayout, ...layout }, plotConfig);
}
function commonAxis(title, extra = {}) { return { title: { text: title, standoff: 9, font: { size: 10, color: "#71817c" } }, ...extra }; }

async function loadOverview() {
  const data = await api("/api/overview"); currentOverview = data;
  $("datasetName").textContent = data.dataset_name;
  const metrics = [["TOTAL ROWS", data.rows, "records"], ["TOTAL COLUMNS", data.columns, "features"], ["NUMERIC", data.numeric_columns, "number-based columns"], ["CATEGORICAL", data.categorical_columns, "labels and groups"], ["MISSING VALUES", data.missing_values, "empty cells"], ["DUPLICATE ROWS", data.duplicate_rows, "repeated records"]];
  $("overviewCards").innerHTML = metrics.map(([label, value, note]) => `<article class="metric-card"><span class="metric-label">${label}</span><strong>${number(value, 0)}</strong><small>${note}</small></article>`).join("");
  renderTable($("featureTable"), [{ key: "name", label: "Feature" }, { key: "dtype", label: "Data type" }, { key: "missing", label: "Missing values", format: number0 }, { key: "unique", label: "Unique values", format: number0 }], data.features);
  fillSelect("distributionFeature", data.numeric_features, data.numeric_features.includes("SalePrice") ? "SalePrice" : data.numeric_features[0]);
  fillSelect("scatterX", data.numeric_features, data.numeric_features.includes("GrLivArea") ? "GrLivArea" : data.numeric_features[0]);
  fillSelect("scatterY", data.numeric_features, data.numeric_features.includes("SalePrice") ? "SalePrice" : data.numeric_features[1] || data.numeric_features[0]);
  fillSelect("covX", data.numeric_features, data.numeric_features.includes("GrLivArea") ? "GrLivArea" : data.numeric_features[0]);
  fillSelect("covY", data.numeric_features, data.numeric_features.includes("SalePrice") ? "SalePrice" : data.numeric_features[1] || data.numeric_features[0]);
  fillSelect("quantileFeature", data.numeric_features, data.numeric_features.includes("SalePrice") ? "SalePrice" : data.numeric_features[0]);
  fillSelect("polyX", data.numeric_features, data.numeric_features.includes("GrLivArea") ? "GrLivArea" : data.numeric_features[0]);
  fillSelect("polyY", data.numeric_features, data.numeric_features.includes("SalePrice") ? "SalePrice" : data.numeric_features[1] || data.numeric_features[0]);
  fillSelect("categoryFeature", data.categorical_features, data.categorical_features.includes("Neighborhood") ? "Neighborhood" : data.categorical_features[0], true);
  $("heroMedian").textContent = data.numeric_features.includes("SalePrice") ? currency((await api("/api/distribution?feature=SalePrice")).median) : `${number(data.rows, 0)} rows`;
  return data;
}
function number0(value) { return number(value, 0); }

async function loadRows() {
  const data = await api(`/api/rows?page=${currentPage}&page_size=15&search=${encodeURIComponent($("rowSearch").value)}`);
  renderTable($("previewTable"), data.columns.map((col) => ({ key: col, label: col })), data.rows);
  $("pageInfo").textContent = `${number(data.total, 0)} matching rows · page ${data.page} of ${data.pages}`;
  $("prevPage").disabled = data.page <= 1; $("nextPage").disabled = data.page >= data.pages;
  $("prevPage").style.opacity = data.page <= 1 ? ".48" : "1"; $("nextPage").style.opacity = data.page >= data.pages ? ".48" : "1";
}
async function loadStatistics() {
  const data = await api("/api/statistics");
  renderTable($("statsTable"), [
    { key: "feature", label: "Feature" }, { key: "count", label: "Count", format: number0 },
    { key: "mean", label: "Average", format: number }, { key: "median", label: "Midpoint", format: number },
    { key: "variance", label: "Variance", format: number }, { key: "std", label: "Typical spread", format: number },
    { key: "min", label: "Minimum", format: number }, { key: "q1", label: "25% mark", format: number },
    { key: "q2", label: "Midpoint", format: number }, { key: "q3", label: "75% mark", format: number }, { key: "max", label: "Maximum", format: number }
  ], data.rows);
}
async function loadMissing() {
  const rows = await api("/api/missing-values");
  renderTable($("missingTable"), [{ key: "feature", label: "Feature" }, { key: "count", label: "Missing", format: number0 }, { key: "percent", label: "Percent", format: (v) => `${number(v)}%` }], rows);
  const nonzero = rows.filter((r) => r.count > 0).slice(0, 18).reverse();
  if (!nonzero.length) { $("missingChart").innerHTML = '<div class="empty-state">No missing values in this dataset.</div>'; return; }
  plot("missingChart", [{ type: "bar", orientation: "h", y: nonzero.map((r) => r.feature), x: nonzero.map((r) => r.count), marker: { color: "#0d766e" }, hovertemplate: "%{y}<br>%{x:,} missing<extra></extra>" }], { margin: { l: 118, r: 15, t: 8, b: 42 }, xaxis: commonAxis("Missing observations"), yaxis: { ...plotLayout.yaxis, automargin: true } });
}
async function loadDistribution() {
  const feature = $("distributionFeature").value; if (!feature) return;
  const d = await api(`/api/distribution?feature=${encodeURIComponent(feature)}`);
  $("distributionTitle").textContent = `${feature} distribution`;
  const centers = d.edges.slice(0, -1).map((left, i) => (left + d.edges[i + 1]) / 2);
  plot("distributionChart", [{ type: "bar", x: centers, y: d.density, marker: { color: "#79a99b", line: { color: "#ffffff", width: 1 } }, hovertemplate: `${feature}: %{x:,.2f}<br>Density: %{y:.4f}<extra></extra>` }], { bargap: .04, xaxis: commonAxis(feature), yaxis: commonAxis("Density") });
  const items = [["Count", d.n], ["Average", d.mean], ["Midpoint", d.median], ["Variance", d.variance], ["Typical spread", d.std], ["25% mark", d.q1], ["75% mark", d.q3], ["Range", `${number(d.min)}–${number(d.max)}`]];
  $("distributionStats").innerHTML = items.map(([label, value]) => `<div class="stat-item"><span>${label}</span><b>${typeof value === "string" ? value : number(value, label === "Count" ? 0 : 2)}</b></div>`).join("");
}
async function loadCategories() {
  const feature = $("categoryFeature").value; if (!feature) { $("categoryChart").innerHTML = '<div class="empty-state">No categorical features are available.</div>'; return; }
  const d = await api(`/api/categories?feature=${encodeURIComponent(feature)}`); $("categoryTitle").textContent = `Most frequent ${feature} values`;
  plot("categoryChart", [{ type: "bar", x: d.labels, y: d.counts, marker: { color: d.labels.map((_, i) => i === 0 ? "#0d766e" : "#9fc5b6") }, hovertemplate: "%{x}<br>%{y:,} rows<extra></extra>" }], { xaxis: { ...plotLayout.xaxis, tickangle: -25, automargin: true }, yaxis: commonAxis("Frequency"), margin: { l: 52, r: 20, t: 10, b: 85 } });
}
async function loadScatter() {
  const x = $("scatterX").value, y = $("scatterY").value; if (!x || !y) return;
  const d = await api(`/api/scatter?x=${encodeURIComponent(x)}&y=${encodeURIComponent(y)}`);
  $("scatterTitle").textContent = `${x} vs ${y}`; $("scatterCorrelation").textContent = number(d.correlation, 3);
  plot("scatterChart", [{ type: "scatter", mode: "markers", x: d.x_values, y: d.y_values, marker: { size: 5, opacity: .57, color: "#0d766e" }, hovertemplate: `${x}: %{x:,.2f}<br>${y}: %{y:,.2f}<extra></extra>` }], { xaxis: commonAxis(x), yaxis: commonAxis(y), margin: { l: 60, r: 18, t: 10, b: 52 } });
}
async function loadCorrelation() {
  const d = await api("/api/correlation");
  if (d.features.length) plot("correlationChart", [{ type: "heatmap", x: d.features, y: d.features, z: d.matrix, zmin: -1, zmax: 1, colorscale: [[0,"#ca765f"],[.5,"#f7f6ef"],[1,"#187d72"]], colorbar: { title: "Link", thickness: 10 }, hovertemplate: "%{y} × %{x}<br>Link score: %{z:.3f}<extra></extra>" }], { margin: { l: 105, r: 30, t: 8, b: 95 }, xaxis: { ...plotLayout.xaxis, tickangle: -45, tickfont: { size: 8 } }, yaxis: { ...plotLayout.yaxis, autorange: "reversed", tickfont: { size: 8 } } });
  renderCorrelationRanking(d.ranked.slice(0, 8));
}
async function loadCovariance() {
  const x = $("covX").value, y = $("covY").value; if (!x || !y) return;
  const [pair, matrix] = await Promise.all([api(`/api/covariance?x=${encodeURIComponent(x)}&y=${encodeURIComponent(y)}`), api("/api/covariance")]);
  const direction = pair.sign === "positive" ? "Usually rise together" : pair.sign === "negative" ? "Often move in opposite directions" : "No clear direction together";
  $("covarianceValue").textContent = number(pair.covariance, 2); $("covarianceInterpretation").textContent = `${direction} · ${pair.n.toLocaleString()} homes`;
  const matrixRows = matrix.features.map((feature, r) => {
    const row = { feature };
    matrix.features.forEach((_, c) => { row[`v${c}`] = matrix.matrix[r][c]; });
    return row;
  });
  renderTable($("covarianceTable"), [{ key: "feature", label: "Feature" }, ...matrix.features.map((c, i) => ({ key: `v${i}`, label: c, format: (v) => number(v) }))], matrixRows);
}
async function loadQuantiles() {
  const feature = $("quantileFeature").value; if (!feature) return;
  const d = await api(`/api/quantiles?feature=${encodeURIComponent(feature)}`); $("quantileTitle").textContent = `${feature} typical range`;
  plot("quantileChart", [{ type: "box", x: d.values, name: feature, boxpoints: false, fillcolor: "rgba(13,118,110,.13)", line: { color: "#0d766e", width: 2 }, marker: { color: "#0d766e" }, orientation: "h", hovertemplate: "%{x:,.2f}<extra></extra>" }], { xaxis: commonAxis(feature), yaxis: { ...plotLayout.yaxis, showticklabels: false, showgrid: false, zeroline: false }, margin: { l: 30, r: 15, t: 30, b: 52 } });
  const items = [["Minimum",d.min],["25% mark",d.q1],["Midpoint",d.median],["75% mark",d.q3],["Maximum",d.max],["Middle spread",d.iqr]];
  $("quantileValues").innerHTML = items.map(([label,value]) => `<div class="quantile-cell"><span>${label}</span><b>${number(value)}</b></div>`).join("");
}
async function loadPolynomial() {
  const x = $("polyX").value, y = $("polyY").value; if (!x || !y) return;
  const degree = $("polyDegree").value;
  const d = await api(`/api/polynomial?x=${encodeURIComponent(x)}&y=${encodeURIComponent(y)}&degree=${degree}`);
  $("polyTitle").textContent = `Trend for ${y} by ${x}`; $("polyR2").textContent = number(d.r_squared, 3);
  plot("polynomialChart", [
    { type: "scatter", mode: "markers", x: d.x_values, y: d.y_values, name: "Observed rows", marker: { size: 4, opacity: .35, color: "#7fa8c7" }, hovertemplate: `${x}: %{x:,.2f}<br>${y}: %{y:,.2f}<extra></extra>` },
    { type: "scatter", mode: "lines", x: d.curve_x, y: d.curve_y, name: "Trend line", line: { color: "#d6785c", width: 3 }, hovertemplate: `${x}: %{x:,.2f}<br>Fitted ${y}: %{y:,.2f}<extra></extra>` }
  ], { showlegend: true, legend: { orientation: "h", y: 1.15, x: .7 }, xaxis: commonAxis(x), yaxis: commonAxis(y), margin: { l: 60, r: 18, t: 30, b: 52 } });
}
async function loadFindings() {
  const d = currentOverview; const cards = [];
  if (d.numeric_features.includes("SalePrice")) {
    const dist = await api("/api/distribution?feature=SalePrice"); cards.push(["MEDIAN SALE PRICE", currency(dist.median), "The center of the observed SalePrice values."]);
    const corr = await api("/api/correlation"); const best = corr.ranked[0]; if (best) cards.push(["TOP PRICE CONNECTION", best.feature, `Strongest observed link with SalePrice. Link score: ${number(best.correlation,3)}.`]);
  }
  cards.push(["NUMBER-BASED COLUMNS", number(d.numeric_features.length, 0), "Number-based columns available to explore."]);
  const missing = (await api("/api/missing-values")).filter((r) => r.count > 0); cards.push(["MISSINGNESS", missing.length ? `${missing.length} features` : "None", missing.length ? `${missing[0].feature} has the most missing cells (${number(missing[0].count,0)}).` : "Every feature is complete in the current dataset."]);
  const neighborhood = d.categorical_features.includes("Neighborhood") ? await api("/api/categories?feature=Neighborhood") : null;
  if (neighborhood?.labels.length) cards.push(["MOST COMMON NEIGHBORHOOD", neighborhood.labels[0], `${number(neighborhood.counts[0],0)} records in this dataset.`]);
  cards.push(["DATASET SIZE", `${number(d.rows,0)} × ${number(d.columns,0)}`, "Current rows by columns after upload."]);
  renderFindings(cards);
}
async function loadAll() {
  try {
    const overview = await loadOverview();
    setStatus(`Loaded ${overview.dataset_name}: ${overview.rows.toLocaleString()} rows and ${overview.columns} columns.`);
    await Promise.all([loadRows(), loadStatistics(), loadMissing(), loadDistribution(), loadCategories(), loadScatter(), loadCorrelation(), loadCovariance(), loadQuantiles(), loadPolynomial(), loadFindings()]);
  } catch (e) { setStatus(e.message, true); }
}
async function uploadFile() {
  const file = selectedCsvFile || $("csvFile").files[0]; if (!file) return setStatus("Choose or drop a CSV file first.", true);
  const button = $("uploadButton"); button.disabled = true; setStatus(`Uploading ${file.name}…`);
  try { const body = new FormData(); body.append("file", file); const result = await api("/api/upload", { method: "POST", body }); currentPage = 1; setStatus(`${result.message}: ${result.rows.toLocaleString()} rows and ${result.columns} columns.`); await loadAll(); }
  catch (e) { setStatus(e.message, true); }
  finally { button.disabled = false; }
}
async function resetSample() {
  try { await api("/api/reset", { method: "POST" }); currentPage = 1; selectedCsvFile = null; $("csvFile").value = ""; await loadAll(); }
  catch (e) { setStatus(e.message, true); }
}
function acceptSelectedFile(file) {
  selectedCsvFile = file || null;
  if (!selectedCsvFile) return;
  setStatus(`Ready to upload ${selectedCsvFile.name}.`);
}
function bind() {
  $("uploadButton").addEventListener("click", uploadFile);
  $("browseButton").addEventListener("click", () => $("csvFile").click());
  $("csvFile").addEventListener("change", () => acceptSelectedFile($("csvFile").files[0]));
  const dropZone = $("uploadPanel");
  ["dragenter", "dragover"].forEach((eventName) => dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.classList.add("drag-over"); }));
  ["dragleave", "drop"].forEach((eventName) => dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.classList.remove("drag-over"); }));
  dropZone.addEventListener("drop", (event) => {
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length !== 1) return setStatus("Drop one CSV file at a time.", true);
    acceptSelectedFile(files[0]);
  });
  $("resetButton").addEventListener("click", resetSample); $("prevPage").addEventListener("click", () => { currentPage = Math.max(1,currentPage-1); loadRows(); }); $("nextPage").addEventListener("click", () => { currentPage++; loadRows(); });
  let searchTimer; $("rowSearch").addEventListener("input", () => { currentPage = 1; clearTimeout(searchTimer); searchTimer = setTimeout(loadRows, 250); });
  [["distributionFeature",loadDistribution],["categoryFeature",loadCategories],["scatterX",loadScatter],["scatterY",loadScatter],["covX",loadCovariance],["covY",loadCovariance],["quantileFeature",loadQuantiles],["polyX",loadPolynomial],["polyY",loadPolynomial],["polyDegree",loadPolynomial]].forEach(([id,fn]) => $(id).addEventListener("change", () => fn().catch(e => setStatus(e.message,true))));
}
document.addEventListener("DOMContentLoaded", () => { bind(); loadAll(); });
