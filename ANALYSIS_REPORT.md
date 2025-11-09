# ClaudeComputerUseBeta-Win64 저장소 분석 보고서

## 📋 개요

이 저장소는 **두 개의 독립적인 프로젝트**로 구성되어 있습니다:

1. **Claude Computer Use Beta (Windows 64bit)** - Python 기반 GUI 애플리케이션
2. **축구 경기 예측 AI 시스템** - JavaScript/HTML 기반 웹 애플리케이션

---

## 🖥️ 프로젝트 1: Claude Computer Use Beta

### 1.1 목적
Anthropic의 Claude 3.5 Sonnet API를 활용하여 Windows 환경에서 컴퓨터를 자동으로 제어하는 베타 프로그램입니다. Claude AI가 사용자의 명령을 받아 마우스, 키보드, 스크린샷 등을 제어하여 작업을 자동화합니다.

### 1.2 핵심 아키텍처

```
main.py (진입점)
    ↓
computeruse/
    ├── gui/
    │   ├── main_window.py      # Tkinter GUI 메인 윈도우
    │   ├── components.py       # UI 컴포넌트들
    │   └── styles.py           # UI 스타일 정의
    ├── core/
    │   ├── interface.py        # Claude API 인터페이스
    │   ├── action_handler.py   # 액션 실행 핸들러
    │   └── screenshot_manager.py # 스크린샷 관리
    └── utils/
        ├── config.py           # 설정 관리
        └── logger.py           # 로깅 시스템
```

### 1.3 주요 로직 흐름

#### **초기화 단계** (main.py:63-101)
```
1. 로깅 설정 → logs/ 디렉토리에 타임스탬프 로그 파일 생성
2. 패키지 의존성 체크 (anthropic, Pillow, PyAutoGUI)
3. Tkinter 윈도우 생성 및 ComputerInterface 초기화
4. 예외 핸들러 등록
5. 메인 루프 시작
```

#### **API 초기화 단계** (interface.py:47-81)
```
1. 사용자가 API 키 입력 → Initialize 버튼 클릭
2. Anthropic 클라이언트 생성
3. 테스트 메시지로 연결 검증 (claude-3-5-sonnet-20241022 모델)
4. computer-use-2024-10-22 베타 기능 활성화
5. GUI 상태 업데이트 (Submit 버튼 활성화)
```

#### **작업 실행 단계** (main_window.py:164-203)
```
1. 사용자 프롬프트 입력 → Submit 클릭
2. 별도 스레드에서 process_task() 실행
3. 현재 화면 스크린샷 캡처 (downscale 적용)
4. 프롬프트 + 스크린샷을 Claude API로 전송
5. Claude 응답 처리 시작
```

#### **응답 처리 루프** (interface.py:163-267)
```
while (현재 iteration < 최대 iteration) and (작업 미완료):
    1. Claude 응답 파싱
        - 텍스트 응답: 로그 출력, 완료 키워드 감지
        - 도구 사용 요청: action_handler로 전달

    2. 액션 실행 (action_handler.py:20-67)
        - screenshot: 화면 캡처
        - mouse_move: 마우스 이동 (좌표 스케일 변환)
        - left_click/right_click/double_click: 클릭
        - drag: 드래그 앤 드롭
        - type: 텍스트 입력
        - key: 특수 키 입력
        - scroll: 스크롤
        - wait: 대기

    3. 액션 결과 + 새 스크린샷으로 다시 API 호출
    4. 완료 키워드 감지 시 루프 종료
        - "task completed", "successfully completed" 등
```

### 1.4 핵심 기술 요소

**좌표 변환 로직** (action_handler.py:129-164)
- 문제: Claude는 다운스케일된 이미지를 보지만, 실제 마우스는 원본 해상도로 움직임
- 해결: 스케일 팩터 기반 좌표 변환
```python
scale_x = native_width / (native_width * downscale)
real_x = claude_x * scale_x
```

**스크린샷 최적화** (screenshot_manager.py:20-72)
- JPEG 포맷, 품질 60, LANCZOS 리샘플링
- 기본 다운스케일 0.5 (토큰 제한 대응)
- Base64 인코딩으로 API 전송

**반복 제어** (interface.py:26, 169-173)
- 최대 반복 횟수: 20회 (기본값)
- 액션 간 최소 지연: 0.5초
- 완료 후 대기 시간: 3.0초

### 1.5 알려진 제한사항 (README.md:62-65)
1. 다운스케일로 인한 커서 위치 부정확성
2. 목표 달성 여부 식별 오류
3. 액션 완료 대기 시간 보정 필요

---

## ⚽ 프로젝트 2: 축구 경기 예측 AI 시스템

### 2.1 목적
축구 경기 결과(홈 승/무승부/원정 승)를 예측하고, 예측 패턴의 성공/실패를 학습하여 정확도를 향상시키는 머신러닝 시스템입니다.

### 2.2 시스템 아키텍처

```
[프론트엔드]
축구 경기 분석기.html
    ↓
[클라이언트 로직]
App_logic_integration.js      # 예측 수집 및 통합
PatternAnalyzer.js            # 미적중 패턴 학습
SuccessAnalyzer.js            # 성공 패턴 학습
DataParserUtil.js             # 데이터 파싱
    ↓
[백엔드 서버]
main_server_with_sync_endpoint.py  # 메인 API 서버 (FastAPI)
pattern_sync_server.py              # 패턴 동기화 서버 (Flask)
cors_probe_server.py                # CORS 테스트 서버
```

### 2.3 핵심 로직 흐름

#### **Phase 1: 예측 수집** (App_logic_integration.js:18-49)
```javascript
class PredictionExporter {
    collectPrediction(prediction) {
        // 예측 데이터 표준화
        standardized = {
            league, homeTeam, awayTeam,
            prediction: "H" | "D" | "A",  // 홈/무승부/원정
            confidence,
            features: [eloDiff, ppgDiff, xG, ...],
            odds, form, timestamp
        }
        this.predictions.push(standardized);
    }
}
```

#### **Phase 2: 미적중 패턴 분석** (PatternAnalyzer.js:99-190)
```javascript
function _parseRowDataWithMissCheck(dataset) {
    1. DataParserUtil로 데이터 파싱
    2. 예측 vs 실제 결과 비교
    3. 미적중 여부 계산

    if (isMiss) {
        패턴 분류:
        - PAT_A_ALL_PREDICT_DIFFERENT: 모든 예측 모델 불일치
        - PAT_B_HANDICAP_DIFFERENT: 핸디캡 예측 불일치
        - PAT_C_HIGH_UPSET_SCORE_DIFF: 스코어 차이 큼
        - PAT_D_OU_PREDICTION_DIFFERENT: 오버/언더 불일치
        - PAT_E_BTTS_DIFFERENT: 양팀 득점 불일치
    }
}
```

**패턴 학습 알고리즘:**
```
for each 경기 데이터:
    if 예측 미적중:
        적용된 패턴 분류
        각 패턴 통계 업데이트:
            - 총 발생 횟수 (total)
            - 미적중 횟수 (misses)
            - 미적중률 (missRate = misses / total)

        if missRate > 임계값:
            경고 패턴으로 등록
```

#### **Phase 3: 성공 패턴 분석** (SuccessAnalyzer.js:140-177)
```javascript
function _classifySuccessPatterns(data) {
    패턴 분류:
    - SC_A_HPL_BT_STRONG_CONSENSUS:
        HPL과 BT 모델 강력 합의 (신뢰도 > 70%)

    - SC_B_HIGH_CONFIDENCE:
        예측 신뢰도 매우 높음 (> 75%)

    각 패턴 통계:
        - 총 발생 횟수
        - 성공 횟수
        - 성공률 (successRate)
}
```

#### **Phase 4: 서버 재학습** (main_server_with_sync_endpoint.py:336-459)
```python
@app.post("/retrain-automated")
def retrain_automated(training_data):
    1. 데이터 정규화 (필드명 매핑)
        - "finalResult" | "finalPrediction" | "label" → label
        - "홈 승" | "Home" | "H" | "1" → 0
        - "무승부" | "Draw" | "D" | "X" → 1
        - "원정 승" | "Away" | "A" | "2" → 2

    2. 특성 벡터 변환
        features = [eloDiff, ppgDiff, homeOsl, drawOsl, awayOsl,
                   poissonHomeProb, avgDrawPercent, upsetScoreDiff,
                   xgHomeFor, xgAwayFor, xgHomeAgainst, xgAwayAgainst]

    3. 모델 학습
        if 충분한 데이터:
            Pipeline[
                StandardScaler → 특성 정규화
                LogisticRegression(multinomial) → 다항 분류
                CalibratedClassifierCV → 확률 보정
            ]

    4. 모델 저장 (models/model.pkl)
    5. 버전 업데이트 (sklr-calibrated-{timestamp})
```

#### **Phase 5: 패턴 동기화** (main_server_with_sync_endpoint.py:471-547)
```python
@app.post("/sync-patterns-db")
def sync_patterns_db(data):
    # 미적중 패턴 저장
    _patterns_db = warningRules

@app.post("/sync-success-db")
def sync_success_db(data):
    # 성공 패턴 저장
    _success_db = successRules
```

#### **Phase 6: 예측 실행** (main_server_with_sync_endpoint.py:310-330)
```python
@app.post("/predict-proba")
def predict_proba(payload):
    features → 벡터 변환

    if model_exists:
        proba = model.predict_proba(vector)
    else:
        # 데모 모드: 휴리스틱 계산
        sh = 0.40 * poissonHomeProb + 0.20 * (eloDiff/100) + ...
        sd = 0.30 * (avgDrawPercent/100) + ...
        sa = 0.35 * (1 - poissonHomeProb) + ...

        # Softmax 정규화
        proba = {
            home: exp(sh) / (exp(sh) + exp(sd) + exp(sa)),
            draw: exp(sd) / (exp(sh) + exp(sd) + exp(sa)),
            away: exp(sa) / (exp(sh) + exp(sd) + exp(sa))
        }

    return {proba, predicted_winner, confidence}
```

### 2.4 핵심 기술 요소

**특성 엔지니어링** (12개 특성)
1. `eloDiff`: Elo 레이팅 차이
2. `ppgDiff`: 경기당 득점 차이
3. `homeOsl`, `drawOsl`, `awayOsl`: 오즈 역수
4. `poissonHomeProb`: 푸아송 분포 홈 승률
5. `avgDrawPercent`: 평균 무승부 비율
6. `upsetScoreDiff`: 이변 가능성 스코어
7-10. `xgHomeFor/Against`, `xgAwayFor/Against`: Expected Goals

**패턴 학습 메커니즘**
```
localStorage ↔ JavaScript 패턴 분석기 ↔ Python 백엔드 ↔ scikit-learn 모델

학습 사이클:
1. 브라우저에서 예측 실행
2. 실제 결과 입력
3. PatternAnalyzer/SuccessAnalyzer로 패턴 추출
4. localStorage에 저장
5. 서버로 동기화
6. 모델 재학습
7. 다음 예측에 반영
```

**오류 처리** (v5 강화)
- try-catch로 모든 주요 함수 보호
- null/undefined 안전 체크
- 부분 실패 격리 (한 데이터 오류가 전체 중단 방지)
- 상세 에러 로깅

### 2.5 데이터 흐름

```
사용자 → HTML 인터페이스
    ↓
경기 데이터 입력
    ↓
App_logic.js → 예측 생성
    ↓
PredictionExporter → 예측 수집
    ↓
실제 결과 입력
    ↓
PatternAnalyzer + SuccessAnalyzer → 패턴 분석
    ↓
localStorage 저장
    ↓
POST /retrain-automated → 서버 학습
    ↓
POST /sync-patterns-db → 패턴 동기화
    ↓
모델 업데이트 완료
    ↓
GET /predict-proba → 향상된 예측 제공
```

---

## 🔗 프로젝트 간 관계

두 프로젝트는 **독립적**이지만, 동일 저장소에 공존하는 이유:
1. **개발 시점**: 축구 예측 파일들이 나중에 추가된 것으로 보임
2. **공통 기술**: 둘 다 Python 백엔드 사용
3. **테스트 목적**: Computer Use로 축구 예측 웹앱을 자동화 테스트할 가능성

---

## 📊 파일 통계

| 파일 유형 | 개수 | 주요 역할 |
|----------|------|----------|
| Python (.py) | 11개 | Computer Use 코어 + 백엔드 서버 |
| JavaScript (.js) | 11개 | 축구 예측 로직 |
| HTML (.html) | 3개 | 축구 예측 UI |
| 총 코드 라인 | ~10,262줄 | JS + HTML 합계 |

---

## 🚀 실행 방법

### Computer Use Beta
```bash
# 1. 가상 머신 권장 (보안)
# 2. 의존성 설치
pip install -r requirements.txt

# 3. 실행
python main.py

# 4. API 키 입력 → Initialize → 프롬프트 입력
```

### 축구 예측 시스템
```bash
# 백엔드 서버 시작
python main_server_with_sync_endpoint.py  # http://127.0.0.1:8000

# 또는
python pattern_sync_server.py             # http://localhost:5000

# 프론트엔드
# HTML 파일을 브라우저에서 열기
```

---

## ⚠️ 보안 고려사항

### Computer Use
- **위험**: PyAutoGUI로 전체 시스템 제어 가능
- **권장**: VM 환경 필수
- **주의**: API 키는 환경변수 또는 설정 파일에 암호화 저장

### 축구 예측
- CORS 완전 개방 (`allow_origins=["*"]`)
- 프로덕션 환경에서는 도메인 제한 필요
- 모델 파일 접근 권한 관리

---

## 📈 개선 제안

### Computer Use
1. 좌표 정확도 향상 (다운스케일 보정 알고리즘)
2. 작업 완료 감지 개선 (더 많은 키워드 + 컨텍스트 분석)
3. 에러 복구 메커니즘 (재시도 로직)
4. 액션 대기 시간 동적 조정

### 축구 예측
1. 딥러닝 모델 도입 (LSTM for 시계열, XGBoost)
2. 실시간 데이터 파이프라인 구축
3. A/B 테스트 프레임워크
4. 백테스팅 시스템 구현

---

## 📝 분석 일자
2025-11-09

## 🔍 분석 범위
- 전체 저장소 파일 구조
- 주요 Python 모듈 (11개 파일)
- JavaScript 로직 파일 (11개 파일)
- HTML 인터페이스 (3개 파일)
- 총 ~10,262 라인 코드 분석
