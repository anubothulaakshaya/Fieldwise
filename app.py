
import csv
import json
import os
import re
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "smart_farming_analytics.csv"

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

FORECAST_YEARS = [2027, 2028, 2029]
STATE = "Telangana"

COLUMNS = {
    "year": "Year",
    "region": "Region",
    "district": "District",
    "crop": "Crop",
    "rain": "Rain_mm",
    "ai_min": "AI_Min_Production_t/ha",
    "ai_max": "AI_Max_Production_t/ha",
    "tr_min": "Traditional_Min_Production_t/ha",
    "tr_max": "Traditional_Max_Production_t/ha",
}


def number(value):
    try:
        cleaned = re.sub(r"[^0-9.\-]", "", str(value or ""))
        return float(cleaned) if cleaned else None
    except (ValueError, TypeError):
        return None


def average(values):
    valid = [v for v in values if v is not None]
    return round(sum(valid) / len(valid), 2) if valid else None


def midpoint(row, minimum_column, maximum_column):
    minimum = number(row.get(minimum_column))
    maximum = number(row.get(maximum_column))

    if minimum is None or maximum is None:
        return None

    return (minimum + maximum) / 2


def load_data():
    if not DATA.exists():
        return [], f"Dataset not found: {DATA.name}"

    with DATA.open(encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        rows = list(reader)
        available_columns = reader.fieldnames or []

    required = [
        column for column in COLUMNS.values()
        if column not in available_columns
    ]

    if required:
        return [], "Missing CSV columns: " + ", ".join(required)

    return rows, None


ROWS, DATA_ERROR = load_data()

TELANGANA_ROWS = [
    row for row in ROWS
    if (row.get(COLUMNS["region"]) or "").strip().lower()
    == "telangana"
]

DISTRICTS = sorted({
    row[COLUMNS["district"]].strip()
    for row in TELANGANA_ROWS
    if row.get(COLUMNS["district"])
})

CROPS = sorted({
    row[COLUMNS["crop"]].strip()
    for row in TELANGANA_ROWS
    if row.get(COLUMNS["crop"])
})


def predict_trend(yearly_values):
    points = [
        (year, value)
        for year, value in yearly_values
        if value is not None
    ]

    if len(points) < 2:
        return [None] * len(FORECAST_YEARS)

    x_values = [p[0] for p in points]
    y_values = [p[1] for p in points]

    mean_x = sum(x_values) / len(x_values)
    mean_y = sum(y_values) / len(y_values)

    denominator = sum(
        (x - mean_x) ** 2 for x in x_values
    )

    if denominator == 0:
        return [round(mean_y, 2)] * len(FORECAST_YEARS)

    slope = sum(
        (x_values[i] - mean_x) * (y_values[i] - mean_y)
        for i in range(len(points))
    ) / denominator

    intercept = mean_y - slope * mean_x

    return [
        round(max(0, intercept + slope * year), 2)
        for year in FORECAST_YEARS
    ]


def dashboard(params):
    state = params.get("state", [STATE])[0] or STATE
    district = params.get("district", [""])[0] or ""
    crop = params.get("crop", [""])[0] or ""

    rows = (
        TELANGANA_ROWS.copy()
        if state.lower() == STATE.lower()
        else []
    )

    if district:
        rows = [
            row for row in rows
            if (row.get(COLUMNS["district"]) or "").strip().lower()
            == district.strip().lower()
        ]

    if crop:
        rows = [
            row for row in rows
            if (row.get(COLUMNS["crop"]) or "").strip().lower()
            == crop.strip().lower()
        ]

    yearly = {}

    for row in rows:
        year = number(row.get(COLUMNS["year"]))

        if year is None:
            continue

        year = int(year)

        values = yearly.setdefault(
            year,
            {"ai": [], "traditional": [], "rainfall": []}
        )

        values["ai"].append(
            midpoint(row, COLUMNS["ai_min"], COLUMNS["ai_max"])
        )

        values["traditional"].append(
            midpoint(row, COLUMNS["tr_min"], COLUMNS["tr_max"])
        )

        values["rainfall"].append(
            number(row.get(COLUMNS["rain"]))
        )

    years = sorted(yearly)

    ai_historical = [
        average(yearly[year]["ai"]) for year in years
    ]

    traditional_historical = [
        average(yearly[year]["traditional"]) for year in years
    ]

    rainfall = [
        average(yearly[year]["rainfall"]) for year in years
    ]

    crops = sorted({
        row[COLUMNS["crop"]].strip()
        for row in rows
        if row.get(COLUMNS["crop"])
    })

    crop_counts = [
        sum(
            row.get(COLUMNS["crop"], "").strip() == crop_name
            for row in rows
        )
        for crop_name in crops
    ]

    return {
        "state": STATE,
        "district": district or "All Telangana",
        "observations": len(rows),
        "total_records": len(ROWS),

        "years": years,
        "production": ai_historical,
        "ai_historical": ai_historical,
        "traditional_historical": traditional_historical,
        "rainfall_by_year": rainfall,

        "forecast_years": FORECAST_YEARS,

        "ai_predictions": predict_trend(
            list(zip(years, ai_historical))
        ),

        "traditional_predictions": predict_trend(
            list(zip(years, traditional_historical))
        ),

        "average_production": average([
            midpoint(row, COLUMNS["ai_min"], COLUMNS["ai_max"])
            for row in rows
        ]),

        "average_rainfall": average([
            number(row.get(COLUMNS["rain"]))
            for row in rows
        ]),

        "crop_count": len(crops),
        "crops": crops,
        "crop_counts": crop_counts,

        "locations": {
            "states": [STATE],
            "districts": DISTRICTS
        },

        "district_data_note": (
            "District entries in this supplied dataset are replicated "
            "state-level samples, not independently observed district "
            "measurements. District filtering does not establish real "
            "district-level differences."
        ),

        "production_unit": "tonnes/hectare",
        "rainfall_unit": "mm",

        "data_warning": (
            "Forecasts are simple linear-trend estimates from available "
            "historical years, not validated machine-learning predictions."
        ),

        "message": (
            "Data loaded successfully."
            if rows else (DATA_ERROR or "No matching records found.")
        )
    }


class Handler(SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_json(self, data, status=200):
        payload = json.dumps(data).encode("utf-8")

        self.send_response(status)
        self.send_header(
            "Content-Type",
            "application/json; charset=utf-8"
        )
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

        self.wfile.write(payload)

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/dashboard":
            try:
                result = dashboard(parse_qs(parsed.query))
                self.send_json(result)
            except Exception as error:
                self.send_json({"error": str(error)}, 500)

        elif parsed.path == "/api/health":
            self.send_json({
                "status": "running",
                "dataset_loaded": not bool(DATA_ERROR),
                "dataset_error": DATA_ERROR,
                "total_records": len(ROWS),
                "total_districts": len(DISTRICTS),
                "districts": DISTRICTS,
                "crops": CROPS
            })

        else:
            super().do_GET()


if __name__ == "__main__":
    print(f"Fieldwise running at http://localhost:{PORT}")

    if DATA_ERROR:
        print("Dataset warning:", DATA_ERROR)

    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.serve_forever()
