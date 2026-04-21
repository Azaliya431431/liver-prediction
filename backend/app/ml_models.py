import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.neighbors import KNeighborsClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix
import xgboost as xgb
import joblib
import os
from typing import Tuple, Dict, Any, Optional


class LiverDiseaseModels:
    def __init__(self):
        self.hepatitis_scaler = None
        self.cirrhosis_scaler = None
        self.xgboost_model = None
        self.knn_model = None
        self.cirrhosis_model = None
        self.label_encoders = {}
        self.feature_columns_hepatitis = [
            'Age', 'Sex', 'ALB', 'ALP', 'ALT', 'AST', 'BIL',
            'CHE', 'CHOL', 'CREA', 'GGT', 'PROT'
        ]
        self.feature_columns_cirrhosis = [
            'N_Days', 'Status', 'Drug', 'Ascites', 'Hepatomegaly',
            'Spiders', 'Edema', 'Copper', 'Alk_Phos',
            'Tryglicerides', 'Platelets', 'Prothrombin'
        ]

    def preprocess_hepatitis_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """Preprocess hepatitis dataset"""
        df = df.copy()

        # Конвертируем все колонки в правильные типы
        numeric_cols = ['Age', 'ALB', 'ALP', 'ALT', 'AST', 'BIL', 'CHE', 'CHOL', 'CREA', 'GGT', 'PROT']
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce')

        # Заполняем пропуски медианой только для числовых колонок
        for col in numeric_cols:
            if col in df.columns:
                df[col] = df[col].fillna(df[col].median())

        # Encode categorical variables
        if 'Sex' in df.columns:
            le_sex = LabelEncoder()
            df['Sex'] = df['Sex'].fillna('m')
            df['Sex'] = le_sex.fit_transform(df['Sex'])
            self.label_encoders['Sex'] = le_sex

        return df

    def preprocess_cirrhosis_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """Preprocess cirrhosis dataset"""
        df = df.copy()

        # Заменяем 'NA' и другие строковые NaN на None
        df = df.replace(['NA', 'NaN', 'None', ''], np.nan)

        # Числовые колонки
        numeric_cols = ['N_Days', 'Copper', 'Alk_Phos', 'Tryglicerides', 'Platelets', 'Prothrombin', 'Age']
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce')
                df[col] = df[col].fillna(df[col].median())

        # Encode categorical variables
        categorical_cols = ['Status', 'Drug', 'Ascites', 'Hepatomegaly', 'Spiders', 'Edema']
        for col in categorical_cols:
            if col in df.columns:
                df[col] = df[col].fillna('N')
                le = LabelEncoder()
                df[col] = le.fit_transform(df[col].astype(str))
                self.label_encoders[f'cirrhosis_{col}'] = le

        return df

    def train_hepatitis_models(self, df: pd.DataFrame, test_size: float = 0.2,
                               validation_size: float = 0.1,
                               xgboost_params: Optional[Dict] = None,
                               knn_params: Optional[Dict] = None) -> Dict[str, Any]:
        """Train XGBoost and KNN models for hepatitis diagnosis"""

        print("Training hepatitis models...")

        # Preprocess data
        df = self.preprocess_hepatitis_data(df)

        # Prepare features and target
        X = df[self.feature_columns_hepatitis]

        # Handle Category column
        if 'Category' in df.columns:
            y_raw = df['Category']
        else:
            raise ValueError("Category column not found in dataset")

        # Convert Category to numeric - извлекаем число из строки типа '0=Blood Donor'
        def extract_category_value(val):
            # Проверяем на NaN/None
            if pd.isna(val):
                return None
            # Если уже число
            if isinstance(val, (int, float)):
                try:
                    return int(val)
                except:
                    return None
            # Если строка
            if isinstance(val, str):
                val = val.strip()
                if not val:
                    return None
                # Пробуем извлечь число из строки типа '0=Blood Donor'
                if '=' in val:
                    try:
                        return int(float(val.split('=')[0]))
                    except:
                        return None
                # Пробуем просто преобразовать в число
                try:
                    return int(float(val))
                except:
                    return None
            return None

        # Применяем извлечение
        y = y_raw.apply(extract_category_value)

        # Удаляем строки с NaN (как в X, так и в y)
        valid_mask = y.notna()
        rows_before = len(X)
        X = X[valid_mask]
        y = y[valid_mask]
        rows_after = len(X)

        print(f"Удалено строк с пропусками: {rows_before - rows_after}")
        print(f"Осталось строк: {rows_after}")

        if rows_after == 0:
            raise ValueError("Нет валидных данных для обучения!")

        # Преобразуем в int
        y = y.astype(int)

        print(f"Unique categories: {y.unique()}")

        # Encode categories to 0..n-1
        le_category = LabelEncoder()
        y = le_category.fit_transform(y)
        self.label_encoders['Category'] = le_category

        print(f"Encoded categories: {dict(zip(le_category.classes_, range(len(le_category.classes_))))}")

        # Split data: train+val and test
        X_temp, X_test, y_temp, y_test = train_test_split(
            X, y, test_size=test_size, random_state=42, stratify=y
        )

        # Split train and validation
        val_ratio = validation_size / (1 - test_size)
        X_train, X_val, y_train, y_val = train_test_split(
            X_temp, y_temp, test_size=val_ratio, random_state=42, stratify=y_temp
        )

        # Scale features
        self.hepatitis_scaler = StandardScaler()
        X_train_scaled = self.hepatitis_scaler.fit_transform(X_train)
        X_val_scaled = self.hepatitis_scaler.transform(X_val)
        X_test_scaled = self.hepatitis_scaler.transform(X_test)

        # Default parameters
        if xgboost_params is None:
            xgboost_params = {
                'n_estimators': 100,
                'max_depth': 6,
                'learning_rate': 0.1,
                'random_state': 42
            }

        if knn_params is None:
            knn_params = {
                'n_neighbors': 5,
                'weights': 'distance'
            }

        # Train XGBoost
        print("Training XGBoost...")
        self.xgboost_model = xgb.XGBClassifier(**xgboost_params)
        self.xgboost_model.fit(X_train_scaled, y_train,
                               eval_set=[(X_val_scaled, y_val)],
                               verbose=False)

        # Train KNN
        print("Training KNN...")
        self.knn_model = KNeighborsClassifier(**knn_params)
        self.knn_model.fit(X_train_scaled, y_train)

        # Evaluate models
        metrics = {}
        for model_name, model, X_eval, y_eval in [
            ('XGBoost', self.xgboost_model, X_test_scaled, y_test),
            ('KNN', self.knn_model, X_test_scaled, y_test)
        ]:
            y_pred = model.predict(X_eval)

            metrics[model_name] = {
                'accuracy': float(accuracy_score(y_eval, y_pred)),
                'precision': float(precision_score(y_eval, y_pred, average='weighted', zero_division=0)),
                'recall': float(recall_score(y_eval, y_pred, average='weighted', zero_division=0)),
                'f1_score': float(f1_score(y_eval, y_pred, average='weighted', zero_division=0)),
                'confusion_matrix': confusion_matrix(y_eval, y_pred).tolist()
            }

        # Feature importance for XGBoost
        feature_importance = {}
        if hasattr(self.xgboost_model, 'feature_importances_'):
            feature_importance = dict(zip(self.feature_columns_hepatitis,
                                          self.xgboost_model.feature_importances_.tolist()))

        # Save models
        self._save_models()

        print("Hepatitis models training completed!")
        print(f"XGBoost Accuracy: {metrics['XGBoost']['accuracy']:.4f}")
        print(f"KNN Accuracy: {metrics['KNN']['accuracy']:.4f}")

        return {
            'metrics': metrics,
            'feature_importance': feature_importance,
            'train_size': len(X_train),
            'val_size': len(X_val),
            'test_size': len(X_test),
            'rows_removed': rows_before - rows_after,
            'rows_remaining': rows_after
        }





    def train_cirrhosis_model(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Train model for cirrhosis stage prediction"""

        print("Training cirrhosis model...")

        # Preprocess data
        df = self.preprocess_cirrhosis_data(df)

        # Remove rows with NA in Stage
        if 'Stage' in df.columns:
            # Удаляем строки где Stage = 'NA' или NaN
            rows_before = len(df)
            df = df[df['Stage'] != 'NA']
            df = df.dropna(subset=['Stage'])
            df['Stage'] = pd.to_numeric(df['Stage'], errors='coerce')
            df = df.dropna(subset=['Stage'])
            rows_after = len(df)
            print(f"Удалено строк с пропусками в Stage: {rows_before - rows_after}")

            if rows_after == 0:
                raise ValueError("Нет валидных данных для обучения модели цирроза!")

            df['Stage'] = df['Stage'].astype(int) - 1  # Convert to 0-3
        else:
            raise ValueError("Stage column not found in dataset")

        # Prepare features and target
        X = df[self.feature_columns_cirrhosis]
        y = df['Stage']

        # Удаляем строки с NaN в признаках
        rows_before = len(X)
        X = X.dropna()
        y = y[X.index]
        rows_after = len(X)
        print(f"Удалено строк с пропусками в признаках: {rows_before - rows_after}")

        if rows_after == 0:
            raise ValueError("Нет валидных данных для обучения!")

        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )

        X_train, X_val, y_train, y_val = train_test_split(
            X_train, y_train, test_size=0.125, random_state=42, stratify=y_train
        )

        # Scale features
        self.cirrhosis_scaler = StandardScaler()
        X_train_scaled = self.cirrhosis_scaler.fit_transform(X_train)
        X_val_scaled = self.cirrhosis_scaler.transform(X_val)
        X_test_scaled = self.cirrhosis_scaler.transform(X_test)

        # Train XGBoost for cirrhosis stage
        self.cirrhosis_model = xgb.XGBClassifier(
            n_estimators=100,
            max_depth=5,
            learning_rate=0.1,
            random_state=42
        )
        self.cirrhosis_model.fit(X_train_scaled, y_train,
                                 eval_set=[(X_val_scaled, y_val)],
                                 verbose=False)

        # Evaluate
        y_pred = self.cirrhosis_model.predict(X_test_scaled)
        metrics = {
            'accuracy': float(accuracy_score(y_test, y_pred)),
            'precision': float(precision_score(y_test, y_pred, average='weighted', zero_division=0)),
            'recall': float(recall_score(y_test, y_pred, average='weighted', zero_division=0)),
            'f1_score': float(f1_score(y_test, y_pred, average='weighted', zero_division=0)),
            'confusion_matrix': confusion_matrix(y_test, y_pred).tolist()
        }

        feature_importance = {}
        if hasattr(self.cirrhosis_model, 'feature_importances_'):
            feature_importance = dict(zip(self.feature_columns_cirrhosis,
                                          self.cirrhosis_model.feature_importances_.tolist()))

        self._save_models()

        print("Cirrhosis model training completed!")
        print(f"Accuracy: {metrics['accuracy']:.4f}")

        return {
            'metrics': metrics,
            'feature_importance': feature_importance
        }

    def predict_hepatitis(self, features: pd.DataFrame) -> Tuple[int, float, int, float]:
        """Predict hepatitis diagnosis"""
        # Ensure features have correct types
        features_scaled = self.hepatitis_scaler.transform(features)

        # XGBoost prediction
        xgb_pred = int(self.xgboost_model.predict(features_scaled)[0])
        xgb_proba = self.xgboost_model.predict_proba(features_scaled)[0]
        xgb_confidence = float(max(xgb_proba))

        # KNN prediction
        knn_pred = int(self.knn_model.predict(features_scaled)[0])
        knn_proba = self.knn_model.predict_proba(features_scaled)[0]
        knn_confidence = float(max(knn_proba))

        return xgb_pred, xgb_confidence, knn_pred, knn_confidence

    def predict_cirrhosis_stage(self, features: pd.DataFrame) -> Tuple[int, float]:
        """Predict cirrhosis stage"""
        features_scaled = self.cirrhosis_scaler.transform(features)
        stage_pred = int(self.cirrhosis_model.predict(features_scaled)[0])
        stage_proba = self.cirrhosis_model.predict_proba(features_scaled)[0]
        stage_confidence = float(max(stage_proba))

        return int(stage_pred + 1), stage_confidence  # Convert back to 1-4

    def _save_models(self):
        """Save models to disk"""
        os.makedirs('models', exist_ok=True)
        if self.xgboost_model:
            joblib.dump(self.xgboost_model, 'models/xgboost_model.pkl')
        if self.knn_model:
            joblib.dump(self.knn_model, 'models/knn_model.pkl')
        if self.cirrhosis_model:
            joblib.dump(self.cirrhosis_model, 'models/cirrhosis_model.pkl')
        if self.hepatitis_scaler:
            joblib.dump(self.hepatitis_scaler, 'models/hepatitis_scaler.pkl')
        if self.cirrhosis_scaler:
            joblib.dump(self.cirrhosis_scaler, 'models/cirrhosis_scaler.pkl')
        joblib.dump(self.label_encoders, 'models/label_encoders.pkl')
        print("Models saved to disk")

    def load_models(self):
        """Load models from disk"""
        try:
            self.xgboost_model = joblib.load('models/xgboost_model.pkl')
            self.knn_model = joblib.load('models/knn_model.pkl')
            self.cirrhosis_model = joblib.load('models/cirrhosis_model.pkl')
            self.hepatitis_scaler = joblib.load('models/hepatitis_scaler.pkl')
            self.cirrhosis_scaler = joblib.load('models/cirrhosis_scaler.pkl')
            self.label_encoders = joblib.load('models/label_encoders.pkl')
            print("Models loaded from disk")
            return True
        except Exception as e:
            print(f"Could not load models: {e}")
            return False


# Global instance
ml_models = LiverDiseaseModels()