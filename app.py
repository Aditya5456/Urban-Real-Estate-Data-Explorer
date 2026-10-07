"""Flask backend for the Urban Real Estate Data Explorer."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from flask import Flask, jsonify, render_template, request
from werkzeug.exceptions import HTTPException

BASE_DIR = Path(__file__).resolve().parent
SAMPLE_PATH = BASE_DIR / "data" / "train_sample.csv"
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 32 * 1024 * 1024


def read_csv_safely(source: Any) -> pd.DataFrame:
    try:
        frame = pd.read_csv(source, low_memory=False)
    except (pd.errors.ParserError, UnicodeDecodeError, ValueError) as exc:
        raise ValueError("The CSV could not be read. Check its delimiter, encoding, and file contents.") from exc
    if frame.empty or len(frame.columns) == 0:
        raise ValueError("The CSV is empty or has no columns.")
    for column in frame.select_dtypes(include=[np.number]).columns:
        frame[column] = frame[column].replace([np.inf, -np.inf], np.nan)
    frame.columns = [str(column).strip() for column in frame.columns]
    if any(not column for column in frame.columns):
        raise ValueError("Every column must have a name.")
    if frame.columns.duplicated().any():
        raise ValueError("The CSV contains duplicate column names. Rename them before uploading.")
    return frame


def json_value(value: Any) -> Any:
    if pd.isna(value):
        return None
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return None if not np.isfinite(value) else float(value)
    if isinstance(value, (np.bool_,)):
        return bool(value)
    return value.item() if isinstance(value, np.generic) else value


def frame_to_records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    return [{str(k): json_value(v) for k, v in row.items()} for row in frame.to_dict(orient="records")]


def numeric_columns(frame: pd.DataFrame) -> list[str]:
    return frame.select_dtypes(include=[np.number]).columns.tolist()


def get_frame() -> pd.DataFrame:
    frame = app.config.get("DATAFRAME")
    if frame is None:
        frame = read_csv_safely(SAMPLE_PATH)
        set_frame(frame, SAMPLE_PATH.name)
    return frame


def set_frame(frame: pd.DataFrame, name: str) -> None:
    app.config["DATAFRAME"] = frame
    app.config["DATASET_NAME"] = name


def error(message: str, status: int = 400):
    return jsonify({"error": message}), status


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/api/overview")
def overview():
    df = get_frame()
    nums = numeric_columns(df)
    cats = [str(c) for c in df.columns if c not in nums]
    return jsonify({
        "dataset_name": app.config.get("DATASET_NAME", SAMPLE_PATH.name),
        "rows": int(df.shape[0]), "columns": int(df.shape[1]),
        "numeric_columns": len(nums), "categorical_columns": len(cats),
        "missing_values": int(df.isna().sum().sum()),
        "duplicate_rows": int(df.duplicated().sum()),
        "numeric_features": nums, "categorical_features": cats,
        "features": [{"name": str(c), "dtype": str(df[c].dtype),
                      "missing": int(df[c].isna().sum()), "unique": int(df[c].nunique(dropna=True))}
                     for c in df.columns],
    })


@app.get("/api/rows")
def rows():
    df = get_frame()
    try:
        page = max(1, int(request.args.get("page", 1)))
        page_size = min(50, max(1, int(request.args.get("page_size", 15))))
    except ValueError:
        return error("Page and page size must be whole numbers.")
    query = request.args.get("search", "").strip()
    filtered = df
    if query:
        mask = df.astype("string").apply(lambda col: col.str.contains(query, case=False, na=False, regex=False)).any(axis=1)
        filtered = df.loc[mask]
    start = (page - 1) * page_size
    return jsonify({"columns": [str(c) for c in df.columns], "rows": frame_to_records(filtered.iloc[start:start + page_size]),
                    "page": page, "page_size": page_size, "total": int(len(filtered)),
                    "pages": max(1, int(np.ceil(len(filtered) / page_size)))})


@app.get("/api/statistics")
def statistics():
    df = get_frame()
    cols = numeric_columns(df)
    if not cols:
        return jsonify({"columns": [], "rows": []})
    rows_out = []
    for col in cols:
        s = pd.to_numeric(df[col], errors="coerce").dropna()
        if s.empty:
            continue
        rows_out.append({"feature": col, "count": int(s.count()), "mean": json_value(s.mean()),
                         "median": json_value(s.median()), "variance": json_value(s.var()),
                         "std": json_value(s.std()), "min": json_value(s.min()),
                         "q1": json_value(s.quantile(.25)), "q2": json_value(s.quantile(.5)),
                         "q3": json_value(s.quantile(.75)), "max": json_value(s.max())})
    return jsonify({"columns": ["feature", "count", "mean", "median", "variance", "std", "min", "q1", "q2", "q3", "max"], "rows": rows_out})


@app.get("/api/missing-values")
def missing_values():
    df = get_frame()
    out = [{"feature": str(c), "count": int(df[c].isna().sum()), "percent": float(df[c].isna().mean() * 100)} for c in df.columns]
    return jsonify(sorted(out, key=lambda row: (-row["count"], row["feature"])))


@app.get("/api/correlation")
def correlation():
    df = get_frame()
    nums = numeric_columns(df)
    corr = df[nums].corr() if nums else pd.DataFrame()
    target = request.args.get("target", "SalePrice")
    ranked = []
    if target in corr.columns:
        ranked = [{"feature": c, "correlation": json_value(v)} for c, v in corr[target].drop(labels=[target]).dropna().items()]
        ranked.sort(key=lambda item: abs(item["correlation"]), reverse=True)
    # Limit the plotted matrix size while preserving the strongest target relationships.
    chosen = ([target] + [r["feature"] for r in ranked[:14]]) if target in corr.columns else nums[:15]
    chosen = list(dict.fromkeys(c for c in chosen if c in corr.columns))
    matrix = corr.loc[chosen, chosen] if chosen else pd.DataFrame()
    return jsonify({"features": chosen, "matrix": [[json_value(v) for v in row] for row in matrix.to_numpy()], "ranked": ranked,
                    "note": "Correlation describes linear association; it does not establish causation."})


@app.get("/api/covariance")
def covariance():
    df = get_frame()
    nums = numeric_columns(df)
    a, b = request.args.get("x", ""), request.args.get("y", "")
    if a or b:
        if a not in nums or b not in nums:
            return error("Choose two numeric features for covariance.")
        pair = df[[a, b]].dropna()
        if len(pair) < 2:
            return error("At least two complete rows are needed for covariance.")
        value = pair[a].cov(pair[b])
        return jsonify({"x": a, "y": b, "covariance": json_value(value), "sign": "positive" if value > 0 else "negative" if value < 0 else "zero", "n": len(pair)})
    chosen = nums[:12]
    cov = df[chosen].cov() if chosen else pd.DataFrame()
    return jsonify({"features": chosen, "matrix": [[json_value(v) for v in row] for row in cov.to_numpy()]})


@app.get("/api/distribution")
def distribution():
    df = get_frame()
    feature = request.args.get("feature", "")
    if feature not in numeric_columns(df):
        return error("Choose a numeric feature for distribution analysis.")
    values = pd.to_numeric(df[feature], errors="coerce").dropna()
    if values.empty:
        return error("This feature has no valid numeric observations.")
    counts, edges = np.histogram(values.to_numpy(), bins=min(30, max(5, int(np.sqrt(len(values))))), density=True)
    return jsonify({"feature": feature, "n": int(len(values)), "mean": json_value(values.mean()), "median": json_value(values.median()),
                    "variance": json_value(values.var()), "std": json_value(values.std()), "q1": json_value(values.quantile(.25)),
                    "q3": json_value(values.quantile(.75)), "min": json_value(values.min()), "max": json_value(values.max()),
                    "edges": edges.tolist(), "density": counts.tolist(), "values": values.tolist() if len(values) <= 2500 else values.sample(2500, random_state=7).tolist()})


@app.get("/api/categories")
def categories():
    df = get_frame()
    feature = request.args.get("feature", "")
    categorical = [c for c in df.columns if c not in numeric_columns(df)]
    if feature not in categorical:
        return error("Choose a categorical feature for frequency analysis.")
    counts = df[feature].fillna("(Missing)").astype(str).value_counts().head(15)
    return jsonify({"feature": feature, "labels": counts.index.tolist(), "counts": [int(n) for n in counts.values], "total": int(df[feature].notna().sum())})


def numeric_pair(x: str, y: str):
    nums = numeric_columns(get_frame())
    if x not in nums or y not in nums:
        raise ValueError("Select two numeric features from the current dataset.")
    pair = get_frame()[[x, y]].dropna()
    if len(pair) < 2:
        raise ValueError("At least two complete rows are required for this analysis.")
    return pair


@app.get("/api/scatter")
def scatter():
    x, y = request.args.get("x", ""), request.args.get("y", "")
    try:
        pair = numeric_pair(x, y)
    except ValueError as exc:
        return error(str(exc))
    shown = pair if len(pair) <= 3000 else pair.sample(3000, random_state=7)
    return jsonify({"x": x, "y": y, "correlation": json_value(pair[x].corr(pair[y])), "n": int(len(pair)),
                    "x_values": shown[x].tolist(), "y_values": shown[y].tolist()})


@app.get("/api/quantiles")
def quantiles():
    feature = request.args.get("feature", "")
    if feature not in numeric_columns(get_frame()):
        return error("Choose a numeric feature for quantile analysis.")
    values = pd.to_numeric(get_frame()[feature], errors="coerce").dropna()
    q1, median, q3 = (float(values.quantile(p)) for p in (.25, .5, .75))
    return jsonify({"feature": feature, "min": float(values.min()), "q1": q1, "median": median, "q3": q3,
                    "max": float(values.max()), "iqr": q3-q1, "values": values.tolist() if len(values) <= 3000 else values.sample(3000, random_state=7).tolist()})


@app.get("/api/polynomial")
def polynomial():
    x, y = request.args.get("x", ""), request.args.get("y", "")
    try:
        degree = int(request.args.get("degree", 2))
        pair = numeric_pair(x, y)
    except (ValueError, TypeError) as exc:
        return error(str(exc) if str(exc) else "Polynomial degree must be an integer from 1 to 5.")
    if not 1 <= degree <= 5:
        return error("Polynomial degree must be between 1 and 5.")
    if pair[x].nunique() <= degree:
        return error("The selected X feature has too few distinct values for this polynomial degree.")
    xv, yv = pair[x].to_numpy(dtype=float), pair[y].to_numpy(dtype=float)
    x_min, x_max = float(np.min(xv)), float(np.max(xv))
    x_center = x_min / 2 + x_max / 2
    x_scale = x_max / 2 - x_min / 2
    y_scale = float(np.max(np.abs(yv))) or 1.0
    x_normalized = (xv - x_center) / x_scale
    y_normalized = yv / y_scale
    try:
        xs = np.linspace(x_min, x_max, 160)
        coefficients = np.polyfit(x_normalized, y_normalized, degree)
        curve_normalized = np.polyval(coefficients, (xs - x_center) / x_scale)
        fitted = curve_normalized * y_scale
    except (np.linalg.LinAlgError, FloatingPointError) as exc:
        return error("Curve fitting failed for these values. Try different features or a lower degree.")
    if not np.isfinite(coefficients).all() or not np.isfinite(fitted).all():
        return error("Curve fitting produced non-finite values. Try different features or a lower degree.")
    fitted_normalized = np.polyval(coefficients, x_normalized)
    ss_total = float(np.sum((y_normalized-y_normalized.mean())**2))
    r2 = 1-float(np.sum((y_normalized-fitted_normalized)**2))/ss_total if ss_total > 0 else None
    shown = pair if len(pair) <= 2500 else pair.sample(2500, random_state=7)
    return jsonify({"x": x, "y": y, "degree": degree, "x_values": shown[x].tolist(), "y_values": shown[y].tolist(),
                    "curve_x": xs.tolist(), "curve_y": fitted.tolist(), "r_squared": json_value(r2), "n": len(pair)})


@app.post("/api/upload")
def upload():
    file = request.files.get("file")
    if not file or not file.filename:
        return error("Choose a CSV file first.")
    if Path(file.filename).suffix.lower() != ".csv":
        return error("Only CSV files are supported.")
    try:
        frame = read_csv_safely(file.stream)
    except ValueError as exc:
        return error(str(exc))
    set_frame(frame, Path(file.filename).name)
    return jsonify({"message": "Dataset uploaded successfully", "dataset_name": Path(file.filename).name,
                    "rows": int(frame.shape[0]), "columns": int(frame.shape[1])})


@app.post("/api/reset")
def reset():
    set_frame(read_csv_safely(SAMPLE_PATH), SAMPLE_PATH.name)
    return jsonify({"message": "Sample dataset restored", "dataset_name": SAMPLE_PATH.name})


@app.errorhandler(413)
def too_large(_):
    return error("File is larger than the 32 MB upload limit.", 413)


@app.errorhandler(Exception)
def unexpected(exc):
    if isinstance(exc, HTTPException):
        return error(exc.description, exc.code or 500)
    app.logger.exception("Unhandled request error", exc_info=exc)
    return error("The analysis could not be completed. Check the selected feature values and try again.", 500)



if __name__ == "__main__":
    set_frame(read_csv_safely(SAMPLE_PATH), SAMPLE_PATH.name)
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", "5000")), debug=False)
