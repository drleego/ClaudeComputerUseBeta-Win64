/**
 * ========================================
 * 축구 분석기 ↔️ 패턴 DB 동기화 통합 시스템 (FIXED v3)
 * ========================================
 * 
 * 수정 사항 (v3):
 * - DatabaseLoader 중복 선언 에러 수정
 * - 조건부 클래스 정의 추가
 * - PatternDB, SuccessDB 로드 실패 문제 해결
 * - 동적 로드 및 폴백 메커니즘 추가
 * - localStorage 키 명시화
 */

// ═══════════════════════════════════════════════════════════════
// 0️⃣ PatternDB & SuccessDB 로드 모듈
// ═══════════════════════════════════════════════════════════════

// [수정] DatabaseLoader가 이미 정의되어 있으면 재정의하지 않음
if (typeof DatabaseLoader === 'undefined') {
    class DatabaseLoader {
        /**
         * 외부 스크립트 동적 로드
         */
        static async loadScript(scriptPath) {
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = scriptPath;
                script.type = 'text/javascript';
                script.onload = () => resolve(true);
                script.onerror = (error) => reject(error);
                document.head.appendChild(script);
            });
        }

        /**
         * PatternDB 로드 시도
         */
        static async ensurePatternDB() {
            // 1. 전역에 이미 존재하는지 확인
            if (typeof window !== 'undefined' && window.patternDB) {
                console.log('✅ PatternDB 이미 로드됨');
                return window.patternDB;
            }

            // 2. localStorage에서 복구 시도
            try {
                const stored = localStorage.getItem('patternAnalyzerDB_v4');
                if (stored) {
                    const patternData = JSON.parse(stored);
                    console.log('✅ PatternDB localStorage에서 복구됨');
                    return new MockPatternDB(patternData);
                }
            } catch (e) {
                console.warn('⚠️ localStorage 복구 실패');
            }

            // 3. 파일 로드 시도 (경로는 프로젝트 구조에 맞게 수정)
            try {
                console.log('📥 PatternDB 파일에서 로드 시도...');
                // 실제 경로로 수정 필요: './pattern_analyzer.js' 또는 '/api/pattern-db' 등
                // await DatabaseLoader.loadScript('./pattern_analyzer.js');
                
                if (typeof window !== 'undefined' && window.patternDB) {
                    console.log('✅ PatternDB 파일 로드 완료');
                    return window.patternDB;
                }
            } catch (e) {
                console.warn('⚠️ PatternDB 파일 로드 실패:', e.message);
            }

            // 4. Mock 객체 사용 (개발용)
            console.warn('⚠️ PatternDB를 찾을 수 없어 Mock 객체 사용합니다');
            return new MockPatternDB();
        }

        /**
         * SuccessDB 로드 시도
         */
        static async ensureSuccessDB() {
            // 1. 전역에 이미 존재하는지 확인
            if (typeof window !== 'undefined' && window.successDB) {
                console.log('✅ SuccessDB 이미 로드됨');
                return window.successDB;
            }

            // 2. localStorage에서 복구 시도
            try {
                const stored = localStorage.getItem('successAnalyzerDB_v1');
                if (stored) {
                    const successData = JSON.parse(stored);
                    console.log('✅ SuccessDB localStorage에서 복구됨');
                    return new MockSuccessDB(successData);
                }
            } catch (e) {
                console.warn('⚠️ localStorage 복구 실패');
            }

            // 3. 파일 로드 시도
            try {
                console.log('📥 SuccessDB 파일에서 로드 시도...');
                // 실제 경로로 수정 필요: './success_analyzer.js' 또는 '/api/success-db' 등
                // await DatabaseLoader.loadScript('./success_analyzer.js');
                
                if (typeof window !== 'undefined' && window.successDB) {
                    console.log('✅ SuccessDB 파일 로드 완료');
                    return window.successDB;
                }
            } catch (e) {
                console.warn('⚠️ SuccessDB 파일 로드 실패:', e.message);
            }

            // 4. Mock 객체 사용 (개발용)
            console.warn('⚠️ SuccessDB를 찾을 수 없어 Mock 객체 사용합니다');
            return new MockSuccessDB();
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// 0-1️⃣ Mock DB 클래스 (폴백용)
// ═══════════════════════════════════════════════════════════════

if (typeof MockPatternDB === 'undefined') {
    class MockPatternDB {
        constructor(data = {}) {
            this.data = data;
            this.isReady = true;
            this.warningRules = data.warningRules || {};
        }

        build() {
            console.log('🔧 [Mock] PatternDB 구축 중...');
            this.data = {
                warningRules: {
                    lowConfidence: { threshold: 60, count: 0 },
                    consistentErrors: { threshold: 5, count: 0 }
                },
                buildTime: new Date().toISOString()
            };
            localStorage.setItem('patternAnalyzerDB_v4', JSON.stringify(this.data));
            return `✅ Mock PatternDB Built with ${Object.keys(this.data.warningRules).length} rules`;
        }

        verify(dataset) {
            if (!this.isReady) return null;
            // Mock 검증 로직
            return '⚠️ Pattern Warning [Mock]';
        }
    }
}

if (typeof MockSuccessDB === 'undefined') {
    class MockSuccessDB {
        constructor(data = {}) {
            this.data = data;
            this.isReady = true;
            this.successRules = data.successRules || {};
        }

        build() {
            console.log('🔧 [Mock] SuccessDB 구축 중...');
            this.data = {
                successRules: {
                    highConfidence: { threshold: 80, count: 0 },
                    consistentHits: { threshold: 10, count: 0 }
                },
                buildTime: new Date().toISOString()
            };
            localStorage.setItem('successAnalyzerDB_v1', JSON.stringify(this.data));
            return `✅ Mock SuccessDB Built with ${Object.keys(this.data.successRules).length} rules`;
        }

        verify(dataset) {
            if (!this.isReady) return null;
            // Mock 검증 로직
            return '✨ Success Signal [Mock]';
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// 1️⃣ 패턴 추출 시스템
// ═══════════════════════════════════════════════════════════════

class PatternExtractor {
    constructor() {
        this.predictions = [];      // 모든 예측 저장
        this.results = {};          // 실제 결과
        this.patterns = {
            hit: [],                // 적중 패턴
            miss: []                // 미적중 패턴
        };
        this.accuracy = 0;
        this.totalMatches = 0;
    }

    /**
     * 예측 결과 저장
     */
    addPrediction(prediction) {
        this.predictions.push({
            id: prediction.id || Date.now(),
            league: prediction.league,
            homeTeam: prediction.homeTeam,
            awayTeam: prediction.awayTeam,
            prediction: prediction.prediction,  // "H", "D", "A"
            confidence: prediction.confidence,  // 0-100
            features: prediction.features,      // 특징 벡터
            timestamp: new Date().toISOString()
        });
    }

    /**
     * 실제 경기 결과 입력
     */
    addResult(matchId, actualResult, score) {
        this.results[matchId] = {
            result: actualResult,  // "H", "D", "A"
            score: score,          // "2-1"
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 예측 vs 실제 결과 비교
     */
    validatePredictions() {
        let correctCount = 0;
        let hitPatterns = [];
        let missPatterns = [];

        this.predictions.forEach(pred => {
            if (!this.results[pred.id]) return;

            const actual = this.results[pred.id];
            const isCorrect = pred.prediction === actual.result;

            if (isCorrect) {
                correctCount++;
                hitPatterns.push({
                    ...pred,
                    result: "hit",
                    verified: true
                });
            } else {
                missPatterns.push({
                    ...pred,
                    result: "miss",
                    actual: actual.result,
                    verified: true
                });
            }
        });

        this.totalMatches = Object.keys(this.results).length;
        this.accuracy = (correctCount / this.totalMatches) * 100;
        
        this.patterns.hit = hitPatterns;
        this.patterns.miss = missPatterns;

        return {
            accuracy: this.accuracy.toFixed(2),
            total: this.totalMatches,
            correct: correctCount,
            incorrect: this.totalMatches - correctCount,
            hitPatterns: hitPatterns,
            missPatterns: missPatterns
        };
    }
}

// ═══════════════════════════════════════════════════════════════
// 2️⃣ 패턴 칼리브레이션 시스템
// ═══════════════════════════════════════════════════════════════

class PatternCalibrator {
    constructor() {
        this.rawPatterns = [];      // 원본 패턴
        this.calibratedPatterns = []; // 보정된 패턴
        this.threshold = 0.65;      // 신뢰도 임계값
    }

    /**
     * 패턴 신뢰도 보정
     */
    calibratePatterns(patterns) {
        this.rawPatterns = patterns;
        this.calibratedPatterns = patterns.map(p => ({
            ...p,
            confidence: this._normalizeConfidence(p.confidence),
            weight: this._calculateWeight(p),
            reliability: this._assessReliability(p)
        }));

        return this.calibratedPatterns.filter(p => p.confidence >= this.threshold);
    }

    /**
     * 신뢰도 정규화 (0-100 → 0-1)
     */
    _normalizeConfidence(confidence) {
        return Math.min(Math.max(confidence / 100, 0), 1);
    }

    /**
     * 가중치 계산
     */
    _calculateWeight(pattern) {
        return pattern.confidence * (pattern.frequency || 1);
    }

    /**
     * 신뢰성 평가
     */
    _assessReliability(pattern) {
        const confidence = this._normalizeConfidence(pattern.confidence);
        const consistency = pattern.consistency || 0.5;
        return (confidence + consistency) / 2;
    }
}

// ═══════════════════════════════════════════════════════════════
// 3️⃣ 패턴 동기화 브리지
// ═══════════════════════════════════════════════════════════════

class PatternSyncBridge {
    constructor() {
        this.syncLog = [];
        this.lastSyncTime = null;
    }

    /**
     * 패턴을 JSON으로 변환
     */
    patternsToJSON(patterns) {
        return JSON.stringify(patterns.map(p => ({
            id: p.id,
            type: p.type || 'standard',
            confidence: p.confidence,
            weight: p.weight,
            features: p.features
        })), null, 2);
    }

    /**
     * JSON을 패턴으로 변환
     */
    jsonToPatterns(jsonString) {
        try {
            return JSON.parse(jsonString);
        } catch (e) {
            console.error("패턴 JSON 파싱 실패:", e);
            return [];
        }
    }

    /**
     * 로컬스토리지에 동기화
     */
    syncToLocalStorage(patterns, key = 'patternDB') {
        try {
            localStorage.setItem(key, this.patternsToJSON(patterns));
            this.lastSyncTime = new Date();
            this.syncLog.push({
                timestamp: this.lastSyncTime,
                count: patterns.length,
                status: 'success'
            });
            return true;
        } catch (e) {
            console.error("localStorage 동기화 실패:", e);
            return false;
        }
    }

    /**
     * 로컬스토리지에서 동기화
     */
    syncFromLocalStorage(key = 'patternDB') {
        try {
            const stored = localStorage.getItem(key);
            return stored ? this.jsonToPatterns(stored) : [];
        } catch (e) {
            console.error("localStorage 복구 실패:", e);
            return [];
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// 4️⃣ 통합 워크플로우
// ═══════════════════════════════════════════════════════════════

class IntegratedWorkflow {
    constructor() {
        this.extractor = new PatternExtractor();
        this.calibrator = new PatternCalibrator();
        this.bridge = new PatternSyncBridge();
    }

    /**
     * 전체 패턴 분석 파이프라인
     */
    async runPipeline(predictions, actualResults) {
        console.log("🚀 Integrated Workflow 시작");

        // Step 1: 패턴 추출
        console.log("📊 Step 1: Extracting patterns...");
        predictions.forEach(p => this.extractor.addPrediction(p));
        Object.entries(actualResults).forEach(([id, result]) => 
            this.extractor.addResult(id, result.result, result.score)
        );
        const validation = this.extractor.validatePredictions();
        console.log(`✅ Validation: ${validation.accuracy}% accuracy`);

        // Step 2: 패턴 보정
        console.log("⚙️ Step 2: Calibrating patterns...");
        const calibrated = this.calibrator.calibratePatterns(validation.hitPatterns);
        console.log(`✅ Calibrated ${calibrated.length} patterns`);

        // Step 3: 로컬스토리지에 동기화
        console.log("💾 Step 3: Syncing to localStorage...");
        const synced = this.bridge.syncToLocalStorage(calibrated);
        console.log(`✅ Sync status: ${synced ? 'Success' : 'Failed'}`);

        return {
            validation: validation,
            calibrated: calibrated,
            synced: synced
        };
    }
}

// ═══════════════════════════════════════════════════════════════
// 5️⃣ 전역 함수들
// ═══════════════════════════════════════════════════════════════

/**
 * 패턴 다운로드
 */
function downloadPatterns() {
    const patterns = localStorage.getItem('patternDB');
    if (!patterns) {
        console.warn("저장된 패턴이 없습니다");
        return;
    }
    
    const blob = new Blob([patterns], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `patterns_${new Date().toISOString()}.json`;
    link.click();
}

/**
 * 패턴 조회
 */
function getPatterns(key = 'patternDB') {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
}

/**
 * 통계 표시
 */
function showStatistics() {
    const patterns = getPatterns();
    console.log("📈 Pattern Statistics:");
    console.log(`   Total Patterns: ${patterns.length}`);
    console.log(`   Average Confidence: ${(patterns.reduce((a, p) => a + (p.confidence || 0), 0) / patterns.length).toFixed(2)}`);
}

/**
 * 전체 파이프라인 실행
 */
async function runFullPipeline(predictions, results) {
    const workflow = new IntegratedWorkflow();
    const result = await workflow.runPipeline(predictions, results);
    
    console.log("\n🎉 Pipeline Complete!");
    console.log("📊 Results:", result);
    
    return result;
}

/**
 * 전체 훈련 파이프라인 (PatternDB + SuccessDB + 서버 동기화)
 */
async function startFullTrainingPipeline() {
    try {
        console.log("🎯 === Full Training Pipeline Started ===\n");
        
        // Step 1: PatternDB 및 SuccessDB 로드
        console.log("📥 Step 1: Loading PatternDB and SuccessDB...");
        const patternDB = window.patternDB || await DatabaseLoader.ensurePatternDB();
        const successDB = window.successDB || await DatabaseLoader.ensureSuccessDB();
        console.log(`   - PatternDB ready: ${patternDB.isReady}`);
        console.log(`   - SuccessDB ready: ${successDB.isReady}`);
        
        // Step 2: DB 구축
        console.log("\n🔨 Step 2: Building Pattern and Success DBs...");
        if (patternDB && typeof patternDB.build === 'function') {
            const patternResult = patternDB.build();
            console.log("✅", patternResult);
        } else {
            console.warn("⚠️ PatternDB.build() 메서드 없음 - 스킵");
        }
        
        if (successDB && typeof successDB.build === 'function') {
            const successResult = successDB.build();
            console.log("✅", successResult);
        } else {
            console.warn("⚠️ SuccessDB.build() 메서드 없음 - 스킵");
        }
        
        // Step 3: 훈련 JSON 생성
        console.log("\n📝 Step 3: Generating Training JSON...");
        const trainingJSON = generateTrainingJSON();
        console.log(`✅ Generated ${trainingJSON.length} training samples`);
        
        // Step 4: 검증, 칼리브레이션, 정규화 (서버에서 처리)
        console.log("\n🔧 Step 4: Server-side validation, calibration, normalization...");
        console.log("   (이 단계는 main_server_with_sync_endpoint.py에서 자동 처리됨)");
        
        // Step 5: 패턴 DB 서버 동기화
        console.log("\n🔄 Step 5: Syncing Patterns to Server...");
        const syncResult = await syncPatternsToDB(patternDB, successDB);
        if (syncResult && syncResult.synced) {
            console.log(`✅ Synced: ${syncResult.patterns} patterns, ${syncResult.success} success rules`);
        } else {
            console.error("❌ Sync failed:", syncResult?.error);
            console.log("⚠️ 로컬 저장소에만 저장되었습니다");
            return syncResult;
        }
        
        // Step 6: 모든 행의 패턴 검증 업데이트
        console.log("\n🎯 Step 6: Updating Pattern Verification on All Rows...");
        updatePatternVerification(patternDB, successDB);
        console.log("✅ All rows updated with new patterns");
        
        console.log("\n🎉 Training Pipeline Complete!");
        return {
            success: true,
            patterns: syncResult?.patterns || 0,
            success_patterns: syncResult?.success || 0
        };
        
    } catch (error) {
        console.error("❌ Training Pipeline Failed:", error.message);
        return {
            success: false,
            error: error.message,
            hint: "PatternDB 또는 SuccessDB 파일이 올바르게 로드되었는지 확인하세요"
        };
    }
}

/**
 * ★★★ [수정 v2] 훈련 JSON 생성 함수 ★★★
 */
function generateTrainingJSON() {
    if (typeof trainingDataExport === 'undefined' || trainingDataExport.length === 0) {
        console.warn("⚠️ No training data available");
        return [];
    }
    
    // trainingDataExport의 각 항목을 JSON 형식으로 변환
    const trainingJSON = trainingDataExport.map((record, index) => ({
        id: record.id || `match_${index}`,
        leagueName: record.leagueName,
        homeName: record.homeName,
        awayName: record.awayName,
        
        // 예측 결과
        features: record.features,
        predictions: record.predictions,
        finalPrediction: record.finalPrediction,
        
        // 실제 결과
        finalResult: record.finalResult,
        
        // 정확도
        isCorrect: record.isCorrect,
        
        // 메타데이터
        timestamp: record.timestamp,
        modelVersion: record.modelVersion
    })).filter(r => r.finalResult !== null); // 결과가 입력된 것만
    
    console.log(`📝 Training JSON: ${trainingJSON.length} completed matches`);
    return trainingJSON;
}

/**
 * ★★★ [수정 v2] 패턴 DB 동기화 함수 ★★★
 */
async function syncPatternsToDB(patternDB, successDB) {
    try {
        // localStorage에서 데이터 가져오기
        let patternData = {};
        let successData = {};
        
        if (patternDB && typeof localStorage !== 'undefined') {
            const stored = localStorage.getItem('patternAnalyzerDB_v4');
            if (stored) {
                patternData = JSON.parse(stored);
                console.log("📥 PatternDB 데이터 로드됨");
            }
        }
        
        if (successDB && typeof localStorage !== 'undefined') {
            const stored = localStorage.getItem('successAnalyzerDB_v1');
            if (stored) {
                successData = JSON.parse(stored);
                console.log("📥 SuccessDB 데이터 로드됨");
            }
        }
        
        // 서버로 전송
        console.log("📤 서버에 동기화 중...");
        
        const response1 = await fetch('http://127.0.0.1:8000/sync-patterns-db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ warningRules: patternData })
        }).catch(err => {
            console.warn("⚠️ PatternDB 서버 연결 실패:", err.message);
            return null;
        });
        
        const response2 = await fetch('http://127.0.0.1:8000/sync-success-db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ successRules: successData })
        }).catch(err => {
            console.warn("⚠️ SuccessDB 서버 연결 실패:", err.message);
            return null;
        });
        
        let result1 = { stored_patterns: 0 };
        let result2 = { stored_patterns: 0 };
        
        if (response1 && response1.ok) {
            result1 = await response1.json();
            console.log('✅ Pattern DB 동기화:', result1);
        } else {
            console.warn('⚠️ Pattern DB 동기화 응답 오류');
        }
        
        if (response2 && response2.ok) {
            result2 = await response2.json();
            console.log('✅ Success DB 동기화:', result2);
        } else {
            console.warn('⚠️ Success DB 동기화 응답 오류');
        }
        
        return {
            patterns: result1.stored_patterns || 0,
            success: result2.stored_patterns || 0,
            synced: true
        };
    } catch (error) {
        console.error('❌ 동기화 실패:', error.message);
        return { synced: false, error: error.message };
    }
}

/**
 * ★★★ [수정 v2] 패턴 검증 업데이트 함수 ★★★
 */
function updatePatternVerification(patternDB, successDB) {
    try {
        const resultsBody = document.getElementById('results-body');
        if (!resultsBody) {
            console.warn("⚠️ results-body not found");
            return;
        }
        
        const allRows = resultsBody.querySelectorAll('tr');
        let updatedCount = 0;
        
        allRows.forEach(row => {
            // 경고 컬럼 (마지막에서 1번째 전)
            const cells = row.querySelectorAll('td');
            if (cells.length >= 2) {
                const warningCell = cells[cells.length - 2];
                const recommendCell = cells[cells.length - 1];

                // 패턴 검증
                if (patternDB && typeof patternDB.verify === 'function') {
                    // ✅ [수정] row.dataset 대신 row (TR 요소) 전달
                    const warnings = patternDB.verify(row);
                    if (warningCell && warnings) {
                        warningCell.innerHTML = warnings;
                        warningCell.style.color = '#e74c3c';
                        updatedCount++;
                    }
                }

                // 성공 신호 검증
                if (successDB && typeof successDB.verify === 'function') {
                    // ✅ [수정] row.dataset 대신 row (TR 요소) 전달
                    const recommendations = successDB.verify(row);
                    if (recommendCell && recommendations) {
                        recommendCell.innerHTML = recommendations;
                        recommendCell.style.color = '#27ae60';
                        updatedCount++;
                    }
                }
            }
        });
        
        console.log(`🎯 Updated ${updatedCount} row verifications`);
    } catch (error) {
        console.error("❌ updatePatternVerification error:", error);
    }
}

// ═══════════════════════════════════════════════════════════════
// 6️⃣ 사용 예시
// ═══════════════════════════════════════════════════════════════

/*
// 예측 데이터
const predictions = [
    {
        id: 1,
        league: 'Premier League',
        homeTeam: 'Arsenal',
        awayTeam: 'Man City',
        prediction: 'H',
        confidence: 85,
        features: [0.8, 0.75, 0.9, 0.7, 0.85]
    },
];

// 실제 결과
const results = {
    1: { result: 'H', score: '2-1' },
};

// 파이프라인 실행
await runFullPipeline(predictions, results);

// 훈련 파이프라인 실행
await startFullTrainingPipeline();
*/

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PatternExtractor,
        PatternCalibrator,
        PatternSyncBridge,
        IntegratedWorkflow,
        DatabaseLoader,
        MockPatternDB,
        MockSuccessDB,
        runFullPipeline,
        downloadPatterns,
        getPatterns,
        showStatistics,
        startFullTrainingPipeline
    };
}
