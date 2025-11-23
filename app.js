// ============================================================
// Feriendichte Kalender – Hauptskript
// ============================================================

// ------------------------------------------------------------
// Länderdefinitionen
const countries = ["DE", "AT", "LI", "CH", "IT", "FR", "LU", "BE", "NL", "CZ", "PL", "SK", "HU", "SI", "HR", "ES"];


// ------------------------------------------------------------
// Initialisierung
const API_BASE = "https://openholidaysapi.org";
let populationData = null;
let cachedData = {RegionNames: {}};
let i18n = {
  publicHoliday: "Feiertag",
  schoolHoliday: "Ferien",
  noHoliday: "Keine Ferien/Feiertage",
  in: "in",
  nationwide: "landesweit",
  mioResidents: "Mio. Einwohner",
  incompleteData: "Unvollständige Datenbasis",
  dataSources: "Datenquellen",
  loadingData: "Daten werden geladen...",
  share: "Link teilen",
  shareInfo: "Persistenter Link",
  copiedToClipboard: "wurde in die Zwischenablage kopiert"
};


const url = new URL(location)
let selectedMonthRange = url.searchParams.get("range");
let selectedCountries = url.searchParams.get("countries")?.split("|") || ["DE"];
selectedCountries = [...new Set(selectedCountries).intersection(new Set(countries))];
let locale = url.searchParams.get("lang") || "de";


const calendarContainer = document.getElementById("calendar");
const errorBar = document.getElementById("errorbar");
const infobar = document.getElementById("infobar");
const sourceInfo = document.getElementById("sourceInfo");
const yearSelect = document.getElementById("yearSelect");
const controls = document.getElementById("controls");
const shareLinkButton = document.getElementById("shareLink");
shareLinkButton.addEventListener("click", () => {
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
document.getElementById("languageSelector").onclick = async () => {
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
  let duplicates = new Set();
  Object.values(populationData).forEach(c => {
    if (c.source && c.url && !duplicates.has(c.url)) links.push(", ", sourceLink(c.url, c.source));
    duplicates.add(c.url);
  });
  links.forEach(l => sourceInfo.append(l));

});
const tooltipElement = document.createElement("div");
tooltipElement.className = "tooltip";
document.body.appendChild(tooltipElement);

/**
 * Displays a tooltip at the mouse position, adjusting its size and position
 * based on the viewport dimensions.
 *
 * @param {MouseEvent} e - The event object containing the mouse coordinates.
 * @param {string} tooltip - The HTML content to display inside the tooltip.
 * @return {void}
 */
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
  } else if (e.pageY - 20 > tooltipElement.getBoundingClientRect().height) {
    tooltipElement.style.top = '';
    tooltipElement.style.bottom = window.innerHeight - e.pageY + 10 + "px";
  } else {
    tooltipElement.style.top = 10 + "px";
    tooltipElement.style.bottom = '';
  }
  tooltipElement.style.opacity = 0.95;
}

/**
 * Registers event listeners on the specified element to show and hide a tooltip.
 *
 * @param {HTMLElement} element - The target element to attach listeners to.
 * @param {HTMLElement} tooltip - The tooltip element to be displayed.
 * @return {void}
 */
function registerTooptip(element, tooltip) {
  element.addEventListener("pointerover", e => showTooltip(e, tooltip));
  element.addEventListener("pointerdown", e => showTooltip(e, tooltip));
  element.addEventListener("pointermove", e => showTooltip(e, tooltip));
  element.addEventListener("pointerout", () => (tooltipElement.style.opacity = 0));
}


/**
 * Populates the year selection dropdown with options for the current year and adjacent years.
 * For each year, two options are added: a calendar range (January to December) and
 * a fiscal range (July to June of the following year).
 *
 * The function also sets the default selected range based on the current month,
 * updates the internal `selectedMonthRange` variable, and attaches a change event listener
 * that triggers a calendar update.
 *
 * @return {void}
 */
function populateYearSelect() {
  const now = new Date();
  const currentYear = now.getFullYear();
  yearSelect.childNodes.forEach(n => n.remove());
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

/**
 * Render the list of available countries as selectable items, applying the
 * appropriate active state based on the current selection and attaching click
 * handlers that toggle selection and trigger a calendar update.
 *
 * @return {void}
 */
function renderCountrySelection() {
  controls.querySelectorAll(".placeholder").forEach(c => c.remove())
  countries.forEach((code) => {
    const flag = code.toUpperCase().replace(/./g,
        char => String.fromCodePoint(127397 + char.charCodeAt()));
    const button = document.createElement("button");
    button.className = "country-item";
    if (selectedCountries.includes(code)) {
      button.className += " active";
    }
    button.dataset.code = code;
    button.innerHTML = `<span>${flag}</span> <span>${formatCountryName(code)}</span>`;
    button.addEventListener("click", async () => {
      if (selectedCountries.includes(code)) {
        selectedCountries = selectedCountries.filter((x) => x !== code);
        button.classList.remove("active");
      } else {
        selectedCountries.push(code);
        button.classList.add("active");
      }
      await updateCalendar();
    });
    controls.appendChild(button);
  });
}

/**
 * Loads population data from `population.json`, computes the population for each country,
 * and registers a tooltip on every "country-item" that displays the population.
 *
 * @return {Promise<void>} A promise that resolves once all tooltips are registered,
 *   or rejects if the data fetch fails.
 */
async function fetchPopulationData() {
  const res = await fetch("population.json");
  if (!res.ok) throw new Error("Error loading population data");
  populationData = await res.json();

  for (let code in populationData) {
    populationData[code].regions = { ...populationData[code].subdivisions, ...populationData[code].groups };
  }

  for (let element of document.getElementsByClassName("country-item")) {
    const population = Object.values(populationData[element.dataset.code].regions).reduce((a, b) => a + b, 0);
    registerTooptip(element, `<span class="tooltip-title">${formatPopulation(population)}</span>\n`);
  }

}

/**
 * Retrieves public and school holiday data for a specific year and country, and caches the results.
 *
 * @param {number|string} year - The year (e.g., 2024) for which to fetch holiday data. It is interpolated into a date range string.
 * @param {string} countryCode - The ISO 3166-1 alpha-2 country code used to query the API endpoints.
 *
 * @returns {Promise<void>} A promise that resolves once the data has been successfully fetched and stored in `cachedData`.
 *
 * @throws {Error} If any of the API requests fail (non‑OK status). The error message includes the problematic country code and year.
 */
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

  function preProcessHoliday(includeAdjacentWeekends = false) {
    return h => {
      h.regions = new Set([...h.subdivisions?.map(s => s.code) || [], ...h.groups?.map(g => g.code) || []]
        .map(code => code.split('-').slice(0, 2).join('-')));
      h.startDate = new Date(h.startDate);
      h.endDate = new Date(h.endDate);
      if (includeAdjacentWeekends) {
        if (h.startDate.getDay() === 0) h.startDate.setDate(h.startDate.getDate() - 1); // Sunday
        if (h.startDate.getDay() === 1) h.startDate.setDate(h.startDate.getDate() - 2); // Monday
        if (h.endDate.getDay() === 5) h.endDate.setDate(h.endDate.getDate() + 2); // Friday
        if (h.endDate.getDay() === 6) h.endDate.setDate(h.endDate.getDate() + 1); // Saturday
      }
      h.startDate.setHours(0, 0, 0, 0);
      h.endDate.setHours(0, 0, 0, 0);
    }
  }
  holidays.forEach(preProcessHoliday(false));
  schoolHolidays.forEach(preProcessHoliday(true));

  if (!(year in cachedData)) cachedData[year] = {};
  cachedData[year][countryCode] = {holidays, schoolHolidays};

}

/**
 * Fetches and caches the subdivision and group data for a given country.
 *
 * This function performs two parallel HTTP requests: one for the country's
 * subdivisions and another for its groups. The responses are combined and
 * stored in the `cachedData.RegionNames` map keyed by the provided country code.
 *
 * @param {string} countryCode - The ISO 3166-1 alpha-2 code of the country to fetch.
 * @returns {Promise<void>} A promise that resolves when the data has been
 *   successfully cached. It does not return any value.
 * @throws {Error} If either of the fetch operations fails or returns a non-OK
 *   status, an error is thrown indicating the failure to load region data
 *   for the specified country code.
 */
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

  cachedData.RegionNames[countryCode] = Object.fromEntries([...subdivision, ...groups].map(r => {
    return [r.code, r.name?.[0]?.text || r.code];
  }));

}


/**
 * Updates the calendar view by validating the selected date range,
 * fetching any missing population, region, and country data,
 * aggregating day‑level statistics, and rendering the calendar.
 * In case of an error the error bar is shown and the error is
 * re‑thrown.
 *
 * @return {Promise<void>} Resolves when the calendar has been
 *         successfully updated; rejects if an error occurs.
 */
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
      if (!cachedData.RegionNames[country]) fetch.push(fetchRegionData(country));
      for (let year of [...new Set([fromDate.getFullYear(), toDate.getFullYear()])]) {
        if (!cachedData[year] || !cachedData[year][country]) fetch.push(fetchCountryData(year, country));
      }
    }
    if (fetch.length > 0){
      infobar.innerHTML = i18n.loadingData;
      infobar.style.display = "block";
    }
    await Promise.all(fetch);

    // Daten aggregieren
    const stats = calculateDayStatistics(fromDate, toDate);
    renderCalendar(stats);

  } catch (e) {
    infobar.style.display = "none";
    errorBar.innerHTML = "Error: " + e.message + `<br/><a href=".">Reload page</a>`;
    errorBar.style.display = "block";
    throw e
  }
  infobar.style.display = "none";
  errorBar.style.display = "none";

}

// ------------------------------------------------------------
// Berechne Feriendichte je Tag
/**
 * Calculates daily holiday statistics for the selected countries within the specified date range.
 *
 * The function adjusts the supplied dates to cover whole months, iterates over each day, and
 * aggregates holiday information per country, region, and type. It returns an object
 * indexed by month and day keys. Each day entry contains:
 * - `fraction`: the proportion of the total population that is on leave that day.
 * - `nationalPH`: a boolean indicating whether the day is a national public holiday (including Sunday).
 * - `tooltip`: an HTML string with details about the holidays and affected regions.
 * - `incomplete`: a boolean that is true when the proportion of missing data
 *   exceeds 5% of the total population.
 *
 * @param {Date} fromDate The start date of the period (will be set to the first day of its month).
 * @param {Date} toDate The end date of the period (will be set to the last day of its month).
 * @return {Object} An object containing the calculated statistics, structured by month and day.
 */
function calculateDayStatistics(fromDate, toDate) {

  // Build intermediate date map
  fromDate.setDate(1)
  toDate.setMonth(toDate.getMonth() + 1, 0)
  const dateMap = {};
  forEachDayInRange(fromDate, toDate, d => {
    dateMap[d] = Object.fromEntries(selectedCountries.map(country => [country, {
      onHoliday: {nationwide: false, regions: new Set()},
      nationalPublicHoliday: false,
      holidays: {},
    }]))
  });
  const years = [];
  for (let y = fromDate.getFullYear(); y <= toDate.getFullYear(); ++y) years.push(y);
  const missingData = {};


  // Fill map by aggregating holiday information per country
  for (const country of selectedCountries) {
    const publicHolidays = years.map(year => cachedData[year][country].holidays).flat();
    const schoolHolidays = years.map(year => cachedData[year][country].schoolHolidays).flat();

    // Add holidays
    for (const [type, holidays] of [
      [i18n.publicHoliday, publicHolidays],
      [i18n.schoolHoliday, schoolHolidays]
    ]) {
      for (const h of holidays) {

        const label = h.name?.[0]?.text || type;
        forEachDayInRange(h.startDate, h.endDate, d => {
          if (!dateMap[d]) return;
          const infoset = dateMap[d][country];

          if (!infoset.holidays[label]) {
            infoset.holidays[label] = {type: type, regions: new Set(), nationwide: false};
          }

          if (h.nationwide) {
            infoset.onHoliday.nationwide = true;
            infoset.holidays[label].nationwide = true;
            if (type === i18n.publicHoliday) infoset.nationalPublicHoliday = true;
          } else {
            h.regions.forEach(region => {
              if(populationData[country].regions[region]) {
                infoset.onHoliday.regions.add(region);
                infoset.holidays[label].regions.add(region);
              }
            });
          }
        });
      }
    }

    // Check for incomplete data for this country
    missingData[country] = {
      missingAllDates: {
        nationwide: publicHolidays.length === 0 || schoolHolidays.length === 0,
        regions: new Set()
      },
      missingAfterDate: {
        nationwide: maxDate(schoolHolidays.map(f => f.endDate)),
        regions: {}
      },
    };
    Object.keys(populationData[country].regions).forEach(region => {
      const regionalSchoolHolidays = schoolHolidays.filter(h => h.nationwide || h.regions.has(region));
      if (regionalSchoolHolidays.length === 0) missingData[country].missingAllDates.regions.add(region);
      missingData[country].missingAfterDate.regions[region] = maxDate(regionalSchoolHolidays.map(f => f.endDate));
    });

  }


  // Calculate day statistics and generate tooltips
  const stats = {};
  const countryNames = Object.fromEntries(selectedCountries.map(country => [country, formatCountryName(country)]))
  const countryPopulation = Object.fromEntries(selectedCountries.map(
    country => [country, Object.values(populationData[country].regions).sum()]));
  const totalPopulation = Object.values(countryPopulation).sum();

  forEachDayInRange(fromDate, toDate, d => {

    let holidayPopulationSum = 0;
    let nationalPublicHolidayAny = false;
    const tooltip = [];
    const incompleteData = new Set();
    let incompletePopulationSum = 0;
    for (let country in dateMap[d]) {

      // holiday population
      const infoset = dateMap[d][country];
      const holidayPopulation = infoset.onHoliday.nationwide ? countryPopulation[country]
        : [...infoset.onHoliday.regions].map(c => populationData[country].regions[c] || 0).sum();
      holidayPopulationSum += holidayPopulation;
      nationalPublicHolidayAny |= infoset.nationalPublicHoliday;

      // infos for tooltip
      if (holidayPopulation > 0) {
        if (selectedCountries.length > 1) {
          tooltip.push(`\n<span class="tooltip-country">${countryNames[country]}: ${formatPopulation(holidayPopulation, countryPopulation[country])}</span>`);
        }
        for (const [label, info] of Object.entries(infoset.holidays)) {
          if (info.nationwide || info.regions.size > 0) {
            const regionText = i18n.in + " " + formatRegionNames(country, info.regions);
            tooltip.push(`${label} <span class="tooltip-info">(${info.type} ${info.nationwide ? i18n.nationwide : regionText})</span>`)
          }
        }
      }

      // incomplete data
      if (!infoset.onHoliday.nationwide) {
        if (missingData[country].missingAllDates.nationwide || d > missingData[country].missingAfterDate.nationwide) {
          incompleteData.add(countryNames[country])
          incompletePopulationSum += countryPopulation[country];
        } else {
          const missingRegions = new Set(missingData[country].missingAllDates.regions);
          Object.keys(missingData[country].missingAfterDate.regions).forEach(region => {
            if (d > missingData[country].missingAfterDate.regions[region]) missingRegions.add(region)
          });
          if (missingRegions.size > 0) {
            incompleteData.add(`${countryNames[country]} (${formatRegionNames(country, missingRegions)})`)
            incompletePopulationSum += [...missingRegions].map(c => populationData[country].regions[c] || 0).sum();
          }
        }
      }

    }

    // Tooltip text
    let tooltipText = "";
    if (holidayPopulationSum > 0){
      tooltipText += `<span class="tooltip-title">${formatPopulation(holidayPopulationSum, totalPopulation)}</span>\n`;
      tooltipText += tooltip.join("\n");
    } else {
      tooltipText += `<span class="tooltip-title">${i18n.noHoliday}</span>`;
    }
    if (incompleteData.size > 0) {
      tooltipText += `\n\n<span class="warning warning-title">${i18n.incompleteData}: ${formatPopulation(incompletePopulationSum, totalPopulation)}</span>`
      tooltipText += `\n<span class="warning">${[...incompleteData].join(", ")}</span>`;
    }

    const [mKey, dKey] = dateKey(d);
    stats[mKey] = stats[mKey] || {};
    stats[mKey][dKey] = {
      fraction: holidayPopulationSum / totalPopulation,
      nationalPH: nationalPublicHolidayAny || d.getDay() === 0, // or Sunday
      tooltip: tooltipText,
      incomplete: incompletePopulationSum / totalPopulation >= 0.05, // Highlight if error above 5%
    }

  })

  return stats;

}

Object.defineProperty(Array.prototype, "sum", {
  value: function() {
    return this.reduce((a, b) => a + b, 0);
  },
  enumerable: false
});


// ------------------------------------------------------------
// Kalenderdarstellung
/**
 * Renders a calendar view based on the supplied statistics data.
 *
 * For each month key in the `stats` object, the function creates a month section,
 * builds a table with day cells, and applies visual styling and tooltips based
 * on the daily statistics. Empty cells are added for days before the first day
 * of the month to align the calendar correctly. Incomplete data cells are
 * displayed with a repeating diagonal pattern and reduced opacity.
 *
 * @param {Object<string, Object<string, {fraction?: number, incomplete?: boolean, nationalPH?: boolean, tooltip?: string}>>} stats
 *   An object where keys are month identifiers (ISO date strings like
 *   `"2024-01"`). Each month key maps to another object whose keys are
 *   day identifiers (e.g., `"2024-01-01"`) and values are statistic
 *   objects. The statistic object may include:
 *   - `fraction` (number): a metric used to determine background color.
 *   - `incomplete` (boolean): if true, the cell receives a repeating
 *     diagonal pattern and reduced opacity.
 *   - `nationalPH` (boolean): if true, the cell's text is displayed in bold.
 *   - `tooltip` (string): text shown in a tooltip when the cell is hovered.
 *
 * @return {void}
 */
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
    new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    let row = document.createElement("tr");

    let dayOfWeek = (firstDay.getDay() + 6) % 7; // Montag=0
    for (let i = 0; i < dayOfWeek; i++) {
      row.appendChild(document.createElement("td"));
    }

    for (const day of Object.keys(stats[month])) {
      const dayStat = stats[month][day]
      const date = new Date(day);
      const cell = document.createElement("td");
      cell.textContent = date.getDate();
      cell.dataset.code = day;

      if (dayStat) {
        const fraction = dayStat.fraction || 0;
        cell.style.background = densityColor(fraction);
        if (dayStat.incomplete) {
          cell.style.background = `repeating-linear-gradient(-45deg, ${cell.style.background}, ${cell.style.background} 8px, transparent 8px, transparent 10px)`;
          cell.style.opacity = 0.8;
        }
        cell.style.fontWeight = dayStat.nationalPH ? "bold" : "regular";

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



/**
 * Iterates over a range of dates from the specified start date to the end date (inclusive),
 * invoking a callback function for each date in the range.
 *
 * @param {Date} fromDate - The starting date of the iteration range, inclusive.
 * @param {Date} toDate - The ending date of the iteration range, inclusive.
 * @param {function(Date): void} callback - A callback function to be executed for each date in the range. Receives the current date as an argument.
 * @return {void}
 */
function forEachDayInRange(fromDate, toDate, callback){
  for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
    d.setHours(0, 0, 0, 0);
    callback(d);
  }
}

/**
 * Converts a Date object into a key consisting of year‑month and full date strings.
 *
 * @param {Date} date - The date to be processed.
 * @return {Array<string>} An array where the first element is the 'YYYY-MM' portion and the second element is the full 'YYYY-MM-DD' date string.
 */
function dateKey(date) {
  const key = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000).toISOString().split("T")[0];
  return [key.slice(0, 7), key]
}

/**
 * Returns the most recent date from the provided array.
 *
 * @param {Array.<string|Date>} dates An array of dates, each of which can be a
 *        string in a format parseable by the Date constructor or a Date
 *        object.
 * @return {Date} The latest date represented by the maximum timestamp in the
 *         array.
 */
function maxDate(dates) {
  let max = -Infinity;
  for (let date of dates) {
    let t = date.getTime();
    if (t > max) max = t;
  }
  return new Date(max);
}


/**
 * Formats a population number into a string representation in millions, optionally including
 * the percentage of a total population.
 *
 * @param {number} number - The population count to format.
 * @param {number} [total] - The total population against which to calculate the percentage.
 * @return {string} A formatted string such as "3.4 mioResidents" or "3.4 mioResidents (45%)".
 */
function formatPopulation(number, total=undefined){
  let result = `${(number / 1e6).toFixed(number > 1e6 ? 1 : 2)} ${i18n.mioResidents}`
  if (total !== undefined) result += ` (${(100 * number / total).toFixed(0)}%)`;
  return result;
}

/**
 * Retrieves the display name of a country based on its ISO 3166-1 alpha-2 code.
 *
 * @param {string} code - The ISO 3166-1 alpha-2 country code (e.g., "US" for the United States).
 * @return {string} The localized display name of the country corresponding to the provided code.
 */
function formatCountryName(code) {
  return new Intl.DisplayNames([locale], {type: "region"}).of(code);
}

/**
 * Formats a list of region codes into a sorted, comma-separated string of region names for a given country.
 *
 * @param {string} country - The country code used to look up region names.
 * @param {Array<string>} regions - An array of region codes to be formatted.
 * @return {string} A comma-separated string of formatted and sorted region names.
 */
function formatRegionNames(country, regions) {
  return [...regions].map(r => cachedData.RegionNames[country][r]).toSorted().join(", ")
}

/**
 * Generates an HSL color string based on a density factor.
 *
 * The input `factor` is clamped between 0 and 1. A value of 0 results in a hue of 120° (green),
 * while a value of 1 yields a hue of 0° (red). Values between 0 and 1 produce a linear
 * interpolation between these hues. Saturation is fixed at 70%. Lightness is set to 60% in
 * light mode and 35% in dark mode, as detected via `prefers-color-scheme`.
 *
 * @param {number} factor - The density factor, clamped between 0 and 1.
 * @return {string} An HSL color string in the format `hsl(hue,70%,lightness%)`.
 */
function densityColor(factor) {
  const f = Math.min(Math.max(factor, 0), 1);
  //return `color-mix(in hsl shorter hue, #F44336 ${100*f}%, #4CAF50)`;
  const isDarkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return `hsl(${f > 0 ? 100 - 100 * f : 120},70%,${isDarkMode ? 35 : 60}%)`;

}

/**
 * Asynchronously initializes internationalization settings for the application.
 *
 * The function determines the user's locale (defaulting to the browser's language
 * or falling back to English), sets the `<html>` `lang` attribute, updates the
 * display names of country codes, and, for non‑German locales, loads a JSON
 * translation file and applies the translations to elements marked with
 * `data-i18n` attributes.
 *
 * If the translation file cannot be fetched, an `Error` is thrown.
 *
 * @returns {Promise<void>} A promise that resolves once the i18n setup is
 * completed. If loading the translation file fails, the promise is rejected
 * with an error.
 */
async function i18ninit() {
  locale = (locale || navigator.language?.split("-")[0]).toLowerCase()
  if (locale !== "de") locale = "en";
  document.getElementsByTagName("html")[0].lang = locale;
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
