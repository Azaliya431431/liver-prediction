from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

class UserLogin(BaseModel):
    username: str
    password: str

class UserCreate(BaseModel):
    username: str
    password: str
    role: str
    full_name: Optional[str] = None

class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    full_name: Optional[str] = None
    created_at: Optional[datetime] = None

class HepatitisData(BaseModel):
    Age: int
    Sex: str
    ALB: float
    ALP: float
    ALT: float
    AST: float
    BIL: float
    CHE: float
    CHOL: float
    CREA: float
    GGT: float
    PROT: float

class CirrhosisData(BaseModel):
    N_Days: int
    Status: str
    Drug: str
    Ascites: str
    Hepatomegaly: str
    Spiders: str
    Edema: str
    Copper: float
    Alk_Phos: float
    Tryglicerides: float
    Platelets: float
    Prothrombin: float

class PredictionRequest(BaseModel):
    hepatitis_data: HepatitisData
    cirrhosis_data: Optional[CirrhosisData] = None

class PredictionResponse(BaseModel):
    diagnosis_category: int
    diagnosis_name: str
    xgboost_prediction: int
    xgboost_confidence: float
    knn_prediction: int
    knn_confidence: float
    final_diagnosis: str
    cirrhosis_stage: Optional[int] = None
    cirrhosis_stage_confidence: Optional[float] = None
    recommendations: List[str]
    prediction_id: Optional[str] = None

class FeedbackRequest(BaseModel):
    prediction_id: int  # Теперь это int, а не str
    doctor_agreed: bool
    doctor_comment: Optional[str] = None
    prediction_data: Optional[Dict[str, Any]] = None

class TrainingParams(BaseModel):
    test_size: float = 0.2
    validation_size: float = 0.1
    xgboost_params: Optional[Dict[str, Any]] = None
    knn_params: Optional[Dict[str, Any]] = None

class TrainingResponse(BaseModel):
    xgboost_metrics: Dict[str, Any]
    knn_metrics: Dict[str, Any]
    confusion_matrices: Dict[str, Any]
    feature_importance: Optional[Dict[str, Any]] = None