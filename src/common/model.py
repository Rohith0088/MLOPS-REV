from __future__ import annotations

from pathlib import Path
from .schemas import FEATURES, CATEGORICAL_FEATURES


def build_pipeline(scale_pos_weight: float = 1.0) -> Pipeline:
    from sklearn.compose import ColumnTransformer
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import OneHotEncoder, StandardScaler
    from xgboost import XGBClassifier

    numeric = Pipeline([("scale", StandardScaler())])
    categorical = Pipeline([("onehot", OneHotEncoder(handle_unknown="ignore"))])
    preprocessor = ColumnTransformer([
        ("numeric", numeric, FEATURES),
        ("categorical", categorical, CATEGORICAL_FEATURES),
    ])
    classifier = XGBClassifier(
        n_estimators=250, max_depth=5, learning_rate=0.05,
        subsample=0.9, colsample_bytree=0.9, eval_metric="logloss",
        random_state=42, n_jobs=2, scale_pos_weight=scale_pos_weight,
    )
    return Pipeline([("preprocessor", preprocessor), ("classifier", classifier)])


def frame_from_transaction(transaction: dict) -> pd.DataFrame:
    import pandas as pd

    return pd.DataFrame([{key: transaction[key] for key in FEATURES + CATEGORICAL_FEATURES}])


def save_model(model, path: str) -> None:
    import joblib

    Path(path).parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, path)


def load_model(path: str):
    if not Path(path).exists():
        raise FileNotFoundError(f"Model not found at {path}. Run training first.")
    import joblib

    return joblib.load(path)
