/**
 * ============================================================
 * DataParserUtil.js - HTML 테이블 데이터 파싱 (v2.1 FIXED)
 * ============================================================
 *
 * [목적]
 * HTML 테이블의 경기 데이터 행(<tr>)과 DOMStringMap(dataset)을 파싱하여
 * 패턴 분석에 필요한 데이터 객체로 변환
 *
 * [주요 기능]
 * ✅ HTML 테이블 행 파싱 (TR 요소)
 * ✅ DOMStringMap (dataset) 파싱 지원 ⭐ NEW
 * ✅ 데이터 유효성 검증
 * ✅ 타입 변환 (문자 → 숫자 등)
 * ✅ 상세한 에러 로깅
 *
 * [버전] 2.1 - DOMStringMap 지원 추가
 * [수정일] 2025-11-09
 *
 * [변경사항]
 * - parseRowData()가 DOMStringMap도 처리하도록 개선
 * - parseDataset() 함수 추가
 * - 에러 메시지 개선
 */

const DataParserUtil = (function() {

    // ========================================
    // 1. 설정
    // ========================================

    const CONFIG = {
        DEBUG: false,  // 디버그 로깅 비활성화 (에러 줄이기)

        // 유효한 예측 값
        validPredictions: ['홈승', '무', '원정승', 'H', 'D', 'A', 'Home', 'Draw', 'Away', '홈 승', '원정 승'],

        // 유효한 결과 스코어 형식 (예: "3-2")
        scorePattern: /^\d+-\d+$|^N\/A$/i,

        // 열 순서 (HTML 테이블 컬럼 순서)
        columnMap: {
            hybridPrediction: 0,
            hplPrediction: 1,
            btPrediction: 2,
            oslPrediction: 3,
            regressionPrediction: 4,
            handicapPrediction: 5,
            upsetScoreDiff: 6,
            ouPrediction: 7,
            bttsPrediction: 8,
            regHomeProb: 9,
            regAwayProb: 10,
            btHomeProb: 11,
            btAwayProb: 12,
            hplHomeProb: 13,
            hplAwayProb: 14,
        }
    };

    // ========================================
    // 2. 유틸리티 함수
    // ========================================

    function log(message, data = null) {
        if (CONFIG.DEBUG) {
            if (data) {
                console.log(`[DataParserUtil] ${message}`, data);
            } else {
                console.log(`[DataParserUtil] ${message}`);
            }
        }
    }

    function error(message, err = null) {
        console.error(`[DataParserUtil] ❌ ${message}`, err || '');
    }

    function warn(message, data = null) {
        if (CONFIG.DEBUG) {
            console.warn(`[DataParserUtil] ⚠️ ${message}`, data || '');
        }
    }

    function getText(element) {
        if (!element) return '';
        const text = element.textContent || element.innerText || '';
        return text.trim();
    }

    function getNumber(element, defaultValue = 0) {
        try {
            const text = getText(element);
            if (!text) return defaultValue;

            const num = parseFloat(text);
            if (isNaN(num)) {
                return defaultValue;
            }
            return num;
        } catch (e) {
            return defaultValue;
        }
    }

    /**
     * ⭐ NEW: 안전한 값 추출 (문자열 또는 숫자)
     */
    function safeValue(value, defaultValue = '') {
        if (value === null || value === undefined) {
            return defaultValue;
        }
        return value;
    }

    /**
     * ⭐ NEW: 안전한 숫자 변환 (값에서 직접)
     */
    function safeNumber(value, defaultValue = 0) {
        try {
            if (value === null || value === undefined || value === '') {
                return defaultValue;
            }
            const num = parseFloat(value);
            if (isNaN(num)) {
                return defaultValue;
            }
            return num;
        } catch (e) {
            return defaultValue;
        }
    }

    // ========================================
    // 3. DOMStringMap (dataset) 파싱 함수 ⭐ NEW
    // ========================================

    /**
     * ⭐ NEW: DOMStringMap (dataset)을 파싱
     *
     * @param {DOMStringMap} dataset - element.dataset 객체
     * @returns {Object|null} 파싱된 데이터 또는 null
     */
    function parseDataset(dataset) {
        try {
            // 1. 입력 검증
            if (!dataset) {
                return null;
            }

            // 2. analysis JSON 파싱
            let analysis = null;
            if (dataset.analysis) {
                try {
                    analysis = JSON.parse(dataset.analysis);
                } catch (parseErr) {
                    warn('dataset.analysis JSON 파싱 실패', parseErr.message);
                    return null;
                }
            } else {
                warn('dataset.analysis가 없음');
                return null;
            }

            // 3. finalResult 처리
            const finalResult = dataset.finalResult;

            // 'null' 문자열인 경우 실제 결과 없음
            if (finalResult === 'null' || finalResult === '' || !finalResult) {
                // 결과가 없으면 패턴 분석에서 제외
                return null;
            }

            // 4. analysis 객체에서 예측 데이터 추출
            const parsed = {
                // 예측값들 (analysis에서)
                hybridPrediction: safeValue(analysis.hybridPrediction),
                hplPrediction: safeValue(analysis.hplPrediction),
                btPrediction: safeValue(analysis.btPrediction),
                oslPrediction: safeValue(analysis.oslPrediction),
                regressionPrediction: safeValue(analysis.regressionPrediction),

                // 추가 예측
                handicapPrediction: safeValue(analysis.handicapPrediction),
                upsetScoreDiff: safeNumber(analysis.upsetScoreDiff),
                ouPrediction: safeValue(analysis.ouPrediction),
                bttsPrediction: safeValue(analysis.bttsPrediction),

                // 확률값들
                regHomeProb: safeNumber(analysis.regHomeProb),
                regAwayProb: safeNumber(analysis.regAwayProb),
                btHomeProb: safeNumber(analysis.btHomeProb),
                btAwayProb: safeNumber(analysis.btAwayProb),
                hplHomeProb: safeNumber(analysis.hplHomeProb),
                hplAwayProb: safeNumber(analysis.hplAwayProb),

                // 실제 결과
                actualResult: finalResult
            };

            // 5. 필수 필드 검증
            if (!parsed.hybridPrediction) {
                warn('dataset: hybridPrediction이 없음');
                return null;
            }

            log('✅ Dataset 파싱 성공:', parsed);
            return parsed;

        } catch (e) {
            error('parseDataset 오류', e);
            return null;
        }
    }

    // ========================================
    // 4. HTML TR 요소 파싱 함수
    // ========================================

    /**
     * HTML 테이블 행(<tr>)을 데이터 객체로 파싱
     *
     * @param {HTMLElement} row - <tr> 요소
     * @returns {Object|null} 파싱된 데이터 또는 null
     */
    function parseRowFromTR(row) {
        try {
            // 1. 셀 추출
            const cells = row.querySelectorAll('td, th');

            if (cells.length < 15) {
                warn(`TR: 셀 개수 부족 (필요: 15, 실제: ${cells.length})`);
                return null;
            }

            // 2. 데이터 추출
            const parsed = {
                // 예측값들
                hybridPrediction: getText(cells[CONFIG.columnMap.hybridPrediction]),
                hplPrediction: getText(cells[CONFIG.columnMap.hplPrediction]),
                btPrediction: getText(cells[CONFIG.columnMap.btPrediction]),
                oslPrediction: getText(cells[CONFIG.columnMap.oslPrediction]),
                regressionPrediction: getText(cells[CONFIG.columnMap.regressionPrediction]),

                // 추가 예측
                handicapPrediction: getText(cells[CONFIG.columnMap.handicapPrediction]),
                upsetScoreDiff: getNumber(cells[CONFIG.columnMap.upsetScoreDiff]),
                ouPrediction: getText(cells[CONFIG.columnMap.ouPrediction]),
                bttsPrediction: getText(cells[CONFIG.columnMap.bttsPrediction]),

                // 확률값들
                regHomeProb: getNumber(cells[CONFIG.columnMap.regHomeProb]),
                regAwayProb: getNumber(cells[CONFIG.columnMap.regAwayProb]),
                btHomeProb: getNumber(cells[CONFIG.columnMap.btHomeProb]),
                btAwayProb: getNumber(cells[CONFIG.columnMap.btAwayProb]),
                hplHomeProb: getNumber(cells[CONFIG.columnMap.hplHomeProb]),
                hplAwayProb: getNumber(cells[CONFIG.columnMap.hplAwayProb]),

                // 실제 결과 (마지막 컬럼)
                actualResult: getText(cells[cells.length - 1])
            };

            // 3. 필수 필드 검증
            if (!parsed.hybridPrediction) {
                warn('TR: hybridPrediction이 없음');
                return null;
            }

            log('✅ TR 파싱 성공:', parsed);
            return parsed;

        } catch (e) {
            error('parseRowFromTR 오류', e);
            return null;
        }
    }

    // ========================================
    // 5. 통합 파싱 함수 ⭐ NEW
    // ========================================

    /**
     * ⭐ IMPROVED: HTML TR 또는 DOMStringMap을 자동 감지하여 파싱
     *
     * @param {HTMLElement|DOMStringMap} row - <tr> 요소 또는 dataset 객체
     * @returns {Object|null} 파싱된 데이터 또는 null
     */
    function parseRowData(row) {
        try {
            // 1. 입력 검증
            if (!row) {
                return null;
            }

            // 2. 타입 감지 및 적절한 파서 선택

            // 2-1. DOMStringMap (dataset) 감지
            if (row.constructor && row.constructor.name === 'DOMStringMap') {
                log('📦 DOMStringMap 감지 - parseDataset 사용');
                return parseDataset(row);
            }

            // 2-2. 일반 객체이지만 dataset처럼 생긴 경우
            if (typeof row === 'object' && !row.tagName && row.analysis) {
                log('📦 Dataset-like 객체 감지');
                return parseDataset(row);
            }

            // 2-3. HTML 요소인 경우
            if (row.tagName) {
                if (row.tagName !== 'TR') {
                    // TR이 아니면 dataset 확인
                    if (row.dataset) {
                        log('📦 요소의 dataset 사용');
                        return parseDataset(row.dataset);
                    }
                    warn(`지원하지 않는 태그: ${row.tagName}`);
                    return null;
                }

                log('📄 TR 요소 감지 - parseRowFromTR 사용');
                return parseRowFromTR(row);
            }

            // 2-4. 알 수 없는 형식
            warn('알 수 없는 입력 형식', row);
            return null;

        } catch (e) {
            error('parseRowData 오류', e);
            return null;
        }
    }

    // ========================================
    // 6. 예측 비교 함수
    // ========================================

    /**
     * 예측과 실제 결과 비교
     *
     * @param {String} prediction - 예측값 ('홈승', '무', '원정승' 등)
     * @param {String} actual - 실제 결과 (스코어 또는 결과)
     * @returns {Object} {isMiss, isSuccess}
     */
    function calculateMissAndSuccess(prediction, actual) {
        try {
            // 1. 입력 검증
            if (!prediction || !actual) {
                return { isMiss: false, isSuccess: false };
            }

            // 2. N/A 또는 'null' 문자열 처리
            if (actual === 'N/A' || actual === '' || actual === '-' || actual === 'null') {
                return { isMiss: false, isSuccess: false };
            }

            // 3. 예측값 정규화
            const pred = prediction.toLowerCase().replace(/\s+/g, '');

            // 4. 실제 결과 정규화
            // 스코어 형식 (예: "2-1")인 경우 승/무/패로 변환
            let resultNormalized = actual.toLowerCase().replace(/\s+/g, '');

            if (/^\d+-\d+$/.test(actual)) {
                const [homeScore, awayScore] = actual.split('-').map(Number);
                if (homeScore > awayScore) {
                    resultNormalized = '홈승';
                } else if (homeScore < awayScore) {
                    resultNormalized = '원정승';
                } else {
                    resultNormalized = '무';
                }
                resultNormalized = resultNormalized.replace(/\s+/g, '');
            }

            // 5. 일치 여부 판단
            const isMatch = pred === resultNormalized ||
                           (pred === '홈승' && resultNormalized === 'h') ||
                           (pred === 'h' && resultNormalized === '홈승') ||
                           (pred === '무' && (resultNormalized === 'd' || resultNormalized === 'draw')) ||
                           (pred === 'd' && resultNormalized === '무') ||
                           (pred === '원정승' && resultNormalized === 'a') ||
                           (pred === 'a' && resultNormalized === '원정승');

            log(`예측 비교: ${prediction} vs ${actual} = ${isMatch ? 'HIT ✅' : 'MISS ❌'}`);

            return {
                isMiss: !isMatch,
                isSuccess: isMatch
            };

        } catch (e) {
            error('calculateMissAndSuccess 오류', e);
            return { isMiss: false, isSuccess: false };
        }
    }

    // ========================================
    // 7. 검증 함수
    // ========================================

    function validateRowData(data) {
        try {
            if (!data) {
                return false;
            }

            // 예측값 검증 (간소화)
            if (!data.hybridPrediction) {
                return false;
            }

            return true;

        } catch (e) {
            error('validateRowData 오류', e);
            return false;
        }
    }

    function parseAllRows(tableBodyElement) {
        try {
            if (!tableBodyElement) {
                error('parseAllRows: tableBodyElement가 null');
                return [];
            }

            const rows = tableBodyElement.querySelectorAll('tr');
            const results = [];
            let successCount = 0;
            let failureCount = 0;

            log(`📊 ${rows.length}개 행 파싱 시작...`);

            rows.forEach((row, idx) => {
                try {
                    const parsed = parseRowData(row);

                    if (parsed) {
                        if (validateRowData(parsed)) {
                            results.push({ rowIndex: idx, data: parsed });
                            successCount++;
                        } else {
                            failureCount++;
                        }
                    } else {
                        failureCount++;
                    }
                } catch (e) {
                    failureCount++;
                }
            });

            log(`✅ 파싱 완료: 성공 ${successCount}개, 실패 ${failureCount}개`);
            return results;

        } catch (e) {
            error('parseAllRows 오류', e);
            return [];
        }
    }

    // ========================================
    // 8. 설정 관리
    // ========================================

    function setColumnMap(newMap) {
        try {
            if (!newMap || typeof newMap !== 'object') {
                error('setColumnMap: 잘못된 입력');
                return false;
            }

            CONFIG.columnMap = { ...CONFIG.columnMap, ...newMap };
            log('✅ 컬럼 맵 설정됨', CONFIG.columnMap);
            return true;

        } catch (e) {
            error('setColumnMap 오류', e);
            return false;
        }
    }

    function addValidPredictions(predictions) {
        try {
            if (!Array.isArray(predictions)) {
                error('addValidPredictions: 배열이 아님');
                return false;
            }

            CONFIG.validPredictions = [...new Set([
                ...CONFIG.validPredictions,
                ...predictions
            ])];

            log('✅ 유효 예측값 추가됨', CONFIG.validPredictions);
            return true;

        } catch (e) {
            error('addValidPredictions 오류', e);
            return false;
        }
    }

    function setDebug(enabled) {
        CONFIG.DEBUG = Boolean(enabled);
        console.log(`🔧 DataParserUtil 디버그 모드: ${enabled ? 'ON' : 'OFF'}`);
    }

    function getConfig() {
        return { ...CONFIG };
    }

    // ========================================
    // 9. 공개 API
    // ========================================

    return {
        // 핵심 함수
        parseRowData: parseRowData,
        parseDataset: parseDataset,          // ⭐ NEW
        parseRowFromTR: parseRowFromTR,      // ⭐ NEW
        calculateMissAndSuccess: calculateMissAndSuccess,
        validateRowData: validateRowData,
        parseAllRows: parseAllRows,

        // 설정 함수
        setColumnMap: setColumnMap,
        addValidPredictions: addValidPredictions,
        setDebug: setDebug,
        getConfig: getConfig
    };
})();

// ========================================
// 10. 초기화 및 로깅
// ========================================

console.log('✅ DataParserUtil (v2.1 FIXED) 로드 완료');
console.log('🔧 개선사항: DOMStringMap (dataset) 지원 추가');

// 전역 변수로 내보내기
if (typeof window !== 'undefined') {
    window.DataParserUtil = DataParserUtil;
}

/**
 * ========================================
 * v2.1 변경 사항
 * ========================================
 *
 * ✅ parseRowData()가 TR 요소와 DOMStringMap 모두 처리
 * ✅ parseDataset() 함수 추가 - dataset 전용 파서
 * ✅ parseRowFromTR() 함수 추가 - TR 전용 파서
 * ✅ 자동 타입 감지 및 적절한 파서 선택
 * ✅ finalResult가 'null' 문자열인 경우 null 반환
 * ✅ 에러 로깅 개선 (디버그 모드 기본 OFF)
 *
 * ========================================
 * 사용 방법
 * ========================================
 *
 * 1. TR 요소 파싱 (기존 방식):
 *    const row = document.querySelector('#results-body tr');
 *    const data = DataParserUtil.parseRowData(row);
 *
 * 2. Dataset 파싱 (NEW):
 *    const dataset = row.dataset;
 *    const data = DataParserUtil.parseRowData(dataset);
 *
 * 3. 자동 감지 (권장):
 *    const data = DataParserUtil.parseRowData(anyInput);
 *    // TR, dataset 모두 자동 처리
 *
 * 4. 디버그 모드:
 *    DataParserUtil.setDebug(true);  // 상세 로그 활성화
 *
 * ========================================
 */
