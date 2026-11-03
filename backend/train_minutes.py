# trains the model that sorts meeting sentences into
# decision, action, question or general
# run:  python train_minutes.py
# needs labelled/minutes_sentences.xlsx with the label column filled

from pathlib import Path

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

HERE = Path(__file__).parent
FILE = HERE / "labelled" / "minutes_sentences.xlsx"
MODELS = HERE / "models"

LABELS = ["decision", "action", "question", "general"]


def load():
    df = pd.read_excel(FILE, sheet_name="sentences")
    df["label"] = df["label"].astype(str).str.strip().str.lower()
    # rows that are not labelled yet are left out
    df = df[df["label"].isin(LABELS)]
    return df["sentence"].astype(str), df["label"]


def main():
    texts, labels = load()
    print("labelled sentences:", len(texts))
    print(labels.value_counts().to_string())

    if len(texts) < 100 or labels.value_counts().min() < 10:
        print("\nnot enough yet, label at least 100 sentences and 10 of each type")
        return

    x_train, x_test, y_train, y_test = train_test_split(
        texts, labels, test_size=0.2, random_state=42, stratify=labels)

    # no stop words removed because small words like "we will" and "can you" matter here
    model = Pipeline([
        ("tfidf", TfidfVectorizer(lowercase=True, ngram_range=(1, 2), sublinear_tf=True)),
        ("clf", LogisticRegression(class_weight="balanced", max_iter=1000)),
    ])
    model.fit(x_train, y_train)

    guess = model.predict(x_test)
    print()
    print(classification_report(y_test, guess, digits=3, zero_division=0))
    print("macro f1:", round(f1_score(y_test, guess, average="macro"), 3))

    MODELS.mkdir(exist_ok=True)
    path = MODELS / "minutes_type.joblib"
    joblib.dump(model, path)
    print("saved", path)

    for line in ["We will use the blue design.", "Can you finish the report by friday?",
                 "How much does it cost?", "Yeah that sounds nice."]:
        print(model.predict([line])[0], "|", line)


if __name__ == "__main__":
    main()
