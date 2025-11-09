/**
 * =========================================
 * app_logic.js 통합 연결 모듈
 * =========================================
 * 
 * integrated_workflow.js와 app_logic.js를 연결하는 브리지
 * 
 * 사용:
 * 1. integrated_workflow.js 로드
 * 2. app_logic_integration.js 로드
 * 3. PredictionExporter 클래스 사용
 */

// ═══════════════════════════════════════════════════════════════
// app_logic.js 연동 클래스
// ═══════════════════════════════════════════════════════════════

class PredictionExporter {
    constructor() {
        this.predictions = [];
        this.results = [];
        this.patterns = null;
    }

    /**
     * app_logic.js의 예측 결과를 수집
     * 
     * @param {Object} prediction - 축구_경기_분석기에서 생성된 예측
     */
    collectPrediction(prediction) {
        // app_logic.js의 예측 포맷을 표준화
        const standardized = {
            id: prediction.match_id || prediction.id || `match_${Date.now()}`,
            league: prediction.league || prediction.division,
            homeTeam: prediction.home_team || prediction.homeTeam,
            awayTeam: prediction.away_team || prediction.awayTeam,
            prediction: prediction.prediction || prediction.result,  // "H", "D", "A"
            confidence: prediction.confidence || prediction.odds || 0,
            features: prediction.features || [],
            odds: prediction.odds,
            ppg: prediction.ppg,
            form: prediction.form,
            timestamp: new Date().toISOString()
        };

        this.predictions.push(standardized);
        console.log(`📊 예측 수집: ${standardized.homeTeam} vs ${standardized.awayTeam}`);
        return standardized;
    }

    /**
     * 실제 경기 결과 입력
     * 
     * @param {string} matchId - 경기 ID
     * @param {string} result - 실제 결과 ("H", "D", "A")
     * @param {string} score - 스코어 (예: "2-1")
     */
    addActualResult(matchId, result, score) {
        const resultData = {
            matchId: matchId,
            result: result,
            score: score,
            timestamp: new Date().toISOString()
        };

        this.results.push(resultData);
        console.log(`✅ 결과 입력: ${score} (${result})`);
        return resultData;
    }

    /**
     * 모든 수집된 데이터를 워크플로우로 보내기
     */
    async exportToWorkflow() {
        console.log('\n📤 워크플로우로 데이터 전송...');
        
        if (this.predictions.length === 0) {
            console.error('❌ 수집된 예측이 없습니다');
            return null;
        }

        // 결과 객체 변환
        const resultsObj = {};
        this.results.forEach(r => {
            resultsObj[r.matchId] = {
                result: r.result,
                score: r.score
            };
        });

        // 워크플로우 실행
        const result = await workflow.executeFullPipeline(
            this.predictions,
            resultsObj
        );

        this.patterns = result.patterns;
        return result;
    }

    /**
     * 패턴을 app_logic.js에 다시 로드
     */
    async reloadPatternsToAppLogic() {
        console.log('\n🔄 패턴을 app_logic.js에 로드...');

        if (!this.patterns || this.patterns.length === 0) {
            console.log('⚠️ 로드할 패턴이 없습니다');
            return null;
        }

        // 로컬 스토리지에 저장
        localStorage.setItem('updatedPatterns', JSON.stringify(this.patterns));
        
        // app_logic.js의 패턴 저장소 업데이트
        if (typeof window !== 'undefined' && window.trainingDataExport) {
            window.trainingDataExport = this.patterns;
            console.log(`✅ app_logic.js 패턴 업데이트: ${this.patterns.length}개`);
        }

        return this.patterns;
    }

    /**
     * 데이터 요약
     */
    getSummary() {
        return {
            collectPredictions: this.predictions.length,
            actualResults: this.results.length,
            patterns: this.patterns ? this.patterns.length : 0,
            ready: this.predictions.length > 0 && this.results.length > 0
        };
    }

    /**
     * 초기화
     */
    reset() {
        this.predictions = [];
        this.results = [];
        this.patterns = null;
        console.log('🔄 모든 데이터 초기화됨');
    }
}

// ═══════════════════════════════════════════════════════════════
// app_logic.js 상호작용 함수
// ═══════════════════════════════════════════════════════════════

let exporter = new PredictionExporter();

/**
 * 예측 수집 (app_logic.js에서 호출)
 */
function collectPredictionFromLogic(prediction) {
    return exporter.collectPrediction(prediction);
}

/**
 * 실제 결과 입력
 */
function addMatchResult(matchId, result, score) {
    return exporter.addActualResult(matchId, result, score);
}

/**
 * 전체 파이프라인 실행
 */
async function startFullTrainingPipeline() {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 축구분석기 ↔️ 패턴DB 훈련 파이프라인 시작');
    console.log('='.repeat(50) + '\n');

    try {
        // 1. 데이터 준비 확인
        const summary = exporter.getSummary();
        console.log('📋 준비 상태:');
        console.log(`   예측: ${summary.collectPredictions}개`);
        console.log(`   결과: ${summary.actualResults}개\n`);

        if (!summary.ready) {
            console.error('❌ 충분한 데이터가 없습니다');
            return null;
        }

        // 2. 워크플로우 실행
        console.log('⚙️ 파이프라인 실행 중...\n');
        const result = await exporter.exportToWorkflow();

        if (!result.success) {
            console.error('❌ 파이프라인 실패:', result.error);
            return null;
        }

        // 3. 패턴 다시 로드
        const patterns = await exporter.reloadPatternsToAppLogic();

        // 4. 완료 메시지
        console.log('\n' + '='.repeat(50));
        console.log('✅ 파이프라인 완료!');
        console.log('='.repeat(50));
        console.log(`📊 통계:`);
        console.log(`   정확도: ${result.statistics.accuracy}%`);
        console.log(`   활성 패턴: ${patterns.length}개`);
        console.log(`   평균 가중치: ${result.statistics.avgWeight}`);
        console.log('='.repeat(50) + '\n');

        return {
            success: true,
            patterns: patterns,
            statistics: result.statistics
        };

    } catch (error) {
        console.error('❌ 오류 발생:', error);
        return null;
    }
}

/**
 * 패턴 JSON 다운로드
 */
function downloadPatternsJSON(filename) {
    console.log('💾 패턴 JSON 다운로드...');
    return exporter.patterns ? 
        workflow.downloadPatternJSON(filename) : 
        console.error('❌ 다운로드할 패턴이 없습니다');
}

/**
 * 현재 상태 확인
 */
function checkPipelineStatus() {
    console.log('\n📊 파이프라인 상태:');
    console.table(exporter.getSummary());
    console.log('\n🔄 워크플로우 상태:');
    console.table(workflow.getStatistics());
}

/**
 * 모든 데이터 초기화
 */
function resetPipeline() {
    exporter.reset();
    workflow = new IntegratedWorkflow('http://localhost:5000');
    console.log('✅ 파이프라인 초기화 완료');
}

// ═══════════════════════════════════════════════════════════════
// app_logic.js 호출 예시
// ═══════════════════════════════════════════════════════════════

/*
// 1️⃣ 축구_경기_분석기에서 예측 생성 후:
const prediction = {
    match_id: 'match_001',
    league: 'Premier League',
    home_team: 'Arsenal',
    away_team: 'Man City',
    prediction: 'H',
    confidence: 85,
    features: [0.8, 0.75, 0.9, 0.7, 0.85],
    odds: 2.5,
    ppg: [1.8, 1.5]
};

collectPredictionFromLogic(prediction);

// 2️⃣ 경기 결과 입력
addMatchResult('match_001', 'H', '2-1');

// 3️⃣ 상태 확인
checkPipelineStatus();

// 4️⃣ 훈련 파이프라인 실행
const result = await startFullTrainingPipeline();

// 5️⃣ 패턴 다운로드
downloadPatternsJSON('football_patterns_trained.json');

// 6️⃣ 초기화 후 다시 시작
resetPipeline();
*/

// ═══════════════════════════════════════════════════════════════
// HTML UI 통합 (선택)
// ═══════════════════════════════════════════════════════════════

/**
 * 웹 UI에서 패턴 입력 폼 추가
 */
function addPatternInputUI() {
    const html = `
    <div id="pattern-training-panel" style="
        border: 2px solid #3b82f6;
        border-radius: 8px;
        padding: 20px;
        margin: 20px 0;
        background: #f0f9ff;
    ">
        <h3 style="color: #1976D2; margin-top: 0;">
            🔄 패턴 훈련 & 동기화 패널
        </h3>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
            <div>
                <label style="display: block; margin-bottom: 5px; font-weight: 600;">
                    예측 결과 JSON
                </label>
                <textarea id="prediction-json" 
                    placeholder='{"match_id": "1", "prediction": "H", ...}'
                    style="width: 100%; height: 100px; padding: 10px; border: 1px solid #ddd; border-radius: 4px;"></textarea>
            </div>
            <div>
                <label style="display: block; margin-bottom: 5px; font-weight: 600;">
                    실제 결과 JSON
                </label>
                <textarea id="result-json" 
                    placeholder='{"match_id": "1", "result": "H", "score": "2-1"}'
                    style="width: 100%; height: 100px; padding: 10px; border: 1px solid #ddd; border-radius: 4px;"></textarea>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px; margin-bottom: 15px;">
            <button onclick="handleAddPrediction()" style="
                padding: 10px;
                background: #2196F3;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 600;
            ">📊 예측 추가</button>
            
            <button onclick="handleAddResult()" style="
                padding: 10px;
                background: #4CAF50;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 600;
            ">✅ 결과 추가</button>
            
            <button onclick="handleRunPipeline()" style="
                padding: 10px;
                background: #FF9800;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 600;
            ">🚀 파이프라인 실행</button>
            
            <button onclick="handleDownloadPatterns()" style="
                padding: 10px;
                background: #673AB7;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 600;
            ">💾 다운로드</button>
        </div>

        <div id="pipeline-status" style="
            background: white;
            padding: 15px;
            border-radius: 4px;
            border-left: 4px solid #2196F3;
        ">
            <strong>상태:</strong> <span id="status-text">준비 중</span>
            <div id="status-details" style="margin-top: 10px; font-size: 12px; color: #666;"></div>
        </div>
    </div>
    `;

    const container = document.getElementById('main-content') || document.body;
    container.insertAdjacentHTML('beforeend', html);
}

/**
 * UI 핸들러 함수
 */
function handleAddPrediction() {
    try {
        const json = JSON.parse(document.getElementById('prediction-json').value);
        collectPredictionFromLogic(json);
        alert('✅ 예측이 추가되었습니다');
        updateStatusUI();
    } catch (e) {
        alert('❌ JSON 형식이 잘못되었습니다: ' + e.message);
    }
}

function handleAddResult() {
    try {
        const json = JSON.parse(document.getElementById('result-json').value);
        addMatchResult(json.match_id, json.result, json.score);
        alert('✅ 결과가 추가되었습니다');
        updateStatusUI();
    } catch (e) {
        alert('❌ JSON 형식이 잘못되었습니다: ' + e.message);
    }
}

async function handleRunPipeline() {
    const result = await startFullTrainingPipeline();
    if (result) {
        alert(`✅ 파이프라인 완료!\n정확도: ${result.statistics.accuracy}%`);
        updateStatusUI();
    } else {
        alert('❌ 파이프라인 실행 실패');
    }
}

function handleDownloadPatterns() {
    downloadPatternsJSON('football_patterns.json');
}

function updateStatusUI() {
    const status = exporter.getSummary();
    document.getElementById('status-text').textContent = 
        `예측: ${status.collectPredictions}개 | 결과: ${status.actualResults}개 | 패턴: ${status.patterns}개`;
    document.getElementById('status-details').innerHTML = `
        준비 상태: ${status.ready ? '✅ 파이프라인 실행 가능' : '⏳ 데이터 입력 중...'}
    `;
}

// ═══════════════════════════════════════════════════════════════
// Export
// ═══════════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PredictionExporter,
        collectPredictionFromLogic,
        addMatchResult,
        startFullTrainingPipeline,
        downloadPatternsJSON,
        checkPipelineStatus,
        resetPipeline,
        addPatternInputUI
    };
}