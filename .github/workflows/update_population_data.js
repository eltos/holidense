#!/usr/bin/env node

import fs from 'fs';

const SRC = "Eurostat";
const URL = "https://ec.europa.eu/eurostat/databrowser/view/demo_r_gind3/default/table";
const API  = "https://ec.europa.eu/eurostat/api/dissemination/sdmx/3.0/data/dataflow/ESTAT/demo_r_gind3$defaultview/1.0?compress=false&format=json";

const subdivisionMapping = {
  AT: {
    "AT-BL": "AT11", // Burgenland
    "AT-KÄ": "AT21", // Kärnten
    "AT-NÖ": "AT12", // Niederösterreich
    "AT-OÖ": "AT31", // Oberösterreich
    "AT-SB": "AT32", // Salzburg
    "AT-SM": "AT22", // Steiermark
    "AT-TI": "AT33", // Tirol
    "AT-VA": "AT34", // Vorarlberg
    "AT-WI": "AT13", // Wien
  },
  CH: {
    "CH-VD": "CH011", // Vaud
    "CH-VS": "CH012", // Valais / Wallis
    "CH-GE": "CH013", // Genève
    "CH-BE": "CH021", // Bern / Berne
    "CH-FR": "CH022", // Fribourg / Freiburg
    "CH-SO": "CH023", // Solothurn
    "CH-NE": "CH024", // Neuchâtel
    "CH-JU": "CH025", // Jura
    "CH-BS": "CH031", // Basel-Stadt
    "CH-BL": "CH032", // Basel-Landschaft
    "CH-AG": "CH033", // Aargau
    "CH-ZH": "CH040", // Zürich
    "CH-GL": "CH051", // Glarus
    "CH-SH": "CH052", // Schaffhausen
    "CH-AR": "CH053", // Appenzell Ausserrhoden
    "CH-AI": "CH054", // Appenzell Innerrhoden
    "CH-SG": "CH055", // St. Gallen
    "CH-GR": "CH056", // Graubünden / Grigioni / Grischun
    "CH-TG": "CH057", // Thurgau
    "CH-LU": "CH061", // Luzern
    "CH-UR": "CH062", // Uri
    "CH-SZ": "CH063", // Schwyz
    "CH-OW": "CH064", // Obwalden
    "CH-NW": "CH065", // Nidwalden
    "CH-ZG": "CH066", // Zug
    "CH-TI": "CH070", // Ticino
  },
  CZ: {
    "CZ-JC": "CZ031", // Südböhmische Region / Jihočeský kraj
    "CZ-JM": "CZ064", // Südmährische Region / Jihomoravský kraj
    "CZ-KA": "CZ041", // Karlsbader Region / Karlovarský kraj
    "CZ-KR": "CZ052", // Königgrätzer Region / Královéhradecký kraj
    "CZ-LI": "CZ051", // Reichenberger Region / Liberecký kraj
    "CZ-MO": "CZ080", // Mährisch-Schlesische Region / Moravskoslezský kraj
    "CZ-OL": "CZ071", // Olmützer Region / Olomoucký kraj
    "CZ-PA": "CZ053", // Pardubitzer Region / Pardubický kraj
    "CZ-PL": "CZ032", // Pilsner Region / Plzeňský kraj
    "CZ-PR": "CZ010", // Prag / Hlavní město Praha
    "CZ-ST": "CZ020", // Mittelböhmische Region / Středočeský kraj
    "CZ-US": "CZ042", // Aussiger Regio / Ústecký kraj
    "CZ-VY": "CZ063", // Region Hochland / Kraj Vysočina
    "CZ-ZL": "CZ072", // Zliner Region / Zlínský kraj
  },
  DE: {
    "DE-BW": "DE1", // Baden-Württemberg
    "DE-BY": "DE2", // Bayern
    "DE-BE": "DE3", // Berlin
    "DE-BB": "DE4", // Brandenburg
    "DE-HB": "DE5", // Bremen
    "DE-HH": "DE6", // Hamburg
    "DE-HE": "DE7", // Hessen
    "DE-MV": "DE8", // Mecklenburg-Vorpommern
    "DE-NI": "DE9", // Niedersachsen
    "DE-NW": "DEA", // Nordrhein-Westfalen
    "DE-RP": "DEB", // Rheinland-Pfalz
    "DE-SL": "DEC", // Saarland
    "DE-SN": "DED", // Sachsen
    "DE-ST": "DEE", // Sachsen-Anhalt
    "DE-SH": "DEF", // Schleswig-Holstein
    "DE-TH": "DEG", // Thüringen
  },
  FR: {
    "FR-AR": "FRK", // Auvergne-Rhône-Alpes
    "FR-BF": "FRC", // Bourgogne-Franche-Comté
    "FR-BT": "FRH", // Bretagne
    "FR-CV": "FRB", // Centre — Val de Loire
    "FR-CO": "FRM", // Corse
    "FR-GE": "FRF", // Grand Est
    "FR-HF": "FRE", // Hauts-de-France
    "FR-IF": "FR1", // Ile de France
    "FR-NO": "FRD", // Normandie
    "FR-NA": "FRI", // Nouvelle-Aquitaine
    "FR-OC": "FRJ", // Occitanie
    "FR-PL": "FRG", // Pays de la Loire
    "FR-PC": "FRL", // Provence-Alpes-Côte d’Azur
  },
  LU: {
    "*": "LU",
  },
  PL: {
    "PL-MA": "PL21", // Małopolskie
    "PL-SK": "PL22", // Śląskie
    "PL-WP": "PL41", // Wielkopolskie
    "PL-ZP": "PL42", // Zachodniopomorskie
    "PL-LU": "PL43", // Lubuskie
    "PL-DS": "PL51", // Dolnośląskie
    "PL-OP": "PL52", // Opolskie
    "PL-KP": "PL61", // Kujawsko-pomorskie
    "PL-WN": "PL62", // Warmińsko-mazurskie
    "PL-PM": "PL63", // Pomorskie
    "PL-LD": "PL71", // Łódzkie
    "PL-SL": "PL72", // Świętokrzyskie
    "PL-LB": "PL81", // Lubelskie
    "PL-PD": "PL82", // Podkarpackie
    "PL-PK": "PL84", // Podlaskie
    "PL-MZ": ["PL91", "PL92"], // Warszawski stołeczny + Mazowiecki regionalny
  }
};


async function fetchEurostatData() {
  const response = await fetch(API);
  return await response.json();
}

/**
 * Retrieves the population value based on the specified data, geographical area, and time.
 *
 * @param {Object} data - The dataset containing population data, dimensions, and categories.
 * @param {string} geo - The geographical identifier used to filter the population data.
 * @param {string} time - The time identifier used to filter the population data.
 * @return {number} The population value corresponding to the specified geo and time.
 */
function getPopulation(data, geo, time){
  let dimenValue = data.size.map((_, i) => data.size.slice(i + 1).reduce((p, v) => p * v, 1))
  let dimenIdKey = data.id.map(id => [id, id === "geo" ? geo : id === "time" ? time : Object.keys(data.dimension[id].category.index)[0]]);
  let dimenIndex = dimenIdKey.map(([id, key]) => data.dimension[id].category.index[key]);
  let index = dimenIndex.reduce((sum, index, i) => sum + index * dimenValue[i], 0);
  let value = data.value[index];
  console.log(" " + geo + ": " + String(value).padStart(8, ' ') + "  // [" + index + "] = [" +  dimenIdKey.map(([id, key]) => data.dimension[id].category.label[key]).join(" / ") + "]");
  return value;
}

/**
 * Updates the provided population data for a set of countries using data fetched from Eurostat.
 * Each country's population data is updated with source information, a reference URL, the most recent year's data,
 * and calculated population values for subdivisions based on a predefined mapping.
 *
 * @param {Object} populationData - An object where each key is a country code, and the value is the population data for that country.
 * @return {Promise<void>} A promise that resolves when the population data update process is complete.
 */
async function updatePopulationData(populationData) {
  const data = await fetchEurostatData();
  let year = Math.max(...Object.keys(data.dimension.time.category.index).map(Number));

  for (let country in populationData) {
    if (country in subdivisionMapping) {
      populationData[country].source = SRC;
      populationData[country].url = URL;
      populationData[country].date = year + "-01-01";
      populationData[country].subdivisions = Object.fromEntries(
        Object.entries(subdivisionMapping[country]).map(([region, geos]) => {
          if (!Array.isArray(geos)) geos = [geos];
          return [region, geos.map(geo => getPopulation(data, geo, year)).reduce((a, b) => a + b, 0)]
        }));
    }
  }

}

/**
 * Updates the population data file by reading its current contents, updating the data,
 * and writing the updated data back to the file.
 *
 * @param {string} filename - The name of the file containing the population data to be updated.
 * @return {Promise<void>} A promise that resolves when the file has been successfully updated.
 */
async function updatePopulationDataFile(filename) {
  const populationData = JSON.parse(fs.readFileSync(filename, 'utf8'));
  await updatePopulationData(populationData);
  fs.writeFileSync(filename, JSON.stringify(populationData, null, 2), 'utf8');
}




// Main

await updatePopulationDataFile('../../population.json');


