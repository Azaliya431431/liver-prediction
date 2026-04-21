from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Text
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()


class PredictionHistory(Base):
    __tablename__ = "prediction_history"

    id = Column(Integer, primary_key=True, index=True)
    # prediction_uuid - УДАЛИТЬ ЭТУ СТРОКУ
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
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)



class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)  # ДОБАВИТЬ ЭТУ СТРОКУ
    created_at = Column(DateTime, default=datetime.utcnow)