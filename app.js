
/* ==========================================
   FIELDWISE - SMART FARMING ANALYTICS
   DASHBOARD JAVASCRIPT
========================================== */


/* API CONFIGURATION */

const API_BASE_URL = window.FIELDWISE_API_URL || "";


/* CHART INSTANCES */

let productionChart = null;
let rainfallChart = null;
let predictionChart = null;
let cropChart = null;


/* DOM ELEMENTS */

const stateFilter = document.getElementById("stateFilter");
const districtFilter = document.getElementById("districtFilter");
const cropFilter = document.getElementById("cropFilter");
const resetFilters = document.getElementById("resetFilters");

const statusElement = document.getElementById("status");

const totalObservations =
    document.getElementById("totalObservations");

const averageProduction =
    document.getElementById("averageProduction");

const averageRainfall =
    document.getElementById("averageRainfall");

const cropCount =
    document.getElementById("cropCount");

const districtDataNote =
    document.getElementById("districtDataNote");

const forecastNote =
    document.getElementById("forecastNote");


/* CHART COLORS */

const COLORS = {
    green: "#238b45",
    lightGreen: "#75b85b",
    paleGreen: "rgba(35, 139, 69, 0.12)",
    orange: "#e6a23c",
    blue: "#4b8fca",
    grey: "#718176",
    grid: "#e8eee7"
};


/* COMMON CHART OPTIONS */

function commonChartOptions(title, unit) {

    return {
        responsive: true,
        maintainAspectRatio: false,

        interaction: {
            intersect: false,
            mode: "index"
        },

        plugins: {
            legend: {
                display: true,
                position: "bottom",

                labels: {
                    usePointStyle: true,
                    padding: 20,
                    font: {
                        family: "DM Sans",
                        size: 11
                    }
                }
            },

            tooltip: {
                backgroundColor: "#203528",
                padding: 12,
                cornerRadius: 8,

                callbacks: {
                    label: function(context) {
                        return `${context.dataset.label}: ${
                            context.parsed.y ?? "N/A"
                        } ${unit}`;
                    }
                }
            }
        },

        scales: {
            x: {
                grid: {
                    display: false
                },

                ticks: {
                    font: {
                        family: "DM Sans",
                        size: 11
                    }
                }
            },

            y: {
                beginAtZero: true,

                grid: {
                    color: COLORS.grid
                },

                ticks: {
                    font: {
                        family: "DM Sans",
                        size: 11
                    }
                },

                title: {
                    display: true,
                    text: unit
                }
            }
        }
    };
}


/* STATUS MESSAGE */

function setStatus(message, type = "success") {

    if (!statusElement) return;

    statusElement.textContent = message;

    if (type === "error") {
        statusElement.style.background = "#fff0ef";
        statusElement.style.color = "#b42318";
    } else {
        statusElement.style.background = "#e8f5eb";
        statusElement.style.color = "#176b35";
    }
}


/* FORMAT NUMBERS */

function formatNumber(value, digits = 2) {

    if (value === null || value === undefined ||
        !Number.isFinite(Number(value))) {
        return "--";
    }

    return Number(value).toLocaleString("en-IN", {
        maximumFractionDigits: digits
    });
}


/* FETCH API DATA */

async function fetchJSON(url) {

    const response = await fetch(url, {
        method: "GET",
        headers: {
            "Accept": "application/json"
        },
        cache: "no-store"
    });

    if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
    }

    return await response.json();
}


/* LOAD DISTRICTS AND CROPS */

async function loadLocations() {

    try {

        const data = await fetchJSON(
            `${API_BASE_URL}/api/health`
        );

        if (!data.dataset_loaded) {
            throw new Error(
                data.dataset_error || "Dataset could not be loaded."
            );
        }

        populateSelect(
            districtFilter,
            data.districts || [],
            "All Districts"
        );

        populateSelect(
            cropFilter,
            data.crops || [],
            "All Crops"
        );

        setStatus(
            `Connected successfully. ${formatNumber(data.total_records, 0)} dataset records available.`
        );

    } catch (error) {

        console.error("Location loading error:", error);

        setStatus(
            `Unable to load dataset: ${error.message}`,
            "error"
        );
    }
}


/* POPULATE DROPDOWN */

function populateSelect(element, items, defaultText) {

    if (!element) return;

    const previousValue = element.value;

    element.innerHTML = "";

    const defaultOption = document.createElement("option");

    defaultOption.value = "";
    defaultOption.textContent = defaultText;

    element.appendChild(defaultOption);

    [...new Set(items)]
        .filter(item => item !== null && item !== undefined)
        .sort((a, b) => String(a).localeCompare(String(b)))
        .forEach(item => {

            const option = document.createElement("option");

            option.value = item;
            option.textContent = item;

            element.appendChild(option);
        });

    if (items.includes(previousValue)) {
        element.value = previousValue;
    }
}


/* BUILD DASHBOARD URL */

function buildDashboardURL() {

    const params = new URLSearchParams();

    params.set(
        "state",
        stateFilter?.value || "Telangana"
    );

    params.set(
        "district",
        districtFilter?.value || ""
    );

    params.set(
        "crop",
        cropFilter?.value || ""
    );

    return `${API_BASE_URL}/api/dashboard?${params.toString()}`;
}


/* LOAD DASHBOARD */

async function loadDashboard() {

    setStatus("Updating agricultural dashboard...");

    try {

        const data = await fetchJSON(buildDashboardURL());

        if (data.error) {
            throw new Error(data.error);
        }

        updateMetrics(data);
        updateHistoricalCharts(data);
        updatePredictionChart(data);
        updateCropChart(data);
        updateInformation(data);

        setStatus(
            data.message || "Dashboard updated successfully."
        );

    } catch (error) {

        console.error("Dashboard loading error:", error);

        setStatus(
            `Unable to update dashboard: ${error.message}`,
            "error"
        );
    }
}


/* UPDATE KPI METRICS */

function updateMetrics(data) {

    if (totalObservations) {
        totalObservations.textContent =
            formatNumber(data.observations, 0);
    }

    if (averageProduction) {
        averageProduction.textContent =
            formatNumber(data.average_production);
    }

    if (averageRainfall) {
        averageRainfall.textContent =
            formatNumber(data.average_rainfall);
    }

    if (cropCount) {
        cropCount.textContent =
            formatNumber(data.crop_count, 0);
    }
}


/* UPDATE HISTORICAL CHARTS */

function updateHistoricalCharts(data) {

    const years = data.years || [];

    const aiProduction = data.ai_historical || data.production || [];
    const traditionalProduction =
        data.traditional_historical || [];

    const rainfall = data.rainfall_by_year || [];


    /* PRODUCTION CHART */

    const productionCanvas =
        document.getElementById("productionChart");

    if (productionCanvas) {

        if (productionChart) {
            productionChart.destroy();
        }

        productionChart = new Chart(
            productionCanvas,
            {
                type: "line",

                data: {
                    labels: years,

                    datasets: [
                        {
                            label: "AI Production",

                            data: aiProduction,

                            borderColor: COLORS.green,
                            backgroundColor: COLORS.paleGreen,

                            fill: true,
                            tension: 0.35,

                            borderWidth: 3,

                            pointRadius: 5,
                            pointHoverRadius: 7
                        },

                        {
                            label: "Traditional Production",

                            data: traditionalProduction,

                            borderColor: COLORS.orange,
                            backgroundColor: "rgba(230,162,60,0.08)",

                            fill: false,
                            tension: 0.35,

                            borderWidth: 2,

                            pointRadius: 4
                        }
                    ]
                },

                options: commonChartOptions(
                    "Historical Production",
                    "Tonnes/hectare"
                )
            }
        );
    }


    /* RAINFALL CHART */

    const rainfallCanvas =
        document.getElementById("rainfallChart");

    if (rainfallCanvas) {

        if (rainfallChart) {
            rainfallChart.destroy();
        }

        rainfallChart = new Chart(
            rainfallCanvas,
            {
                type: "bar",

                data: {
                    labels: years,

                    datasets: [
                        {
                            label: "Rainfall",

                            data: rainfall,

                            backgroundColor: COLORS.blue,

                            borderRadius: 7,

                            maxBarThickness: 55
                        }
                    ]
                },

                options: commonChartOptions(
                    "Annual Rainfall",
                    "mm"
                )
            }
        );
    }
}


/* AI VS TRADITIONAL PREDICTIONS */

function updatePredictionChart(data) {

    const canvas =
        document.getElementById("predictionChart");

    if (!canvas) return;

    if (predictionChart) {
        predictionChart.destroy();
    }

    const years = data.forecast_years || [2027, 2028, 2029];

    const aiPredictions = data.ai_predictions || [];
    const traditionalPredictions =
        data.traditional_predictions || [];

    predictionChart = new Chart(
        canvas,
        {
            type: "bar",

            data: {
                labels: years,

                datasets: [
                    {
                        label: "AI Prediction",

                        data: aiPredictions,

                        backgroundColor: COLORS.green,

                        borderRadius: 7,

                        maxBarThickness: 55
                    },

                    {
                        label: "Traditional Prediction",

                        data: traditionalPredictions,

                        backgroundColor: COLORS.orange,

                        borderRadius: 7,

                        maxBarThickness: 55
                    }
                ]
            },

            options: {
                ...commonChartOptions(
                    "Production Forecast",
                    "Tonnes/hectare"
                ),

                plugins: {
                    ...commonChartOptions(
                        "Production Forecast",
                        "Tonnes/hectare"
                    ).plugins,

                    legend: {
                        display: false
                    }
                },

                scales: {
                    ...commonChartOptions(
                        "Production Forecast",
                        "Tonnes/hectare"
                    ).scales,

                    y: {
                        beginAtZero: true,

                        grid: {
                            color: COLORS.grid
                        },

                        title: {
                            display: true,
                            text: "Tonnes/hectare"
                        }
                    }
                }
            }
        }
    );
}


/* CROP DISTRIBUTION CHART */

function updateCropChart(data) {

    const canvas =
        document.getElementById("cropChart");

    if (!canvas) return;

    if (cropChart) {
        cropChart.destroy();
    }

    const crops = data.crops || [];
    const counts = data.crop_counts || [];

    cropChart = new Chart(
        canvas,
        {
            type: "bar",

            data: {
                labels: crops,

                datasets: [
                    {
                        label: "Crop Records",

                        data: counts,

                        backgroundColor: [
                            "#238b45",
                            "#75b85b",
                            "#e6a23c",
                            "#4b8fca",
                            "#9b7acb",
                            "#d47b91"
                        ],

                        borderRadius: 7,

                        maxBarThickness: 55
                    }
                ]
            },

            options: {
                ...commonChartOptions(
                    "Crop Distribution",
                    "Records"
                ),

                plugins: {
                    ...commonChartOptions(
                        "Crop Distribution",
                        "Records"
                    ).plugins,

                    legend: {
                        display: false
                    }
                }
            }
        }
    );
}


/* UPDATE DATA INFORMATION */

function updateInformation(data) {

    if (districtDataNote && data.district_data_note) {
        districtDataNote.textContent =
            data.district_data_note;
    }

    if (forecastNote && data.data_warning) {
        forecastNote.textContent =
            data.data_warning;
    }
}


/* RESET FILTERS */

function resetDashboardFilters() {

    if (stateFilter) {
        stateFilter.value = "Telangana";
    }

    if (districtFilter) {
        districtFilter.value = "";
    }

    if (cropFilter) {
        cropFilter.value = "";
    }

    loadDashboard();
}


/* EVENT LISTENERS */

function setupEventListeners() {

    if (stateFilter) {
        stateFilter.addEventListener(
            "change",
            loadDashboard
        );
    }

    if (districtFilter) {
        districtFilter.addEventListener(
            "change",
            loadDashboard
        );
    }

    if (cropFilter) {
        cropFilter.addEventListener(
            "change",
            loadDashboard
        );
    }

    if (resetFilters) {
        resetFilters.addEventListener(
            "click",
            resetDashboardFilters
        );
    }
}


/* INITIALIZE APPLICATION */

async function initializeFieldwise() {

    setupEventListeners();

    await loadLocations();

    await loadDashboard();

}


/* START APPLICATION */

document.addEventListener(
    "DOMContentLoaded",
    initializeFieldwise
);
