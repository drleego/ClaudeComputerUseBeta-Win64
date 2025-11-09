from __future__ import annotations
from typing import Any, Dict, List, Tuple
from fastapi import FastAPI, Body, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
import os
import math
from collections import Counter

"""
main_server_with_sync_endpoint.py (v2 - 필드명 정규화)
============================================================
[개선 버전 v2.1]
✅ 필드명 불일치 해결 (클라이언트-서버 동기화)
✅ 여러 가능한 필드명 자동 지원
✅ 입력 검증 강화
✅ 에러 처리 개선
============================================================

[주요 수정 사항]
1. FIELD_MAPPING 테이블 추가 (필드명 자동 매핑)
2. normalize_field() 함수 추가 (여러 필드명 지원)
3. 필드명 정규화 (retrain-automated 엔드포인트)
4. 데이터 유효성 검증 강화
5. 상세한 로깅 추가

[적용 방법]
1) 기존 파일 백업
2) 이 파일의 전체 코드로 교체
3) 서버 재시작 (python main_server_with_sync_endpoint.py)
4) 클라이언트에서 재학습 데이터 전송
"""

# ========================================
# 1. 상수 정의
# ========================================

FEATURE_KEYS: Tuple[str, ...] = (
    "eloDiff", "ppgDiff", "homeOsl", "drawOsl", "awayOsl",
    "poissonHomeProb", "avgDrawPercent", "upsetScoreDiff",
    "xgHomeFor", "xgAwayFor", "xgHomeAgainst", "xgAwayAgainst"
)

MODEL_DIR = os.path.join(os.getcwd(), "models")
MODEL_PATH = os.path.join(MODEL_DIR, "model.pkl")
MODEL_VERSION_FILE = os.path.join(MODEL_DIR, "version.txt")
PATTERNS_DB_PATH = os.path.join(MODEL_DIR, "patterns_db.json")
SUCCESS_DB_PATH = os.path.join(MODEL_DIR, "success_db.json")

# ========================================
# 2. 필드명 매핑 (개선: v2.1)
# ========================================

"""
✅ [신규] 필드명 정규화 테이블
클라이언트에서 다양한 필드명으로 데이터를 보낼 때,
이 매핑을 사용하여 자동으로 정규화합니다.
"""
FIELD_MAPPING = {
    # 레이블/결과 필드 (예측 결과 또는 실제 결과)
    "label": [
        "finalResult",           # 클라이언트 주로 사용
        "finalPrediction",       # 대체 필드명
        "label",                 # 표준 필드명
        "finalPredClean",        # 클라이언트 변형
        "prediction",            # 단순 필드명
        "result",                # 결과
        "outcome"                # 결과 (영어)
    ],
    # 특성/피처 필드
    "features": [
        "features",              # 표준
        "feature_dict",          # 대체명
        "feature",               # 단순명
        "featureDict",           # 카멜케이스
        "data"                   # 일반명
    ],
    # 미적중 패턴 규칙
    "warningRules": [
        "warningRules",          # 표준
        "warning_rules",         # 스네이크 케이스
        "patterns",              # 단순명
        "pattern_rules",         # 대체명
        "missPatterns"           # 설명적 명
    ],
    # 성공 패턴 규칙
    "successRules": [
        "successRules",          # 표준
        "success_rules",         # 스네이크 케이스
        "success",               # 단순명
        "successPatterns"        # 설명적 명
    ]
}

# ========================================
# 3. 클래스 상수
# ========================================

CLASS_TO_KEY = {0: "home", 1: "draw", 2: "away"}
KEY_TO_CLASS = {"home": 0, "draw": 1, "away": 2}
ALL_KEYS = ("home", "draw", "away")

# ========================================
# 4. 글로벌 변수
# ========================================

_sklearn_loaded = False
Pipeline = None
LogisticRegression = None
StandardScaler = None
CalibratedClassifierCV = None
joblib = None

_model = None
_model_version = "demo-1.0"
_patterns_db = {}
_success_db = {}

# ========================================
# 5. FastAPI 앱 생성
# ========================================

app = FastAPI(title="Football API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# ========================================
# 6. 유틸리티 함수
# ========================================

def _timestamp_str() -> str:
    """현재 시간 문자열 반환"""
    import datetime as _dt
    return _dt.datetime.now().strftime("%Y%m%d_%H%M%S")

def _safe_num(v: Any, default: float = 0.0) -> float:
    """안전한 숫자 변환"""
    try:
        x = float(v)
        return x if x == x else default
    except:
        return default

def _vec_from_features(feat: Dict[str, Any]) -> List[float]:
    """특성 딕셔너리를 벡터로 변환"""
    return [_safe_num(feat.get(k), 0.0) for k in FEATURE_KEYS]

# ========================================
# 7. 필드명 정규화 함수 (개선: v2.1)
# ========================================

def normalize_field(data: Dict[str, Any], field_name: str, allowed_keys: List[str]) -> Any:
    """
    ✅ [신규] 필드명 정규화
    
    데이터 딕셔너리에서 여러 가능한 필드명 중
    첫 번째로 발견되는 값을 반환합니다.
    
    Args:
        data: 데이터 딕셔너리
        field_name: 필드 이름 (로깅 용도)
        allowed_keys: 가능한 필드명 리스트
        
    Returns:
        필드값 또는 None
        
    Example:
        label = normalize_field(row, "label", FIELD_MAPPING["label"])
        # finalResult, finalPrediction, label 등 모두 찾아줌
    """
    for key in allowed_keys:
        if key in data:
            value = data[key]
            if value is not None:
                return value
    return None

# ========================================
# 8. sklearn 로드
# ========================================

def _ensure_sklearn():
    """sklearn 라이브러리 로드"""
    global _sklearn_loaded, Pipeline, LogisticRegression, StandardScaler, CalibratedClassifierCV, joblib
    
    if _sklearn_loaded:
        return
    
    from sklearn.pipeline import Pipeline as _Pipeline
    from sklearn.linear_model import LogisticRegression as _LR
    from sklearn.preprocessing import StandardScaler as _Std
    from sklearn.calibration import CalibratedClassifierCV as _Cal
    import joblib as _joblib
    
    Pipeline = _Pipeline
    LogisticRegression = _LR
    StandardScaler = _Std
    CalibratedClassifierCV = _Cal
    joblib = _joblib
    _sklearn_loaded = True

# ========================================
# 9. 모델 로드/저장
# ========================================

def _load_model_if_exists():
    """저장된 모델이 있으면 로드"""
    global _model, _model_version
    
    if os.path.exists(MODEL_PATH):
        _ensure_sklearn()
        try:
            _model = joblib.load(MODEL_PATH)
            if os.path.exists(MODEL_VERSION_FILE):
                with open(MODEL_VERSION_FILE, "r", encoding="utf-8") as f:
                    _model_version = f.read().strip() or _model_version
            print(f"✅ 모델 로드 완료: {_model_version}")
        except Exception as e:
            print(f"❌ 모델 로드 실패: {e}")

def _save_model(model, version: str):
    """모델 저장"""
    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    with open(MODEL_VERSION_FILE, "w", encoding="utf-8") as f:
        f.write(version)
    print(f"✅ 모델 저장: {version}")

# 페이지 로드 시 모델 로드
_load_model_if_exists()

# ========================================
# 10. 엔드포인트: 기본
# ========================================

@app.get("/")
def root() -> Dict[str, Any]:
    """루트 엔드포인트"""
    return {
        "ok": True,
        "service": "Football API",
        "docs": "/docs",
        "version": _model_version
    }

@app.get("/scheduler/status")
def scheduler_status() -> Dict[str, Any]:
    """스케줄러 상태 확인"""
    return {
        "ok": True,
        "model_loaded": _model is not None,
        "model_version": _model_version,
        "patterns_count": len(_patterns_db),
        "success_count": len(_success_db),
        "ts": _timestamp_str()
    }

# ========================================
# 11. 예측 함수
# ========================================

def _demo_proba(vec: List[float]) -> Dict[str, float]:
    """데모 확률 계산 (모델 없을 때)"""
    eloDiff, ppgDiff, homeOsl, drawOsl, awayOsl, poissonHomeProb, avgDrawPercent, upsetScoreDiff, xgHF, xgAF, xgHA, xgAA = vec
    
    sh = 0.40 * poissonHomeProb + 0.20 * (eloDiff / 100.0) + 0.10 * ppgDiff + 0.15 * homeOsl - 0.10 * (xgHA - xgHF)
    sd = 0.30 * (avgDrawPercent / 100.0) + 0.20 * drawOsl + 0.10 * (1 - abs(ppgDiff))
    sa = 0.35 * (1 - poissonHomeProb) + 0.20 * (-eloDiff / 100.0) + 0.10 * (-ppgDiff) + 0.15 * awayOsl
    
    eh, ed, ea = math.exp(sh), math.exp(sd), math.exp(sa)
    s = eh + ed + ea
    
    return {"home": eh / s, "draw": ed / s, "away": ea / s}

def _extract_proba_from_model(model, vec: List[float]) -> Dict[str, float]:
    """모델에서 확률 추출"""
    import numpy as np
    
    X = np.array(vec, dtype=float).reshape(1, -1)
    probs = model.predict_proba(X)[0]
    
    try:
        classes = list(model.classes_)
    except:
        try:
            classes = list(model.base_estimator.classes_)
        except:
            classes = [0, 1] if len(probs) == 2 else list(range(len(probs)))
    
    out = {k: 0.0 for k in ALL_KEYS}
    
    for cls, p in zip(classes, probs):
        key = CLASS_TO_KEY.get(int(cls))
        if key:
            out[key] = float(p)
    
    s = sum(out.values())
    return {k: out[k] / s for k in ALL_KEYS} if s > 0 else {k: 1.0 / 3.0 for k in ALL_KEYS}

# ========================================
# 12. 엔드포인트: 예측
# ========================================

@app.post("/predict-proba")
def predict_proba(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """확률 예측"""
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")
    
    features = payload.get("features") or {}
    vec = _vec_from_features(features)
    
    proba = _demo_proba(vec) if _model is None else _extract_proba_from_model(_model, vec)
    winner_key = max(proba, key=proba.get)
    label_map = {"home": "Home", "draw": "Draw", "away": "Away"}
    
    return {
        "proba": proba,
        "predicted_winner": winner_key,
        "predicted_winner_label": label_map[winner_key],
        "predicted_winner_prob": proba[winner_key],
        "model_version": _model_version,
        "ts": _timestamp_str(),
    }

# ========================================
# 13. 엔드포인트: 재학습 (개선: v2.1)
# ========================================

@app.post("/retrain-automated")
def retrain_automated(training_data: List[Dict[str, Any]] = Body(...)) -> Dict[str, Any]:
    """
    ✅ [개선] 자동 재학습 (필드명 정규화)
    
    클라이언트에서 보낸 데이터로 모델을 재학습합니다.
    다양한 필드명 형식을 자동으로 처리합니다.
    """
    if not isinstance(training_data, list):
        raise HTTPException(status_code=400, detail="Training data must be array")
    
    _ensure_sklearn()
    X_list, y_list = [], []
    valid_count = 0
    invalid_reason_counts = {}
    
    for row_idx, row in enumerate(training_data):
        if not isinstance(row, dict):
            invalid_reason_counts["not_dict"] = invalid_reason_counts.get("not_dict", 0) + 1
            continue
        
        # ✅ [개선] 필드명 정규화로 특성 추출
        feat = normalize_field(row, "features", FIELD_MAPPING["features"])
        
        # ✅ [개선] 필드명 정규화로 레이블 추출
        lab = normalize_field(row, "label", FIELD_MAPPING["label"])
        
        # 필드 검증
        if not isinstance(feat, dict):
            invalid_reason_counts["no_features"] = invalid_reason_counts.get("no_features", 0) + 1
            continue
        
        # 벡터 변환
        vec = _vec_from_features(feat)
        
        # 레이블 파싱
        if isinstance(lab, str):
            lab = lab.strip().lower()
            # ✅ [개선] 다양한 레이블 형식 지원
            if lab in ("home", "h", "home win", "홈 승", "1"):
                y = 0
            elif lab in ("draw", "d", "무승부", "x", "0"):
                y = 1
            elif lab in ("away", "a", "away win", "원정 승", "2"):
                y = 2
            else:
                invalid_reason_counts["invalid_label"] = invalid_reason_counts.get("invalid_label", 0) + 1
                continue
        else:
            try:
                y = int(lab)
                if y not in (0, 1, 2):
                    invalid_reason_counts["label_out_of_range"] = invalid_reason_counts.get("label_out_of_range", 0) + 1
                    continue
            except:
                invalid_reason_counts["invalid_label_type"] = invalid_reason_counts.get("invalid_label_type", 0) + 1
                continue
        
        X_list.append(vec)
        y_list.append(y)
        valid_count += 1
    
    # 데이터 유효성 확인
    if not X_list:
        error_msg = f"No valid samples. Invalid reasons: {invalid_reason_counts}"
        print(f"❌ {error_msg}")
        raise HTTPException(status_code=400, detail=error_msg)
    
    # 클래스 분포 확인
    import numpy as np
    X = np.array(X_list, dtype=float)
    y = np.array(y_list, dtype=int)
    counts = Counter(int(v) for v in y.tolist())
    uniq = sorted(counts.keys())
    
    if len(uniq) < 2:
        raise HTTPException(status_code=400, detail="Need 2+ classes")
    
    # 모델 구성
    base = Pipeline([
        ("scaler", StandardScaler(with_mean=True, with_std=True)),
        ("lr", LogisticRegression(multi_class="multinomial", solver="lbfgs", max_iter=2000, class_weight="balanced"))
    ])
    
    min_class_count = min(counts.values())
    use_calib = (min_class_count >= 2 and len(y) >= 6)
    
    if use_calib:
        try:
            clf = CalibratedClassifierCV(estimator=base, method="sigmoid", cv=2 if min_class_count == 2 else 3)
        except TypeError:
            clf = CalibratedClassifierCV(base_estimator=base, method="sigmoid", cv=2 if min_class_count == 2 else 3)
        clf.fit(X, y)
        mode = "calibrated"
    else:
        clf = base.fit(X, y)
        mode = "plain-logreg"
    
    # 모델 업데이트
    global _model, _model_version
    _model = clf
    _model_version = f"sklr-{mode}-{_timestamp_str()}"
    
    try:
        _save_model(_model, _model_version)
        saved = True
    except:
        saved = False
    
    # 로깅
    print(f"✅ 재학습 완료: {valid_count}개 샘플, {mode} 모드")
    print(f"   클래스 분포: {dict(counts)}")
    
    return {
        "ok": True,
        "received": len(X_list),
        "valid": valid_count,
        "invalid": len(training_data) - valid_count,
        "invalid_reasons": invalid_reason_counts,
        "class_counts": dict(counts),
        "new_model_version": _model_version,
        "saved": saved,
        "mode": mode,
    }

@app.post("/retrain-models")
def retrain_models(payload: Any = Body(...)) -> Dict[str, Any]:
    """재학습 (레거시 엔드포인트)"""
    n = len(payload) if isinstance(payload, list) else 1
    return {"ok": True, "received": n, "ts": _timestamp_str()}

# ========================================
# 14. 엔드포인트: 패턴 동기화 (개선: v2.1)
# ========================================

@app.post("/sync-patterns-db")
def sync_patterns_db(data: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """
    ✅ [개선] 미적중 패턴 DB 동기화 (입력 검증 강화)
    """
    global _patterns_db
    
    # ✅ [개선] 필드명 정규화
    warning_rules = normalize_field(data, "warningRules", FIELD_MAPPING["warningRules"])
    
    # [검증] 입력 확인
    if warning_rules is None:
        raise HTTPException(status_code=400, detail="Missing warningRules in request body")
    
    # [검증] 데이터 유효성 확인
    if not isinstance(warning_rules, dict):
        raise HTTPException(status_code=400, detail="warningRules must be a dictionary")
    
    if len(warning_rules) == 0:
        print("⚠️ 빈 warningRules 수신")
        return {
            "ok": True,
            "warning": "Empty warningRules",
            "stored_patterns": 0
        }
    
    _patterns_db = warning_rules
    
    # [로깅] 저장된 패턴 정보 출력
    print(f"✅ 미적중 패턴 동기화: {len(_patterns_db)}개 패턴")
    for pattern_name, pattern_data in list(warning_rules.items())[:3]:
        print(f"   - {pattern_name}: {pattern_data.get('total', 0)}회, {pattern_data.get('missRate', 0):.1%} 미적중")
    
    return {
        "ok": True,
        "stored_patterns": len(_patterns_db),
        "timestamp": _timestamp_str()
    }

@app.post("/sync-success-db")
def sync_success_db(data: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """
    ✅ [개선] 성공 패턴 DB 동기화 (입력 검증 강화)
    """
    global _success_db
    
    # ✅ [개선] 필드명 정규화
    success_rules = normalize_field(data, "successRules", FIELD_MAPPING["successRules"])
    
    # [검증] 입력 확인
    if success_rules is None:
        raise HTTPException(status_code=400, detail="Missing successRules in request body")
    
    # [검증] 데이터 유효성 확인
    if not isinstance(success_rules, dict):
        raise HTTPException(status_code=400, detail="successRules must be a dictionary")
    
    if len(success_rules) == 0:
        print("⚠️ 빈 successRules 수신")
        return {
            "ok": True,
            "warning": "Empty successRules",
            "stored_patterns": 0
        }
    
    _success_db = success_rules
    
    # [로깅] 저장된 패턴 정보 출력
    print(f"✅ 성공 패턴 동기화: {len(_success_db)}개 패턴")
    for pattern_name, pattern_data in list(success_rules.items())[:3]:
        print(f"   - {pattern_name}: {pattern_data.get('total', 0)}회, {pattern_data.get('successRate', 0):.1%} 적중")
    
    return {
        "ok": True,
        "stored_patterns": len(_success_db),
        "timestamp": _timestamp_str()
    }

# ========================================
# 15. 엔드포인트: DB 조회
# ========================================

@app.get("/fetch-patterns-db")
def fetch_patterns_db() -> Dict[str, Any]:
    """패턴 DB 조회"""
    return {
        "ok": True,
        "warningRules": _patterns_db,
        "successRules": _success_db,
        "patterns_count": len(_patterns_db),
        "success_count": len(_success_db),
        "model_version": _model_version,
        "ts": _timestamp_str()
    }

@app.get("/fetch-models-insights")
def fetch_models_insights() -> Dict[str, Any]:
    """모델 인사이트 조회"""
    top_miss = sorted(
        [(k, v.get("missRate", 0), v.get("total", 0)) for k, v in _patterns_db.items()],
        key=lambda x: x[1],
        reverse=True
    )[:5]
    
    top_success = sorted(
        [(k, v.get("successRate", 0), v.get("total", 0)) for k, v in _success_db.items()],
        key=lambda x: x[1],
        reverse=True
    )[:5]
    
    return {
        "ok": True,
        "model_version": _model_version,
        "total_warning_patterns": len(_patterns_db),
        "total_success_patterns": len(_success_db),
        "top_miss_patterns": [
            {"name": n, "miss_rate": f"{r*100:.1f}%", "total": t}
            for n, r, t in top_miss
        ],
        "top_success_patterns": [
            {"name": n, "success_rate": f"{r*100:.1f}%", "total": t}
            for n, r, t in top_success
        ],
        "ts": _timestamp_str()
    }

# ========================================
# 16. 메인
# ========================================

if __name__ == "__main__":
    import uvicorn
    
    print("=" * 70)
    print("🚀 Football API 서버 시작")
    print("=" * 70)
    print("📍 주소: http://127.0.0.1:8000")
    print("📚 문서: http://127.0.0.1:8000/docs")
    print()
    print("✅ 주요 기능:")
    print("   - POST /predict-proba : 경기 확률 예측")
    print("   - POST /retrain-automated : 모델 자동 재학습 (필드명 정규화)")
    print("   - POST /sync-patterns-db : 미적중 패턴 동기화")
    print("   - POST /sync-success-db : 성공 패턴 동기화")
    print("   - GET /fetch-patterns-db : 패턴 DB 조회")
    print("   - GET /fetch-models-insights : 모델 인사이트 조회")
    print("=" * 70)
    print()
    
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=False)

"""
========================================
파일 사용 방법
========================================

1. 기존 파일 백업:
   cp main_server_with_sync_endpoint.py \
      main_server_with_sync_endpoint.py.backup

2. 이 코드로 완전 교체

3. 서버 재시작:
   python main_server_with_sync_endpoint.py
   또는
   python3 main_server_with_sync_endpoint.py

4. 로그 확인:
   터미널에서 로그 메시지 확인
   
5. 테스트 (curl):
   curl http://127.0.0.1:8000/scheduler/status

========================================
주요 변경 사항 (v2.1)
========================================

1. FIELD_MAPPING 테이블 추가
   → 여러 가능한 필드명 매핑

2. normalize_field() 함수 추가
   → 자동 필드명 정규화
   → 클라이언트와 서버 필드명 불일치 해결

3. /retrain-automated 개선
   → finalResult, finalPrediction, label 모두 지원
   → 홈 승, 원정 승, 무승부 한글 지원
   → 상세한 에러 메시지

4. /sync-patterns-db 개선
   → warningRules, warning_rules, patterns 모두 지원

5. /sync-success-db 개선
   → successRules, success_rules, success 모두 지원

6. 로깅 강화
   → 각 동작마다 상세 로그 출력
   → 문제 추적 용이

========================================
"""