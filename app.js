// ============================================================
// Feriendichte Kalender – Hauptskript
// ============================================================

// ------------------------------------------------------------
// Länderdefinitionen (Flaggen + Namen + ISO-Codes)
const countries = [
  {code: "DE", name: "Deutschland", flag: "🇩🇪"},
  {code: "AT", name: "Österreich", flag: "🇦🇹"},
  {code: "CH", name: "Schweiz", flag: "🇨🇭"},
  {code: "FR", name: "Frankreich", flag: "🇫🇷"},
  {code: "BE", name: "Belgien", flag: "🇧🇪"},
  {code: "NL", name: "Niederlande", flag: "🇳🇱"},
  {code: "CZ", name: "Tschechien", flag: "🇨🇿"}
];


// ------------------------------------------------------------
// Initialisierung
const API_BASE = "https://openholidaysapi.org";
let populationData = null;
let cachedData = {Regions: {}};
let i18n = {
  publicHoliday: "Feiertag",
  schoolHoliday: "Ferien",
  noHoliday: "Keine Ferien/Feiertage",
  in: "in",
  nationwide: "landesweit",
  mioResidents: "Mio. Einwohner",
  incompleteData: "Unvollständige Datenbasis",
  dataSources: "Datenquellen",
  share: "Link teilen",
  shareInfo: "Persistenter Link",
  copiedToClipboard: "wurde in die Zwischenablage kopiert"
};


const url = new URL(location)
let selectedMonthRange = url.searchParams.get("range");
let selectedCountries = url.searchParams.get("countries")?.split("|") || ["DE"];
selectedCountries = [...new Set(selectedCountries).intersection(new Set(countries.map(c => c.code)))];
let locale = url.searchParams.get("lang") || "de";


const calendarContainer = document.getElementById("calendar");
const errorBar = document.getElementById("errorbar");
const sourceInfo = document.getElementById("sourceInfo");
const yearSelect = document.getElementById("yearSelect");
const countryList = document.getElementById("countryList");
const shareLinkButton = document.getElementById("shareLink");
shareLinkButton.addEventListener("click", e => {
  const url = new URL(location)
  url.searchParams.set("range", selectedMonthRange)
  url.searchParams.set("countries", selectedCountries.toSorted().join("|"));
  url.searchParams.set('lang', locale);
  navigator.clipboard.writeText(url.toString()).then(() =>
    window.alert(i18n.shareInfo + " " + i18n.copiedToClipboard)
  ).catch(() =>
    window.prompt(i18n.shareInfo + ":", url.toString())
  );
})
document.getElementById("languageSelector").onclick = async e => {
  locale = locale === "de" ? "en" : "de";
  const url = new URL(location)
  url.searchParams.set('lang', locale);
  location.href = url.toString();
};

document.addEventListener("DOMContentLoaded", async () => {

  await i18ninit();

  try {
    populateYearSelect();
    renderCountrySelection();
    await updateCalendar();
  } catch (e) {
    errorBar.innerHTML = "Error: " + e.message + `<br/><a href=".">Reload page</a>`;
    errorBar.style.display = "block";
    throw e
  }
  errorBar.style.display = "none";

  shareLinkButton.text = i18n.share

  sourceInfo.append(i18n.dataSources + ": ")

  function sourceLink(url, label) {
    let link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.innerText = label;
    return link
  }

  links = [sourceLink("https://www.openholidaysapi.org", "OpenHolidays API")]
  Object.values(populationData.countries).forEach(c => {
    if (c.source) {
      links.push(", ");
      links.push(sourceLink(c.url, c.source));
    }
  });
  links.forEach(l => sourceInfo.append(l));

});
const tooltipElement = document.createElement("div");
tooltipElement.className = "tooltip";
document.body.appendChild(tooltipElement);

function showTooltip(e, tooltip) {
  tooltipElement.innerHTML = tooltip;

  if (window.innerWidth < 1000) {
    // better for smaller displays
    tooltipElement.style.maxWidth = window.innerWidth * 2 / 3 + "px";
    tooltipElement.style.left = e.pageX - tooltipElement.getBoundingClientRect().width * e.pageX / window.innerWidth + "px";
    tooltipElement.style.right = '';
  } else {
    tooltipElement.style.maxWidth = window.innerWidth / 2 - 40 + "px";
    if (e.pageX + 20 < window.innerWidth - tooltipElement.getBoundingClientRect().width) {
      tooltipElement.style.left = e.pageX + 10 + "px";
      tooltipElement.style.right = '';
    } else {
      tooltipElement.style.left = '';
      tooltipElement.style.right = window.innerWidth - e.pageX + 10 + "px";
    }
  }
  if (e.pageY + 20 < window.innerHeight - tooltipElement.getBoundingClientRect().height) {
    tooltipElement.style.top = e.pageY + 10 + "px";
    tooltipElement.style.bottom = '';
  } else {
    tooltipElement.style.top = '';
    tooltipElement.style.bottom = window.innerHeight - e.pageY + 10 + "px";
  }
  tooltipElement.style.opacity = 0.95;
}

function registerTooptip(element, tooltip) {
  element.addEventListener("pointerover", e => showTooltip(e, tooltip));
  element.addEventListener("pointerdown", e => showTooltip(e, tooltip));
  element.addEventListener("pointermove", e => showTooltip(e, tooltip));
  element.addEventListener("pointerout", () => (tooltipElement.style.opacity = 0));
}


// ------------------------------------------------------------
// Dropdown für Jahr/Zeitraum vorbereiten
function populateYearSelect() {
  const now = new Date();
  const currentYear = now.getFullYear();
  for (let y = currentYear - 1; y <= currentYear + 2; y++) {
    const optCal = document.createElement("option");
    optCal.value = `${y}-01~${y}-12`;
    optCal.textContent = `${y}`;
    yearSelect.appendChild(optCal);

    const optShifted = document.createElement("option");
    optShifted.value = `${y}-07~${y + 1}-06`;
    optShifted.textContent = `${y}/${(y + 1).toString().slice(-2)}`;
    yearSelect.appendChild(optShifted);
  }
  selectedMonthRange = selectedMonthRange || (now.getMonth() < 6 ? `${currentYear}-01~${currentYear}-12` : `${currentYear}-07~${currentYear + 1}-06`);
  yearSelect.value = selectedMonthRange
  yearSelect.addEventListener("change", async e => {
    selectedMonthRange = e.currentTarget.value;
    await updateCalendar();
  });
}

// ------------------------------------------------------------
// Länder-Auswahl rendern
function renderCountrySelection() {
  countryList.innerHTML = "";
  countries.forEach((c) => {
    const div = document.createElement("div");
    div.className = "country-item";
    if (selectedCountries.includes(c.code)) {
      div.className += " active";
    }
    div.dataset.code = c.code;
    div.innerHTML = `<span>${c.flag}</span> <span>${c.name}</span>`;
    div.addEventListener("click", async () => {
      if (selectedCountries.includes(c.code)) {
        selectedCountries = selectedCountries.filter((x) => x !== c.code);
        div.classList.remove("active");
      } else {
        selectedCountries.push(c.code);
        div.classList.add("active");
      }
      await updateCalendar();
    });
    countryList.appendChild(div);
  });
}

async function fetchPopulationData() {
  const res = await fetch("population.json");
  if (!res.ok) throw new Error("Error loading population data");
  populationData = await res.json();

  for (let element of document.getElementsByClassName("country-item")) {
    const population = Object.values(regions(populationData.countries[element.dataset.code])).reduce((a, b) => a + b, 0);
    registerTooptip(element, `<span class="tooltip-title">${formatPopulation(population)}</span>\n`);
  }

}

// ------------------------------------------------------------
// Hole Ferien- und Feiertagsdaten aus der API
async function fetchCountryData(year, countryCode) {
  const requests = [
    fetch(`${API_BASE}/PublicHolidays?countryIsoCode=${countryCode}&validFrom=${year}-01-01&validTo=${year}-12-31&languageIsoCode=${locale.toUpperCase()}`),
    fetch(`${API_BASE}/SchoolHolidays?countryIsoCode=${countryCode}&validFrom=${year}-01-01&validTo=${year}-12-31&languageIsoCode=${locale.toUpperCase()}`)
  ];
  const responses = await Promise.all(requests);
  if (responses.some(r => !r.ok)) {
    throw new Error(`Error loading data of ${countryCode} for ${year}`);
  }
  const [holidays, schoolHolidays] = await Promise.all(responses.map(r => r.json()));

  if (!(year in cachedData)) cachedData[year] = {};
  cachedData[year][countryCode] = {holidays, schoolHolidays};

}

async function fetchRegionData(countryCode) {
  const requests = [
    fetch(`${API_BASE}/Subdivisions?countryIsoCode=${countryCode}&languageIsoCode=${locale.toUpperCase()}`),
    fetch(`${API_BASE}/Groups?countryIsoCode=${countryCode}&languageIsoCode=${locale.toUpperCase()}`)
  ];
  const responses = await Promise.all(requests);
  if (responses.some(r => !r.ok)) {
    throw new Error(`Error loading region data of ${countryCode}`);
  }
  const [subdivision, groups] = await Promise.all(responses.map(r => r.json()));

  cachedData.Regions[countryCode] = [...subdivision, ...groups];
}


// ------------------------------------------------------------
// Aktualisiere Kalender
async function updateCalendar() {
  try {
    const [fromStr, toStr] = selectedMonthRange.split("~");
    const fromDate = new Date(fromStr);
    let toDate = new Date(toStr);
    if (!fromDate || isNaN(fromDate) || !toDate || isNaN(toDate) || toDate < fromDate || toDate - fromDate > 2 * 365 * 24 * 60 * 60 * 1000)
      throw Error("Invalid date range " + selectedMonthRange);

    // Lade Daten, falls noch nicht vorhanden
    const fetch = [];
    if (!populationData) fetch.push(fetchPopulationData());
    for (let country of selectedCountries) {
      if (!cachedData.Regions[country]) fetch.push(fetchRegionData(country));
      for (let year of [...new Set([fromDate.getFullYear(), toDate.getFullYear()])]) {
        if (!cachedData[year] || !cachedData[year][country]) fetch.push(fetchCountryData(year, country));
      }
    }
    await Promise.all(fetch);

    // Daten aggregieren
    const stats = calculateDayStatistics(fromDate, toDate);
    renderCalendar(stats);

  } catch (e) {
    errorBar.innerHTML = "Error: " + e.message + `<br/><a href=".">Reload page</a>`;
    errorBar.style.display = "block";
    throw e
  }
  errorBar.style.display = "none";

}

// ------------------------------------------------------------
// Berechne Feriendichte je Tag
function calculateDayStatistics(fromDate, toDate) {
  stats = {};
  const missingRegions = new Set();
  const totalPop = selectedCountries.reduce((sum, c) => {
    const subs = regions(populationData.countries[c]);
    return sum + Object.values(subs).reduce((a, b) => a + b, 0);
  }, 0);

  fromDate.setDate(1)
  toDate.setMonth(toDate.getMonth() + 1, 0)
  for (let d = new Date(fromDate); d <= new Date(toDate); d.setDate(d.getDate() + 1)) {
    d.setHours(0, 0, 0, 0);
    const [m, key] = dateKey(d);
    if (!stats[m]) stats[m] = {};
    stats[m][key] = {share: 0, off: false, tooltip: [], incompleteData: false};

    let holidayPopulationTotal = 0;
    let nationwideHolidayAnyCountry = false;
    let incompleteData = new Set();
    let incompleteDataPopulation = 0;
    const tooltip = [];

    for (const country of selectedCountries) {
      const {holidays, schoolHolidays} = cachedData[d.getFullYear()][country];
      const countryName = countries.find(c => c.code === country)?.name;
      const regionNames = cachedData.Regions[country].reduce((d, e) => (d[e.code] = e.name?.[0]?.text, d), {});
      const relevant = [];

      // --- Feiertage ---
      for (const h of holidays) {
        if (inDateRange(d, h.startDate, h.endDate)) relevant.push({...h, type: i18n.publicHoliday});
      }

      // --- Ferien ---
      for (const f of schoolHolidays) {
        if (inDateRange(d, f.startDate, f.endDate, true)) relevant.push({
          ...f,
          type: i18n.schoolHoliday
        });
      }

      // Count population on holiday
      const population = regions(populationData.countries[country]);
      let holidayRegions = new Set();
      let nationwideHoliday = false;
      let nationwideSchoolHoliday = false;
      const infos = {};

      for (const r of relevant) {
        const label = r.name?.[0]?.text || "Unbenannt";
        if (!(label in infos)) {
          infos[label] = {Type: r.type, Regions: new Set(), All: false}
        }

        if (r.nationwide) {
          if (r.type === i18n.schoolHoliday) {
            nationwideSchoolHoliday = true;
          } else {
            nationwideHoliday = true;
          }
          infos[label].All = true;

        } else if (regions(r)) {
          regions(r).map(s => s.code.split("-").slice(0, 2).join("-")).forEach(region => {
            if (population[region]) {
              infos[label].Regions.add(region);
              holidayRegions.add(region)
            } else {
              missingRegions.add(region)
            }

          });

        }
      }

      const countryPopTotal = Object.values(population).reduce((a, b) => a + b, 0);
      const holidayPopulation = (nationwideHoliday || nationwideSchoolHoliday) ? countryPopTotal : [...holidayRegions].map(c => population[c]).reduce((a, b) => a + b, 0);
      holidayPopulationTotal += holidayPopulation;
      nationwideHolidayAnyCountry |= nationwideHoliday;


      // Check for incomplete data
      if (holidays.length === 0 || schoolHolidays.length === 0 || maxDate(schoolHolidays.map(f => f.endDate)) < d) {
        incompleteData.add(countryName);
        incompleteDataPopulation += countryPopTotal;
      } else {
        // Also check if school holidays are missing completely for any region
        let missing = Object.keys(regions(populationData.countries[country])).filter(region => {
          const regionHolidays = schoolHolidays.filter(h => h.nationwide || regions(h)?.map(s => s.code.split("-").slice(0, 2).join("-")).includes(region));
          return regionHolidays.length === 0 || maxDate(regionHolidays.map(f => f.endDate)) < d;
        });
        if (missing.length > 0) {
          incompleteData.add(countryName + " (" + missing.map(r => regionNames[r]).join(", ") + ")")
          incompleteDataPopulation += missing.map(r => population[r]).reduce((a, b) => a + b, 0);
        }
      }

      // infos for tooltip
      if (holidayPopulation > 0) {
        const c = countries.find(c => c.code === country);
        if (selectedCountries.length > 1) {
          tooltip.push(`\n<span class="tooltip-country">${c.name}: ${formatPopulation(holidayPopulation, countryPopTotal)}</span>`);
        }
        for (const [label, info] of Object.entries(infos)) {
          if (info.All || info.Regions.size > 0) {
            //const divisionsText = [...info.Regions].map((s) => s.split("-")[1]).toSorted().join(", ");
            const divisionsText = i18n.in + " " + [...info.Regions].map((s) => regionNames[s] || s).toSorted().join(", ");
            tooltip.push(`${label} <span class="tooltip-info">(${info.Type} ${info.All ? i18n.nationwide : divisionsText})</span>`)
          }
        }
      }

    }

    // Build tooltip text
    let tooltipText = "";
    if (holidayPopulationTotal > 0){
      const summary = `<span class="tooltip-title">${formatPopulation(holidayPopulationTotal, totalPop)}</span>\n`;
      tooltipText += summary + tooltip.join("\n");
    } else {
      tooltipText += `<span class="tooltip-title">${i18n.noHoliday}</span>`;
    }
    if (incompleteData.size > 0) {
      tooltipText += `\n\n<span class="warning warning-title">${i18n.incompleteData}: ${formatPopulation(incompleteDataPopulation, totalPop)}</span>`
      tooltipText += `\n<span class="warning">${[...incompleteData].join(", ")}</span>`;
    }

    stats[m][key].tooltip = tooltipText;
    stats[m][key].off = nationwideHolidayAnyCountry || d.getDay() === 0; // Sunday
    stats[m][key].share = holidayPopulationTotal / totalPop;
    stats[m][key].incompleteData = incompleteDataPopulation / totalPop >= 0.05; // Highlight if error above 5%

  }

  if (missingRegions.size > 0) {
    console.error("Missing population data for regions: " + [...missingRegions].join(", "));
  }

  return stats;
}

// ------------------------------------------------------------
// Kalenderdarstellung
function renderCalendar(stats) {
  calendarContainer.innerHTML = "";
  tooltipElement.style.opacity = 0;

  for (const month of Object.keys(stats)) {
    const monthDate = new Date(month);
    const monthDiv = document.createElement("div");
    monthDiv.className = "month";
    const monthName = monthDate.toLocaleString("de-DE", {month: "long", year: "numeric"});
    monthDiv.innerHTML = `<h3>${monthName}</h3>`;
    const table = document.createElement("table");

    const headerRow = document.createElement("tr");
    Array.of(1, 2, 3, 4, 5, 6, 7).map(d => new Date(Date.UTC(2001, 0, d)))
      .map(d => Intl.DateTimeFormat(locale, {weekday: "short"}).format(d))
      .forEach((d) => {
        const th = document.createElement("th");
        th.textContent = d;
        headerRow.appendChild(th);
      });
    table.appendChild(headerRow);

    const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const lastDay = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    let row = document.createElement("tr");

    let dayOfWeek = (firstDay.getDay() + 6) % 7; // Montag=0
    for (let i = 0; i < dayOfWeek; i++) {
      row.appendChild(document.createElement("td"));
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
      const [m, key] = dateKey(date);
      const dayStat = stats[month][key]
      const cell = document.createElement("td");
      cell.textContent = day;
      cell.dataset.code = key;

      if (dayStat) {
        const share = dayStat.share || 0;
        cell.style.background = densityColor(share);
        if (dayStat.incompleteData) {
          cell.style.background = `repeating-linear-gradient(-45deg, ${cell.style.background}, ${cell.style.background} 8px, transparent 8px, transparent 10px)`;
          cell.style.opacity = 0.8;
        }
        cell.style.fontWeight = dayStat.off ? "bold" : "regular";

        // tooltip
        registerTooptip(cell, dayStat.tooltip);

      }

      row.appendChild(cell);
      if (row.children.length === 7) {
        table.appendChild(row);
        row = document.createElement("tr");
      }
    }

    if (row.children.length > 0) table.appendChild(row);
    monthDiv.appendChild(table);
    calendarContainer.appendChild(monthDiv);
  }


}

// ------------------------------------------------------------
function dateKey(date) {
  const key = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000).toISOString().split("T")[0];
  return [key.slice(0, 7), key]
}

function maxDate(dates){
  return new Date(Math.max(...dates.map(s => new Date(s).getTime())));
}

function regions(data){
  if (data.subdivisions === undefined) return data.groups
  if (data.groups === undefined) return data.subdivisions
  if (Array.isArray(data.subdivisions) && Array.isArray(data.groups)) {
    return [...data.subdivisions, ...data.groups];
  }
  return { ...data.subdivisions, ...data.groups };
}

function formatPopulation(number, total=undefined){
  let result = `${(number / 1e6).toFixed(1)} ${i18n.mioResidents}`
  if (total !== undefined) result += ` (${(100 * number / total).toFixed(0)}%)`;
  return result;
}

function inDateRange(date, startDate, endDate, orAdjacentWeekend = false) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const d = new Date(date);
  if (orAdjacentWeekend) {
    if (start.getDay() === 0) start.setDate(start.getDate() - 1); // Sunday
    if (start.getDay() === 1) start.setDate(start.getDate() - 2); // Monday
    if (end.getDay() === 5) end.setDate(end.getDate() + 2); // Friday
    if (end.getDay() === 6) end.setDate(end.getDate() + 1); // Saturday
  }
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d >= start && d <= end;
}

function densityColor(factor) {
  const f = Math.min(Math.max(factor, 0), 1);
  //return `color-mix(in hsl shorter hue, #F44336 ${100*f}%, #4CAF50)`;
  const isDarkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return `hsl(${f > 0 ? 100 - 100 * f : 120},70%,${isDarkMode ? 35 : 60}%)`;

}

async function i18ninit() {
  locale = (locale || navigator.language?.split("-")[0]).toLowerCase()
  if (locale !== "de") locale = "en";
  document.getElementsByTagName("html")[0].lang = locale;
  countries.forEach(c => c.name = new Intl.DisplayNames([locale], {type: "region"}).of(c.code))
  if (locale !== "de") {
    const res = await fetch(`i18n/${locale}.json`);
    if (!res.ok) throw new Error("Error loading localization data");
    i18n = await res.json();
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n');
      if (i18n[key]) element.innerHTML = i18n[key];
    });
  }

}
