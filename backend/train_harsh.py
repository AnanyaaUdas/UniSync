# trains the harsh language models for the meeting minutes
# run:  python train_harsh.py
# needs the datasets inside backend/data (see README)

from pathlib import Path

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

HERE = Path(__file__).parent
DATA = HERE / "data"
MODELS = HERE / "models"

# the 6 label columns in the jigsaw file
JIGSAW_LABELS = ["toxic", "severe_toxic", "obscene", "threat", "insult", "identity_hate"]


def load_english():
    df = pd.read_csv(DATA / "train.csv")
    # a comment is harsh if any of the 6 labels is 1
    df["harsh"] = df[JIGSAW_LABELS].max(axis=1)
    df = df.dropna(subset=["comment_text"])
    return df["comment_text"].astype(str), df["harsh"].astype(int)


def load_nepali():
    df = pd.read_excel(DATA / "brb.xlsx")
    df = df.dropna(subset=["Cleaned", "Offensive"])
    return df["Cleaned"].astype(str), df["Offensive"].astype(int)


def english_model():
    # words and pairs of words
    return Pipeline([
        ("tfidf", TfidfVectorizer(lowercase=True, ngram_range=(1, 2), min_df=2,
                                  max_features=100000, sublinear_tf=True)),
        ("clf", LogisticRegression(class_weight="balanced", max_iter=1000)),
    ])


def nepali_model():
    # nepali words change their endings a lot so small pieces of
    # words (2 to 4 letters) work better than whole words
    return Pipeline([
        ("tfidf", TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 4), sublinear_tf=True)),
        ("clf", LogisticRegression(class_weight="balanced", max_iter=1000)),
    ])


def train(name, texts, labels, model):
    print("\n==== " + name + " ====")
    print("sentences:", len(texts), " harsh:", int(labels.sum()))

    # keep 20% hidden so the test is fair
    x_train, x_test, y_train, y_test = train_test_split(
        texts, labels, test_size=0.2, random_state=42, stratify=labels)

    model.fit(x_train, y_train)

    guess = model.predict(x_test)
    print(classification_report(y_test, guess, target_names=["ok", "harsh"], digits=3))
    print("f1 for harsh:", round(f1_score(y_test, guess), 3))

    MODELS.mkdir(exist_ok=True)
    path = MODELS / (name + ".joblib")
    joblib.dump(model, path)
    print("saved", path)
    return model


def main():
    if (DATA / "train.csv").exists():
        texts, labels = load_english()
        model = train("harsh_en", texts, labels, english_model())
        for line in ["can you send me the slides by friday", "you are a useless idiot"]:
            print(round(model.predict_proba([line])[0][1], 2), line)
    else:
        print("backend/data/train.csv not found, skipping english")

    if (DATA / "brb.xlsx").exists():
        texts, labels = load_nepali()
        train("harsh_ne", texts, labels, nepali_model())
    else:
        print("backend/data/brb.xlsx not found, skipping nepali")


if __name__ == "__main__":
    main()
