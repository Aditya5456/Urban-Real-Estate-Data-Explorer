# Urban Real Estate Data Explorer

A Flask and vanilla JavaScript website for browsing housing data and exploring price trends, property features, and neighborhood patterns with interactive charts and summaries. It focuses on data exploration rather than price predictions.

## Run locally

Windows:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python app.py
```

Or launch `run.bat`. On macOS/Linux:

```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python app.py
```

Open http://127.0.0.1:5000. If that port is occupied, set `PORT=5051` before running the app and open http://127.0.0.1:5051. Plotly charts and the web fonts are loaded from CDNs; the Flask app and analysis run locally.

## Dataset

The website starts with `data/train_sample.csv`, a 60-row sample from the Kaggle House Prices training data. Upload the full `train.csv` from the [Kaggle competition page](https://www.kaggle.com/c/5407/data) to explore all 1,460 rows and 81 columns. The full local copy at `data/train.csv` is optional and excluded from Git.

## Website features

- CSV upload, validation, searchable row preview, and reset to the bundled sample
- Dataset profile, feature types, missing values, duplicate count, and category counts
- Easy-to-scan summaries of typical values, spread, and range
- Numeric distributions, category frequencies, and missing-value visualizations
- Relationship maps and side-by-side feature comparisons
- Trend line fitting with adjustable detail
- Dataset-derived findings that update when the dataset changes

## API

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/upload` | POST | Upload a CSV using the `file` form field |
| `/api/reset` | POST | Restore the bundled sample |
| `/api/overview` | GET | Dataset shape, types, missing values, and features |
| `/api/rows` | GET | Searchable, paginated row preview |
| `/api/statistics` | GET | Numeric summary statistics |
| `/api/missing-values` | GET | Missing counts and percentages |
| `/api/distribution?feature=...` | GET | Numeric feature distribution |
| `/api/categories?feature=...` | GET | Most frequent categories |
| `/api/scatter?x=...&y=...` | GET | Paired feature values and relationship score |
| `/api/correlation` | GET | Feature relationship map and ranking |
| `/api/covariance` | GET | How selected feature values move together |
| `/api/quantiles?feature=...` | GET | Typical range and value spread |
| `/api/polynomial?x=...&y=...&degree=2` | GET | Trend line and fit score |

## Project files

```text
app.py                 Flask application and analysis API
templates/index.html   Website structure
static/css/style.css   Website styling
static/js/script.js    Browser interactions and charts
data/train_sample.csv  Bundled starter dataset
data/train.csv         Optional full local dataset (Git-ignored)
requirements.txt       Python dependencies
run.bat / run.sh       Local launch scripts
```
