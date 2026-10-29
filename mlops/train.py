import argparse
import json
import os
from pathlib import Path

import joblib
import mlflow
import mlflow.sklearn
import pandas as pd
import yaml
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    average_precision_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


ROOT = Path(__file__).resolve().parents[1]


def build_model(params):
    model_params = params["model"]

    return RandomForestClassifier(
        n_estimators=model_params["n_estimators"],
        max_depth=model_params["max_depth"],
        class_weight=model_params["class_weight"],
        random_state=params["random_state"],
        n_jobs=-1,
    )


def main(dataset_name):

    params = yaml.safe_load(
        (ROOT / "params.yaml").read_text()
    )
    random_state = int(params.get("random_state", 42))
    threshold = float(params.get("fraud_threshold", 0.5))

    dataset_dir = ROOT / "datasets" / dataset_name

    train = pd.read_excel(
        dataset_dir / "train_80.xlsx"
    )

    test = pd.read_excel(
        dataset_dir / "test_20.xlsx"
    )

    target = "is_fraud"

    ignored = [
        target,
        "transaction_id"
    ]

    features = [
        column
        for column in train.columns
        if column not in ignored
    ]

    categorical = (
        train[features]
        .select_dtypes(
            include=["object", "category"]
        )
        .columns
        .tolist()
    )

    numeric = [
        column
        for column in features
        if column not in categorical
    ]

    preprocessor = ColumnTransformer(
        transformers=[
            (
                "numeric",
                Pipeline(
                    [
                        (
                            "impute",
                            SimpleImputer(
                                strategy="median"
                            )
                        )
                    ]
                ),
                numeric,
            ),
            (
                "categorical",
                Pipeline(
                    [
                        (
                            "impute",
                            SimpleImputer(
                                strategy="most_frequent"
                            )
                        ),
                        (
                            "encode",
                            OneHotEncoder(
                                handle_unknown="ignore"
                            )
                        ),
                    ]
                ),
                categorical,
            ),
        ]
    )

    model = Pipeline(
        [
            ("features", preprocessor),
            (
                "classifier",
                build_model(params)
            ),
        ]
    )

    model.fit(
        train[features],
        train[target]
    )

    probabilities = model.predict_proba(
        test[features]
    )[:, 1]

    predictions = (
        probabilities >= threshold
    ).astype(int)

    metrics = {
        "precision": precision_score(
            test[target],
            predictions,
            zero_division=0,
        ),
        "recall": recall_score(
            test[target],
            predictions,
            zero_division=0,
        ),
        "f1": f1_score(
            test[target],
            predictions,
            zero_division=0,
        ),
        "pr_auc": average_precision_score(
            test[target],
            probabilities,
        ),
        "roc_auc": roc_auc_score(
            test[target],
            probabilities,
        ),
        "train_rows": len(train),
        "test_rows": len(test),
        "feature_count": len(features),
        "threshold": threshold,
        "random_state": random_state,
    }

    output_dir = (
        ROOT
        / "outputs"
        / dataset_name
    )

    output_dir.mkdir(
        parents=True,
        exist_ok=True
    )

    joblib.dump(
        model,
        output_dir / "model.joblib"
    )

    (
        output_dir / "metrics.json"
    ).write_text(
        json.dumps(
            metrics,
            indent=2
        )
    )

    tracking_uri = os.getenv(
        "MLFLOW_TRACKING_URI"
    )

    if tracking_uri:
        mlflow.set_tracking_uri(
            tracking_uri
        )

    mlflow.set_experiment(
        os.getenv(
            "MLFLOW_EXPERIMENT",
            "fraud-sentinel"
        )
    )

    with mlflow.start_run(
        run_name=f"{dataset_name}-random-forest"
    ):

        mlflow.log_params(
            {
                "dataset": dataset_name,
                "random_state": random_state,
                "fraud_threshold": threshold,
                **params["model"]
            }
        )

        mlflow.log_metrics(
            {
                key: value
                for key, value in metrics.items()
                if isinstance(value, (int, float))
            }
        )

        mlflow.log_artifact(
            str(
                output_dir
                / "metrics.json"
            )
        )

        mlflow.sklearn.log_model(
            model,
            "model",
            skops_trusted_types=[
                "numpy.dtype"
            ]
        )

    print(
        json.dumps(
            {
                "dataset": dataset_name,
                **metrics
            },
            indent=2
        )
    )


if __name__ == "__main__":

    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--dataset",
        default="01_paysim_style"
    )

    args = parser.parse_args()

    main(args.dataset)