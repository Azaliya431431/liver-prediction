from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Boolean, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from datetime import datetime
import pandas as pd
import numpy as np
import json
import io
import os
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import hashlib
import secrets
from jose import jwt
from datetime import timedelta
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import uvicorn
import joblib
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.neighbors import KNeighborsClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix, roc_auc_score
from sklearn.preprocessing import label_binarize
import xgboost as xgb
import re
from sklearn.impute import KNNImputer, SimpleImputer

# ============ КОНФИГУРАЦИЯ ============
SECRET_KEY = "secret-key-change-in-production"
ALGORITHM = "HS256"
security = HTTPBearer()

# ============ БАЗА ДАННЫХ ============
SQLALCHEMY_DATABASE_URL = "sqlite:///./liver_prediction.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ============ МОДЕЛИ БД ============


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)  # ДОБАВИТЬ ЭТУ СТРОКУ
    created_at = Column(DateTime, default=datetime.utcnow)


class PredictionHistory(Base):
    __tablename__ = "prediction_history"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False)
    user_role = Column(String, nullable=False)
    patient_data = Column(Text, nullable=False)
    diagnosis = Column(String, nullable=False)
    diagnosis_category = Column(Integer, nullable=False)
    xgboost_prediction = Column(Integer)
    xgboost_confidence = Column(Float)
    knn_prediction = Column(Integer)
    knn_confidence = Column(Float)
    doctor_agreed = Column(Boolean, default=None)
    doctor_comment = Column(String, nullable=True)
    cirrhosis_stage = Column(Integer, nullable=True)
    cirrhosis_stage_confidence = Column(Float, nullable=True)
    recommendations = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class DatasetRow(Base):
    __tablename__ = "dataset_rows"
    id = Column(Integer, primary_key=True, index=True)
    dataset_name = Column(String, nullable=False)
    row_data = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


# Создаем таблицы
Base.metadata.create_all(bind=engine)


# ============ АУТЕНТИФИКАЦИЯ ============
def get_password_hash(password: str) -> str:
    salt = secrets.token_hex(16)
    hash_obj = hashlib.sha256((password + salt).encode())
    return f"{salt}:{hash_obj.hexdigest()}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        salt, hash_value = hashed_password.split(':')
        hash_obj = hashlib.sha256((plain_password + salt).encode())
        return hash_obj.hexdigest() == hash_value
    except:
        return False


def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=8)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return {"username": payload.get("sub"), "role": payload.get("role"), "user_id": payload.get("user_id")}
    except:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_users():
    db = SessionLocal()
    if not db.query(User).filter(User.username == "admin").first():
        db.add(User(username="admin", hashed_password=get_password_hash("admin123"), role="admin",
                    full_name="Администратор"))
        db.add(User(username="doctor", hashed_password=get_password_hash("doctor123"), role="doctor", full_name="Врач"))
        db.commit()
        print("Пользователи созданы: admin/admin123, doctor/doctor123")
    db.close()


# ============ APP ============
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    init_users()
    print("Сервер запущен на http://localhost:8000")


# ============ КОРНЕВОЙ ЭНДПОИНТ ============
@app.get("/")
async def root():
    return {"message": "Сервер работает", "status": "ok"}


# ============ АУТЕНТИФИКАЦИЯ ============
@app.post("/api/login")
async def login(username: str, password: str, db: Session = Depends(get_db)):
    print(f"Попытка входа: {username}")

    user = db.query(User).filter(User.username == username).first()

    # Проверка существования пользователя
    if not user:
        print(f"Пользователь {username} не найден")
        raise HTTPException(
            status_code=401,
            detail="Неверное имя пользователя или пароль"
        )

    # Проверка пароля
    if not verify_password(password, user.hashed_password):
        print(f"Неверный пароль для {username}")
        raise HTTPException(
            status_code=401,
            detail="Неверное имя пользователя или пароль"
        )

    # Проверка на блокировку
    is_active = getattr(user, 'is_active', True)
    if not is_active:
        print(f"Пользователь {username} ЗАБЛОКИРОВАН!")
        raise HTTPException(
            status_code=403,
            detail="Ваша учетная запись заблокирована. Обратитесь к администратору для разблокировки."
        )

    # Успешный вход
    print(f"Успешный вход: {username}, роль: {user.role}")
    token = create_access_token({"sub": user.username, "role": user.role, "user_id": user.id})

    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user.role,
        "user_id": user.id,
        "username": user.username
    }



# ============ ДАТАСЕТЫ ============
@app.get("/api/admin/dataset/{dataset_type}")
async def get_dataset(dataset_type: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    rows = db.query(DatasetRow).filter(DatasetRow.dataset_name == dataset_type).all()
    data = []
    for row in rows:
        item = json.loads(row.row_data)
        item["id"] = row.id
        data.append(item)
    return data


@app.post("/api/admin/upload-dataset/{dataset_type}")
async def upload_dataset(dataset_type: str, file: UploadFile = File(...), db: Session = Depends(get_db),
                         current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    content = await file.read()

    if file.filename.endswith('.csv'):
        df = pd.read_csv(io.StringIO(content.decode('utf-8')))
    else:
        raise HTTPException(status_code=400, detail="Только CSV")

    # НЕ УДАЛЯЕМ старые данные - ДОБАВЛЯЕМ
    # db.query(DatasetRow).filter(DatasetRow.dataset_name == dataset_type).delete()

    # Сохраняем новые строки
    for _, row in df.iterrows():
        row_dict = {col: (None if pd.isna(row[col]) else row[col]) for col in df.columns}
        db.add(DatasetRow(dataset_name=dataset_type, row_data=json.dumps(row_dict, default=str)))

    db.commit()
    return {"message": f"Добавлено {len(df)} записей", "rows": len(df)}

# ============ ИСТОРИЯ ПРОГНОЗОВ ============
@app.get("/api/history/confirmed")
async def get_confirmed_history(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    query = db.query(PredictionHistory).filter(PredictionHistory.doctor_agreed == True)
    if current_user.get("role") != "admin":
        query = query.filter(PredictionHistory.user_id == current_user.get("user_id"))
    history = query.order_by(PredictionHistory.created_at.desc()).all()
    return [{
        "id": h.id,
        "diagnosis": h.diagnosis,
        "diagnosis_category": h.diagnosis_category,
        "xgboost_prediction": h.xgboost_prediction,
        "xgboost_confidence": h.xgboost_confidence,
        "knn_prediction": h.knn_prediction,
        "knn_confidence": h.knn_confidence,
        "cirrhosis_stage": h.cirrhosis_stage,
        "doctor_comment": h.doctor_comment,
        "created_at": h.created_at
    } for h in history]

@app.get("/api/history/unconfirmed")
async def get_unconfirmed_history(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    query = db.query(PredictionHistory).filter(PredictionHistory.doctor_agreed.is_(None))
    if current_user.get("role") != "admin":
        query = query.filter(PredictionHistory.user_id == current_user.get("user_id"))
    history = query.order_by(PredictionHistory.created_at.desc()).all()
    return [{
        "id": h.id,
        "diagnosis": h.diagnosis,
        "diagnosis_category": h.diagnosis_category,
        "xgboost_prediction": h.xgboost_prediction,
        "xgboost_confidence": h.xgboost_confidence,
        "knn_prediction": h.knn_prediction,
        "knn_confidence": h.knn_confidence,
        "cirrhosis_stage": h.cirrhosis_stage,
        "doctor_comment": h.doctor_comment,
        "created_at": h.created_at
    } for h in history]





# ============ ИСТОРИЯ ДЛЯ СТАДИЙ ЦИРРОЗА ============
@app.get("/api/history/cirrhosis/confirmed")
async def get_cirrhosis_confirmed_history(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    query = db.query(PredictionHistory).filter(
        PredictionHistory.doctor_agreed == True,
        PredictionHistory.cirrhosis_stage.isnot(None)
    )
    if current_user.get("role") != "admin":
        query = query.filter(PredictionHistory.user_id == current_user.get("user_id"))
    history = query.order_by(PredictionHistory.created_at.desc()).all()
    return [{
        "id": h.id,
        "diagnosis": h.diagnosis,
        "cirrhosis_stage": h.cirrhosis_stage,
        "xgboost_prediction": h.xgboost_prediction,
        "xgboost_confidence": h.xgboost_confidence,
        "knn_prediction": h.knn_prediction,
        "knn_confidence": h.knn_confidence,
        "doctor_comment": h.doctor_comment,
        "created_at": h.created_at
    } for h in history]

@app.get("/api/history/cirrhosis/unconfirmed")
async def get_cirrhosis_unconfirmed_history(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    query = db.query(PredictionHistory).filter(
        PredictionHistory.doctor_agreed.is_(None),
        PredictionHistory.cirrhosis_stage.isnot(None)
    )
    if current_user.get("role") != "admin":
        query = query.filter(PredictionHistory.user_id == current_user.get("user_id"))
    history = query.order_by(PredictionHistory.created_at.desc()).all()
    return [{
        "id": h.id,
        "diagnosis": h.diagnosis,
        "cirrhosis_stage": h.cirrhosis_stage,
        "xgboost_prediction": h.xgboost_prediction,
        "xgboost_confidence": h.xgboost_confidence,
        "knn_prediction": h.knn_prediction,
        "knn_confidence": h.knn_confidence,
        "doctor_comment": h.doctor_comment,
        "created_at": h.created_at
    } for h in history]



# ============ ПОЛЬЗОВАТЕЛИ ============
# В main.py обновите get_users

@app.get("/api/admin/users")
async def get_users(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    users = db.query(User).all()
    result = []
    for u in users:
        result.append({
            "id": u.id,
            "username": u.username,
            "role": u.role,
            "full_name": u.full_name,
            "is_active": getattr(u, 'is_active', True),  # Важно!
            "created_at": u.created_at
        })
    return result

@app.post("/api/admin/users")
async def create_user(user_data: dict, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    existing = db.query(User).filter(User.username == user_data["username"]).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    new_user = User(
        username=user_data["username"],
        hashed_password=get_password_hash(user_data["password"]),
        role=user_data.get("role", "doctor"),
        full_name=user_data.get("full_name", "")
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"id": new_user.id, "username": new_user.username, "role": new_user.role}


# В main.py найдите и замените функцию update_user (примерно строка 250-280)

@app.put("/api/admin/users/{user_id}")
async def update_user(user_id: int, user_data: dict, db: Session = Depends(get_db),
                      current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    print(f"Обновление пользователя ID: {user_id}")
    print(f"Полученные данные: {user_data}")

    # Обновляем пароль если он передан и не пустой
    if user_data.get("password") and user_data["password"].strip():
        new_password = user_data["password"].strip()
        user.hashed_password = get_password_hash(new_password)
        print(f"Пароль обновлен для пользователя {user.username}")

    # Обновляем роль
    if user_data.get("role"):
        user.role = user_data["role"]

    # Обновляем ФИО
    if user_data.get("full_name") is not None:
        user.full_name = user_data["full_name"]

    # Обновляем статус активности (ВАЖНО!)
    if "is_active" in user_data:
        user.is_active = user_data["is_active"]
        print(f"Статус is_active изменен на: {user_data['is_active']} для пользователя {user.username}")

    db.commit()
    db.refresh(user)

    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "full_name": user.full_name,
        "is_active": user.is_active if hasattr(user, 'is_active') else True,
        "created_at": user.created_at
    }


# ============ ОПЕРАЦИИ С ДАТАСЕТАМИ (CRUD) ============
@app.post("/api/admin/dataset/{dataset_type}/add")
async def add_dataset_row(dataset_type: str, row_data: dict, db: Session = Depends(get_db),
                          current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    for key, value in row_data.items():
        if value == "" or value is None:
            row_data[key] = None

    db_row = DatasetRow(dataset_name=dataset_type, row_data=json.dumps(row_data, default=str))
    db.add(db_row)
    db.commit()
    db.refresh(db_row)
    return {"message": "Row added", "id": db_row.id}


@app.put("/api/admin/dataset/{dataset_type}/{row_id}")
async def update_dataset_row(dataset_type: str, row_id: int, row_data: dict, db: Session = Depends(get_db),
                             current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    row = db.query(DatasetRow).filter(DatasetRow.id == row_id, DatasetRow.dataset_name == dataset_type).first()
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")

    if 'id' in row_data:
        del row_data['id']

    for key, value in row_data.items():
        if value == "" or value is None:
            row_data[key] = None

    row.row_data = json.dumps(row_data, default=str)
    db.commit()
    return {"message": "Row updated"}


@app.delete("/api/admin/dataset/{dataset_type}/{row_id}")
async def delete_dataset_row(dataset_type: str, row_id: int, db: Session = Depends(get_db),
                             current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    row = db.query(DatasetRow).filter(DatasetRow.id == row_id, DatasetRow.dataset_name == dataset_type).first()
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")

    db.delete(row)
    db.commit()
    return {"message": "Row deleted"}


# ============ ОБУЧЕНИЕ МОДЕЛЕЙ ============
@app.post("/api/admin/train")
async def train_model(request: dict, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """
    Ожидает запрос:
    {
        "dataset_type": "hepatitis" или "cirrhosis",
        "methods": ["xgboost"] или ["xgboost", "knn"]
    }
    """
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    dataset_type = request.get("dataset_type")
    methods = request.get("methods", ["xgboost"])

    if dataset_type == "hepatitis":
        return await train_hepatitis(db, methods)
    elif dataset_type == "cirrhosis":
        return await train_cirrhosis(db, methods)
    else:
        raise HTTPException(status_code=400, detail="Неверный тип датасета")


async def train_hepatitis(db: Session, methods: list):
    rows = db.query(DatasetRow).filter(DatasetRow.dataset_name == "hepatitis").all()
    if not rows:
        raise HTTPException(status_code=400, detail="Нет данных для обучения")

    data = [json.loads(row.row_data) for row in rows]
    df = pd.DataFrame(data)

    # Прямой маппинг категорий
    category_map = {
        '0=Blood Donor': 0,
        '0s=suspect Blood Donor': 1,
        '1=Hepatitis': 2,
        '2=Fibrosis': 3,
        '3=Cirrhosis': 4
    }

    def parse_category(val):
        if pd.isna(val):
            return None
        if isinstance(val, (int, float)):
            return int(val)
        if isinstance(val, str):
            val = val.strip('"')
            for key, value in category_map.items():
                if key in val:
                    return value
            import re
            numbers = re.findall(r'\d+', val)
            if numbers:
                return int(numbers[0])
        return None

    df['Category_num'] = df['Category'].apply(parse_category)
    df = df.dropna(subset=['Category_num'])

    print(f"Оригинальные классы: {sorted(df['Category_num'].unique())}")

    # ПЕРЕНУМЕРУЕМ КЛАССЫ ПОСЛЕДОВАТЕЛЬНО
    unique_classes = sorted(df['Category_num'].unique())
    class_mapping = {old: new for new, old in enumerate(unique_classes)}
    df['Category_num'] = df['Category_num'].map(class_mapping)

    print(f"Новые классы: {sorted(df['Category_num'].unique())}")
    print(f"Маппинг: {class_mapping}")

    if len(df) < 10:
        raise HTTPException(status_code=400, detail=f"Недостаточно данных: {len(df)} строк")

    # Признаки
    feature_cols = ['Age', 'Sex', 'ALB', 'ALP', 'ALT', 'AST', 'BIL', 'CHE', 'CHOL', 'CREA', 'GGT', 'PROT']
    X = df[feature_cols].copy()
    X['Sex'] = X['Sex'].map({'m': 0, 'f': 1})
    y = df['Category_num']

    # Заполняем пропуски
    from sklearn.impute import SimpleImputer
    imputer = SimpleImputer(strategy='mean')
    X_imputed = pd.DataFrame(imputer.fit_transform(X), columns=X.columns)

    X_train, X_test, y_train, y_test = train_test_split(X_imputed, y, test_size=0.2, random_state=42, stratify=y)

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    results = {}
    classes = sorted(y.unique())

    # Названия классов для отображения
    reverse_mapping = {v: k for k, v in class_mapping.items()}
    class_names = []
    for c in classes:
        original = reverse_mapping.get(c, c)
        if original == 0:
            class_names.append("Здоровый")
        elif original == 1:
            class_names.append("Подозрительный")
        elif original == 2:
            class_names.append("Гепатит")
        elif original == 3:
            class_names.append("Фиброз")
        elif original == 4:
            class_names.append("Цирроз")
        else:
            class_names.append(f"Класс {original}")

    print(f"Классы для отображения: {class_names}")

    # XGBoost
    if "xgboost" in methods:
        model = xgb.XGBClassifier(n_estimators=100, max_depth=6, random_state=42)
        model.fit(X_train_scaled, y_train)
        y_pred = model.predict(X_test_scaled)
        y_proba = model.predict_proba(X_test_scaled)

        os.makedirs('models', exist_ok=True)
        joblib.dump(model, 'models/hepatitis_xgboost.pkl')
        joblib.dump(scaler, 'models/hepatitis_scaler.pkl')

        accuracy = accuracy_score(y_test, y_pred)
        precision = precision_score(y_test, y_pred, average='weighted', zero_division=0)
        recall = recall_score(y_test, y_pred, average='weighted', zero_division=0)
        f1 = f1_score(y_test, y_pred, average='weighted', zero_division=0)
        cm = confusion_matrix(y_test, y_pred).tolist()

        try:
            if len(classes) == 2:
                roc_auc = roc_auc_score(y_test, y_proba[:, 1])
            else:
                y_bin = label_binarize(y_test, classes=classes)
                roc_auc = roc_auc_score(y_bin, y_proba, average='weighted', multi_class='ovr')
        except:
            roc_auc = 0.5

        results["xgboost"] = {
            "accuracy": float(accuracy),
            "precision": float(precision),
            "recall": float(recall),
            "f1": float(f1),
            "roc_auc": float(roc_auc),
            "confusion_matrix": cm
        }

    # KNN
    if "knn" in methods:
        model = KNeighborsClassifier(n_neighbors=5)
        model.fit(X_train_scaled, y_train)
        y_pred = model.predict(X_test_scaled)
        y_proba = model.predict_proba(X_test_scaled)

        joblib.dump(model, 'models/hepatitis_knn.pkl')

        accuracy = accuracy_score(y_test, y_pred)
        precision = precision_score(y_test, y_pred, average='weighted', zero_division=0)
        recall = recall_score(y_test, y_pred, average='weighted', zero_division=0)
        f1 = f1_score(y_test, y_pred, average='weighted', zero_division=0)
        cm = confusion_matrix(y_test, y_pred).tolist()

        try:
            if len(classes) == 2:
                roc_auc = roc_auc_score(y_test, y_proba[:, 1])
            else:
                y_bin = label_binarize(y_test, classes=classes)
                roc_auc = roc_auc_score(y_bin, y_proba, average='weighted', multi_class='ovr')
        except:
            roc_auc = 0.5

        results["knn"] = {
            "accuracy": float(accuracy),
            "precision": float(precision),
            "recall": float(recall),
            "f1": float(f1),
            "roc_auc": float(roc_auc),
            "confusion_matrix": cm
        }

    return {
        "dataset_type": "hepatitis",
        "samples": int(len(df)),
        "class_names": class_names,
        "methods": results
    }


async def train_cirrhosis(db: Session, methods: list):
    rows = db.query(DatasetRow).filter(DatasetRow.dataset_name == "cirrhosis").all()
    if not rows:
        raise HTTPException(status_code=400, detail="Нет данных для обучения")

    data = [json.loads(row.row_data) for row in rows]
    df = pd.DataFrame(data)

    # Обработка Stage
    df = df[df['Stage'] != 'NA']
    df['Stage'] = pd.to_numeric(df['Stage'], errors='coerce')
    df = df.dropna(subset=['Stage'])
    df['Stage'] = df['Stage'].astype(int) - 1

    feature_cols = ['N_Days', 'Status', 'Drug', 'Ascites', 'Hepatomegaly', 'Spiders', 'Edema',
                    'Copper', 'Alk_Phos', 'Tryglicerides', 'Platelets', 'Prothrombin']

    df = df.replace(['NA', 'NaN', 'None', ''], np.nan)
    for col in feature_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce')

    categorical_cols = ['Status', 'Drug', 'Ascites', 'Hepatomegaly', 'Spiders', 'Edema']
    for col in categorical_cols:
        if col in df.columns:
            df[col] = df[col].fillna('N')
            le = LabelEncoder()
            df[col] = le.fit_transform(df[col].astype(str))

    X = df[feature_cols].copy()
    y = df['Stage'].copy()

    # Удаляем строки с NaN в целевой переменной
    valid_mask = y.notna()
    X = X[valid_mask]
    y = y[valid_mask]

    # Сбрасываем индексы
    X = X.reset_index(drop=True)
    y = y.reset_index(drop=True)

    # Заполняем пропуски в признаках
    from sklearn.impute import SimpleImputer
    imputer = SimpleImputer(strategy='mean')
    X_imputed = pd.DataFrame(imputer.fit_transform(X), columns=X.columns)

    if len(X_imputed) < 10:
        raise HTTPException(status_code=400, detail=f"Недостаточно данных: {len(X_imputed)} строк")

    X_train, X_test, y_train, y_test = train_test_split(X_imputed, y, test_size=0.2, random_state=42, stratify=y)

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    results = {}
    classes = sorted(y.unique())
    class_names = [f"Стадия {i + 1}" for i in classes]

    # XGBoost
    if "xgboost" in methods:
        model = xgb.XGBClassifier(n_estimators=100, max_depth=5, random_state=42)
        model.fit(X_train_scaled, y_train)
        y_pred = model.predict(X_test_scaled)
        y_proba = model.predict_proba(X_test_scaled)

        os.makedirs('models', exist_ok=True)
        joblib.dump(model, 'models/cirrhosis_xgboost.pkl')
        joblib.dump(scaler, 'models/cirrhosis_scaler.pkl')

        accuracy = accuracy_score(y_test, y_pred)
        precision = precision_score(y_test, y_pred, average='weighted', zero_division=0)
        recall = recall_score(y_test, y_pred, average='weighted', zero_division=0)
        f1 = f1_score(y_test, y_pred, average='weighted', zero_division=0)
        cm = confusion_matrix(y_test, y_pred).tolist()

        try:
            if len(classes) == 2:
                roc_auc = roc_auc_score(y_test, y_proba[:, 1])
            else:
                y_bin = label_binarize(y_test, classes=classes)
                roc_auc = roc_auc_score(y_bin, y_proba, average='weighted', multi_class='ovr')
        except:
            roc_auc = 0.5

        results["xgboost"] = {
            "accuracy": float(accuracy),
            "precision": float(precision),
            "recall": float(recall),
            "f1": float(f1),
            "roc_auc": float(roc_auc),
            "confusion_matrix": cm
        }

    # KNN для цирроза (опционально)
    if "knn" in methods:
        model = KNeighborsClassifier(n_neighbors=5)
        model.fit(X_train_scaled, y_train)
        y_pred = model.predict(X_test_scaled)
        y_proba = model.predict_proba(X_test_scaled)

        joblib.dump(model, 'models/cirrhosis_knn.pkl')

        accuracy = accuracy_score(y_test, y_pred)
        precision = precision_score(y_test, y_pred, average='weighted', zero_division=0)
        recall = recall_score(y_test, y_pred, average='weighted', zero_division=0)
        f1 = f1_score(y_test, y_pred, average='weighted', zero_division=0)
        cm = confusion_matrix(y_test, y_pred).tolist()

        try:
            if len(classes) == 2:
                roc_auc = roc_auc_score(y_test, y_proba[:, 1])
            else:
                y_bin = label_binarize(y_test, classes=classes)
                roc_auc = roc_auc_score(y_bin, y_proba, average='weighted', multi_class='ovr')
        except:
            roc_auc = 0.5

        results["knn"] = {
            "accuracy": float(accuracy),
            "precision": float(precision),
            "recall": float(recall),
            "f1": float(f1),
            "roc_auc": float(roc_auc),
            "confusion_matrix": cm
        }

    return {
        "dataset_type": "cirrhosis",
        "samples": int(len(X_imputed)),
        "class_names": class_names,
        "methods": results
    }


# ============ УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ ============
@app.get("/api/admin/users")
async def get_users(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    users = db.query(User).all()
    result = []
    for u in users:
        result.append({
            "id": u.id,
            "username": u.username,
            "role": u.role,
            "full_name": u.full_name,
            "is_active": u.is_active if hasattr(u, 'is_active') else True,
            "created_at": u.created_at
        })
    return result


@app.post("/api/admin/users")
async def create_user(user_data: dict, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    existing = db.query(User).filter(User.username == user_data["username"]).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    new_user = User(
        username=user_data["username"],
        hashed_password=get_password_hash(user_data["password"]),
        role=user_data.get("role", "doctor"),
        full_name=user_data.get("full_name", "")
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"id": new_user.id, "username": new_user.username, "role": new_user.role, "full_name": new_user.full_name}


@app.put("/api/admin/users/{user_id}")
async def update_user(user_id: int, user_data: dict, db: Session = Depends(get_db),
                      current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Обновляем поля
    if user_data.get("password"):
        user.hashed_password = get_password_hash(user_data["password"])
    if user_data.get("role"):
        user.role = user_data["role"]
    if user_data.get("full_name") is not None:
        user.full_name = user_data["full_name"]
    if "is_active" in user_data:
        user.is_active = user_data["is_active"]

    db.commit()
    db.refresh(user)

    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "full_name": user.full_name,
        "is_active": user.is_active,
        "created_at": user.created_at
    }


@app.get("/api/admin/users")
async def get_users(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    users = db.query(User).all()
    return [{
        "id": u.id,
        "username": u.username,
        "role": u.role,
        "full_name": u.full_name,
        "is_active": getattr(u, 'is_active', True),
        "created_at": u.created_at
    } for u in users]


# ============ ПРОГНОЗИРОВАНИЕ ============
@app.post("/api/predict")
async def predict(request: dict, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    hep_data = request.get("hepatitis_data", {})

    print(f"=== ПОЛУЧЕН ЗАПРОС НА ПРОГНОЗ ===")
    print(f"Данные: {hep_data}")

    diagnosis_map = {
        0: "Здоровый донор",
        1: "Подозрительный донор",
        2: "Гепатит",
        3: "Фиброз",
        4: "Цирроз печени"
    }

    # Загружаем модели
    import os, joblib
    from sklearn.preprocessing import StandardScaler
    from sklearn.impute import SimpleImputer

    model_path = 'models/hepatitis_xgboost.pkl'

    if os.path.exists(model_path):
        try:
            xgb_model = joblib.load(model_path)
            knn_model = joblib.load('models/hepatitis_knn.pkl')
            scaler = joblib.load('models/hepatitis_scaler.pkl')

            feature_cols = ['Age', 'Sex', 'ALB', 'ALP', 'ALT', 'AST', 'BIL', 'CHE', 'CHOL', 'CREA', 'GGT', 'PROT']
            X = pd.DataFrame([hep_data])[feature_cols].copy()
            X['Sex'] = X['Sex'].map({'m': 0, 'f': 1})

            imputer = SimpleImputer(strategy='mean')
            X_imputed = imputer.fit_transform(X)
            X_scaled = scaler.transform(X_imputed)

            xgb_pred = int(xgb_model.predict(X_scaled)[0])
            xgb_conf = float(max(xgb_model.predict_proba(X_scaled)[0]))
            knn_pred = int(knn_model.predict(X_scaled)[0])
            knn_conf = float(max(knn_model.predict_proba(X_scaled)[0]))
        except Exception as e:
            print(f"Ошибка модели: {e}")
            xgb_pred, xgb_conf, knn_pred, knn_conf = 0, 0.5, 0, 0.5
    else:
        print("Модели не найдены")
        xgb_pred, xgb_conf, knn_pred, knn_conf = 0, 0.5, 0, 0.5

    final_pred = xgb_pred if xgb_conf > knn_conf else knn_pred

    recommendations = [
        "Рекомендовано обратиться к врачу-гепатологу",
        "Повторное обследование через 3-6 месяцев",
        "Исключить алкоголь и гепатотоксичные препараты"
    ]

    # СОХРАНЯЕМ ДАННЫЕ - ВАЖНО!
    patient_data = {
        "hepatitis_data": hep_data,
        "cirrhosis_data": None
    }

    history = PredictionHistory(
        user_id=current_user.get("user_id", 1),
        user_role=current_user.get("role", "doctor"),
        patient_data=json.dumps(patient_data, ensure_ascii=False),
        diagnosis=diagnosis_map.get(final_pred, "Unknown"),
        diagnosis_category=final_pred,
        xgboost_prediction=xgb_pred,
        xgboost_confidence=xgb_conf,
        knn_prediction=knn_pred,
        knn_confidence=knn_conf,
        doctor_agreed=None,
        recommendations=json.dumps(recommendations, ensure_ascii=False)
    )
    db.add(history)
    db.commit()
    db.refresh(history)

    print(f"Прогноз сохранен с ID: {history.id}")
    print(f"Сохраненные данные: {patient_data}")

    return {
        "prediction_id": history.id,
        "diagnosis_category": final_pred,
        "diagnosis_name": diagnosis_map.get(final_pred, "Unknown"),
        "xgboost_prediction": xgb_pred,
        "xgboost_confidence": xgb_conf,
        "knn_prediction": knn_pred,
        "knn_confidence": knn_conf,
        "final_diagnosis": diagnosis_map.get(final_pred, "Unknown"),
        "recommendations": recommendations,
        "created_at": history.created_at.isoformat()
    }


@app.post("/api/predict/cirrhosis")
async def predict_cirrhosis_stage(request: dict, db: Session = Depends(get_db),
                                  current_user: dict = Depends(get_current_user)):
    prediction_id = request.get("prediction_id")
    cirrhosis_data = request.get("cirrhosis_data", {})

    print(f"=== ОПРЕДЕЛЕНИЕ СТАДИИ ЦИРРОЗА ===")
    print(f"ID прогноза: {prediction_id}")
    print(f"Данные цирроза: {cirrhosis_data}")

    import os, joblib
    from sklearn.preprocessing import StandardScaler
    from sklearn.impute import SimpleImputer

    model_path = 'models/cirrhosis_xgboost.pkl'

    if os.path.exists(model_path):
        try:
            model = joblib.load(model_path)
            scaler = joblib.load('models/cirrhosis_scaler.pkl')

            feature_cols = ['N_Days', 'Status', 'Drug', 'Ascites', 'Hepatomegaly', 'Spiders', 'Edema',
                            'Copper', 'Alk_Phos', 'Tryglicerides', 'Platelets', 'Prothrombin']

            X = pd.DataFrame([cirrhosis_data])[feature_cols].copy()

            status_map = {'C': 0, 'CL': 1, 'D': 2}
            drug_map = {'D-penicillamine': 0, 'Placebo': 1}
            yesno_map = {'N': 0, 'Y': 1}
            edema_map = {'N': 0, 'S': 1, 'Y': 2}

            X['Status'] = status_map.get(X['Status'].iloc[0], 0)
            X['Drug'] = drug_map.get(X['Drug'].iloc[0], 0)
            X['Ascites'] = yesno_map.get(X['Ascites'].iloc[0], 0)
            X['Hepatomegaly'] = yesno_map.get(X['Hepatomegaly'].iloc[0], 0)
            X['Spiders'] = yesno_map.get(X['Spiders'].iloc[0], 0)
            X['Edema'] = edema_map.get(X['Edema'].iloc[0], 0)

            imputer = SimpleImputer(strategy='mean')
            X_imputed = imputer.fit_transform(X)
            X_scaled = scaler.transform(X_imputed)

            stage_pred = int(model.predict(X_scaled)[0]) + 1
            stage_conf = float(max(model.predict_proba(X_scaled)[0]))

            # Обновляем прогноз - ДОБАВЛЯЕМ ДАННЫЕ ЦИРРОЗА
            prediction = db.query(PredictionHistory).filter(PredictionHistory.id == prediction_id).first()
            if prediction:
                # Сохраняем полные данные с циррозом
                old_data = json.loads(prediction.patient_data)
                old_data["cirrhosis_data"] = cirrhosis_data
                prediction.patient_data = json.dumps(old_data, ensure_ascii=False)
                prediction.cirrhosis_stage = stage_pred
                prediction.cirrhosis_stage_confidence = stage_conf
                db.commit()
                print(f"Данные цирроза добавлены к прогнозу {prediction_id}")

            return {
                "prediction_id": prediction_id,
                "cirrhosis_stage": stage_pred,
                "cirrhosis_stage_confidence": stage_conf,
                "diagnosis_name": f"Цирроз печени, стадия {stage_pred}",
                "diagnosis_category": 4,
                "created_at": prediction.created_at.isoformat() if prediction else None
            }
        except Exception as e:
            print(f"Ошибка: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    else:
        raise HTTPException(status_code=404, detail="Модель не найдена")


@app.get("/api/history/prediction/{prediction_id}")
async def get_prediction_details(prediction_id: int, db: Session = Depends(get_db),
                                 current_user: dict = Depends(get_current_user)):
    prediction = db.query(PredictionHistory).filter(PredictionHistory.id == prediction_id).first()
    if not prediction:
        raise HTTPException(status_code=404, detail="Prediction not found")

    if current_user.get("role") != "admin" and prediction.user_id != current_user.get("user_id"):
        raise HTTPException(status_code=403, detail="Access denied")

    return {
        "id": prediction.id,
        "diagnosis": prediction.diagnosis,
        "diagnosis_category": prediction.diagnosis_category,
        "xgboost_prediction": prediction.xgboost_prediction,
        "xgboost_confidence": prediction.xgboost_confidence,
        "knn_prediction": prediction.knn_prediction,
        "knn_confidence": prediction.knn_confidence,
        "cirrhosis_stage": prediction.cirrhosis_stage,
        "cirrhosis_stage_confidence": prediction.cirrhosis_stage_confidence,
        "doctor_comment": prediction.doctor_comment,
        "patient_data": prediction.patient_data,
        "created_at": prediction.created_at.isoformat()
    }


# ============ ОБРАТНАЯ СВЯЗЬ ============
@app.post("/api/feedback")
async def submit_feedback(feedback: dict, db: Session = Depends(get_db),
                          current_user: dict = Depends(get_current_user)):
    prediction_id = feedback.get("prediction_id")
    doctor_agreed = feedback.get("doctor_agreed")
    doctor_comment = feedback.get("doctor_comment")

    prediction = db.query(PredictionHistory).filter(PredictionHistory.id == prediction_id).first()

    if not prediction:
        raise HTTPException(status_code=404, detail="Прогноз не найден")

    prediction.doctor_agreed = doctor_agreed
    if doctor_comment:
        prediction.doctor_comment = doctor_comment

    db.commit()

    return {"message": "Спасибо за обратную связь!", "prediction_id": prediction.id}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)