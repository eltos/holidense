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
let selectedCountries = ["DE"];


// ------------------------------------------------------------
// Initialisierung
const API_BASE = "https://openholidaysapi.org";
let populationData = null;
let cachedData = {Regions: {}};

const calendarContainer = document.getElementById("calendar");
const sourceInfo = document.getElementById("sourceInfo");
const yearSelect = document.getElementById("yearSelect");
const countryList = document.getElementById("countryList");
document.addEventListener("DOMContentLoaded", async () => {

  try {
    populateYearSelect();
    renderCountrySelection();
    await updateCalendar();
  } catch (e) {
    calendarContainer.innerHTML = e.message;
  }

  sourceInfo.append("Datenquellen: ")

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

// ------------------------------------------------------------
// Dropdown für Jahr/Zeitraum vorbereiten
function populateYearSelect() {
  const now = new Date();
  const currentYear = now.getFullYear();
  for (let y = currentYear - 1; y <= currentYear + 2; y++) {
    const optCal = document.createElement("option");
    optCal.value = `${y}-01-01|${y}-12-31`;
    optCal.textContent = `${y}`;
    yearSelect.appendChild(optCal);

    const optShifted = document.createElement("option");
    optShifted.value = `${y}-07-01|${y + 1}-06-30`;
    optShifted.textContent = `${y}/${(y + 1).toString().slice(-2)}`;
    yearSelect.appendChild(optShifted);
  }
  yearSelect.value = now.getMonth() < 6 ? `${currentYear}-01-01|${currentYear}-12-31` : `${currentYear}-07-01|${currentYear + 1}-06-30`;
  yearSelect.addEventListener("change", updateCalendar);
}

// ------------------------------------------------------------
// Länder-Auswahl rendern
function renderCountrySelection() {
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
  if (!res.ok) throw new Error("Fehler beim Laden der Bevölkerungsdaten");
  populationData = await res.json();
}

// ------------------------------------------------------------
// Hole Ferien- und Feiertagsdaten aus der API
async function fetchCountryData(year, countryCode) {
  const requests = [
    fetch(`${API_BASE}/PublicHolidays?countryIsoCode=${countryCode}&validFrom=${year}-01-01&validTo=${year}-12-31&languageIsoCode=DE`),
    fetch(`${API_BASE}/SchoolHolidays?countryIsoCode=${countryCode}&validFrom=${year}-01-01&validTo=${year}-12-31&languageIsoCode=DE`)
  ];

  const responses = await Promise.all(requests);
  if (responses.some(r => !r.ok)) {
    throw new Error(`Fehler beim Abrufen der Daten für ${countryCode} für ${year}`);
  }
  const [holidays, schoolHolidays] = await Promise.all(responses.map(r => r.json()));

  if (!(year in cachedData)) cachedData[year] = {};
  cachedData[year][countryCode] = {holidays, schoolHolidays};

}

async function fetchRegionData(countryCode) {
  const RegionRes = await fetch(`${API_BASE}/Subdivisions?countryIsoCode=${countryCode}&languageIsoCode=DE`);
  cachedData.Regions[countryCode] = await RegionRes.json();
}


// ------------------------------------------------------------
// Aktualisiere Kalender
async function updateCalendar() {
  const [fromStr, toStr] = yearSelect.value.split("|");
  const fromDate = new Date(fromStr);
  const toDate = new Date(toStr);

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
  const dayStats = calculateDayStatistics(fromDate, toDate);
  renderCalendar(fromDate, toDate, dayStats);
}

// ------------------------------------------------------------
// Berechne Feriendichte je Tag
function calculateDayStatistics(fromDate, toDate) {
  stats = {};
  const missingRegions = new Set();
  const totalPop = selectedCountries.reduce((sum, c) => {
    const subs = populationData.countries[c].subdivisions;
    return sum + Object.values(subs).reduce((a, b) => a + b, 0);
  }, 0);

  for (let d = new Date(fromDate); d <= new Date(toDate); d.setDate(d.getDate() + 1)) {
    d.setHours(0, 0, 0, 0);
    const key = dateKey(d);
    stats[key] = {share: 0, off: false, tooltip: []};

    let holidayPopulationTotal = 0;
    let nationwideHolidayAnyCountry = false;
    const tooltip = [];

    for (const country of selectedCountries) {
      const {holidays, schoolHolidays} = cachedData[d.getFullYear()][country];
      const regionNames = cachedData.Regions[country].reduce((d, e) => (d[e.code] = e.name?.[0]?.text, d), {});
      const relevant = [];

      // --- Feiertage ---
      for (const h of holidays) {
        if (inDateRange(d, h.startDate, h.endDate)) relevant.push({...h, type: "Feiertag"});
      }

      // --- Ferien ---
      for (const f of schoolHolidays) {
        if (inDateRange(d, f.startDate, f.endDate, true)) relevant.push({
          ...f,
          type: "Ferien"
        });
      }

      // Count population on holiday
      const countryPop = populationData.countries[country].subdivisions;
      let holidayRegions = new Set();
      let nationwideHoliday = false;
      let nationwideSchoolHoliday = false;
      const infos = {};

      for (const r of relevant) {
        const label = r.name?.[0]?.text || "Unbenannt";
        if (!(label in infos)) {
          infos[label] = {Type: r.type, Subdivisions: new Set(), All: false}
        }

        if (r.nationwide) {
          if (r.type === "Ferien") {
            nationwideSchoolHoliday = true;
          } else {
            nationwideHoliday = true;
          }
          infos[label].All = true;

        } else if (r.subdivisions) {
          const regions = r.subdivisions.map(s => s.code.split("-").slice(0, 2).join("-"))
          regions.forEach(code => {
            if (countryPop[code]) {
              holidayRegions.add(code);
              infos[label].Subdivisions.add(code);
            } else {
              missingRegions.add(code)
            }

          });

        }
      }


      const countryPopTotal = Object.values(countryPop).reduce((a, b) => a + b, 0);
      const holidayPopulation = (nationwideHoliday || nationwideSchoolHoliday) ? countryPopTotal : [...holidayRegions].map(c => countryPop[c]).reduce((a, b) => a + b, 0);
      holidayPopulationTotal += holidayPopulation;
      nationwideHolidayAnyCountry |= nationwideHoliday;

      // infos for tooltip
      if (holidayPopulation > 0) {
        const c = countries.find(c => c.code === country);
        if (selectedCountries.length > 1) {
          tooltip.push(`\n<span class="tooltip-country">${c.name}: ${(holidayPopulation / 1e6).toFixed(1)} Mio. (${(100 * holidayPopulation / countryPopTotal).toFixed(0)}%)</span>`);
        }
        for (const [label, info] of Object.entries(infos)) {
          if (info.All || info.Subdivisions.size > 0) {
            //const divisionsText = [...info.Subdivisions].map((s) => s.split("-")[1]).toSorted().join(", ");
            const divisionsText = "in " + [...info.Subdivisions].map((s) => regionNames[s]).toSorted().join(", ");
            tooltip.push(`${label} <span class="tooltip-info">(${info.Type} ${info.All ? "landesweit" : divisionsText})</span>`)
          }
        }
      }

    }
    const summary = `<span class="tooltip-title">${(holidayPopulationTotal / 1e6).toFixed(1)} Mio. Einwohner (${(100 * holidayPopulationTotal / totalPop).toFixed(0)}%)</span>\n`;
    stats[key].tooltip = holidayPopulationTotal > 0 ? summary + tooltip.join("\n") : `<span class="tooltip-title">Keine Ferien/Feiertage</span>`;

    stats[key].off = nationwideHolidayAnyCountry || d.getDay() === 0; // Sunday
    stats[key].share = holidayPopulationTotal / totalPop;

  }

  if (missingRegions.size > 0) {
    console.error("Missing population data for regions: " + [...missingRegions].join(", "));
  }

  return stats;
}

// ------------------------------------------------------------
// Kalenderdarstellung
function renderCalendar(fromDate, toDate, stats) {
  calendarContainer.innerHTML = "";
  tooltipElement.style.opacity = 0;

  const startMonth = fromDate.getMonth();
  const months = [];
  for (let i = 0; i < 12; i++) {
    const m = new Date(fromDate.getFullYear(), startMonth + i, 1);
    months.push(m);
  }

  for (const monthDate of months) {
    const monthDiv = document.createElement("div");
    monthDiv.className = "month";
    const monthName = monthDate.toLocaleString("de-DE", {month: "long", year: "numeric"});
    monthDiv.innerHTML = `<h3>${monthName}</h3>`;
    const table = document.createElement("table");

    const headerRow = document.createElement("tr");
    ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].forEach((d) => {
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
      const key = dateKey(date);
      const cell = document.createElement("td");
      cell.textContent = day;
      cell.dataset.code = key;

      if (stats[key]) {
        const share = stats[key].share || 0;
        cell.style.backgroundColor = densityColor(share);
        cell.style.fontWeight = stats[key].off ? "bold" : "regular";

        // tooltip
        const show = (e) => {
          tooltipElement.innerHTML = stats[key].tooltip;
          tooltipElement.style.maxWidth = window.innerWidth / 2 + "px";
          if (e.pageX + 10 < window.innerWidth - tooltipElement.getBoundingClientRect().width) {
            tooltipElement.style.left = e.pageX + 10 + "px";
            tooltipElement.style.right = '';
          } else {
            tooltipElement.style.left = '';
            tooltipElement.style.right = window.innerWidth - e.pageX + 10 + "px";
          }
          if (e.pageY + 10 < window.innerHeight - tooltipElement.getBoundingClientRect().height) {
            tooltipElement.style.top = e.pageY + 10 + "px";
            tooltipElement.style.bottom = '';
          } else {
            tooltipElement.style.top = '';
            tooltipElement.style.bottom = window.innerHeight - e.pageY + 10 + "px";
          }
          tooltipElement.style.opacity = 1;
        };
        cell.addEventListener("pointerover", show);
        cell.addEventListener("pointerdown", show);
        cell.addEventListener("pointerout", () => (tooltipElement.style.opacity = 0));

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
  return new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000).toISOString().split("T")[0];
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

