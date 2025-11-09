/**
 * ============================================================
 * DataParserUtil.js - HTML 테이블 데이터 파싱 (v2.0)
 * ============================================================
 * 
 * [목적]
 * HTML 테이블의 경기 데이터 행(<tr>)을 파싱하여
 * 패턴 분석에 필요한 데이터 객체로 변환
 * 
 * [주요 기능]
 * ✅ HTML 테이블 행 파싱
 * ✅ 데이터 유효성 검증
 * ✅ 타입 변환 (문자 → 숫자 등)
 * ✅ 상세한 에러 로깅
 * 
 * [작성일] 2025-11-09
 * [버전] 2.0 (초보자 친화)
 */

const DataParserUtil = (function() {

    // ========================================
    // 1. 설정
    // ========================================
    
    const CONFIG = {
        DEBUG: true,  // 디버그 로깅 활성화
        
        // 유효한 예측 값
        validPredictions: ['홈승', '무', '원정승', 'H', 'D', 'A', 'Home', 'Draw', 'Away'],
        
        // 유효한 결과 스코어 형식 (예: "3-2")
        scorePattern: /^\d+-\d+$|^N\/A$/i,
        
        // 열 순서 (HTML 테이블 컬럼 순서)
        // ⚠️ 실제 테이블 구조에 맞게 조정 필요!
        columnMap: {
            hybridPrediction: 0,        // 통합 예측
            hplPrediction: 1,           // HPL 모델
            btPrediction: 2,            // BT 모델
            oslPrediction: 3,           // OSL 모델
            regressionPrediction: 4,    // 회귀 모델
            handicapPrediction: 5,      // 장애물 예측
            upsetScoreDiff: 6,          // 스코어 불일치도
            ouPrediction: 7,            // Over/Under
            bttsPrediction: 8,          // BTTS
            regHomeProb: 9,             // 회귀 홈 확률
            regAwayProb: 10,            // 회귀 원정 확률
            btHomeProb: 11,             // BT 홈 확률
            btAwayProb: 12,             // BT 원정 확률
            hplHomeProb: 13,            // HPL 홈 확률
            hplAwayProb: 14,            // HPL 원정 확률
            // actualResult는 마지막 컬럼
        }
    };

    // ========================================
    // 2. 유틸리티 함수
    // ========================================

    /**
     * 로깅 함수
     */
    function log(message, data = null) {
        if (CONFIG.DEBUG) {
            if (data) {
                console.log(`[DataParserUtil] ${message}`, data);
            } else {
                console.log(`[DataParserUtil] ${message}`);
            }
        }
    }

    /**
     * 에러 로깅
     */
    function error(message, err = null) {
        console.error(`[DataParserUtil] ❌ ${message}`, err || '');
    }

    /**
     * 경고 로깅
     */
    function warn(message, data = null) {
        console.warn(`[DataParserUtil] ⚠️ ${message}`, data || '');
    }

    /**
     * 안전한 문자열 추출 (공백 제거)
     */
    function getText(element) {
        if (!element) return '';
        const text = element.textContent || element.innerText || '';
        return text.trim();
    }

    /**
     * 안전한 숫자 변환
     */
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
            warn(`숫자 변환 실패`, e.message);
            return defaultValue;
        }
    }

    // ========================================
    // 3. 핵심 파싱 함수
    // ========================================

    /**
     * HTML 테이블 행(<tr>)을 데이터 객체로 파싱
     * 
     * @param {HTMLElement} row - <tr> 요소
     * @returns {Object|null} 파싱된 데이터 또는 null
     */
    function parseRowData(row) {
        try {
            // 1. 입력 검증
            if (!row) {
                warn('parseRowData: row가 null/undefined');
                return null;
            }

            if (row.tagName !== 'TR') {
                warn(`parseRowData: TR이 아님 (${row.tagName})`);
                return null;
            }

            // 2. 셀 추출
            const cells = row.querySelectorAll('td, th');
            
            if (cells.length < 15) {
                warn(`parseRowData: 셀 개수 부족 (필요: 15, 실제: ${cells.length})`);
                return null;
            }

            // 3. 데이터 추출
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

            // 4. 필수 필드 검증
            if (!parsed.hybridPrediction) {
                warn('parseRowData: hybridPrediction이 없음');
                return null;
            }

            log('✅ 행 파싱 성공:', parsed);
            return parsed;

        } catch (e) {
            error('parseRowData 오류', e);
            return null;
        }
    }

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
                warn('calculateMissAndSuccess: 입력값 부족', {prediction, actual});
                return { isMiss: false, isSuccess: false };
            }

            // 2. N/A 처리
            if (actual === 'N/A' || actual === '' || actual === '-') {
                warn('calculateMissAndSuccess: 결과가 없음 (N/A)');
                return { isMiss: false, isSuccess: false };
            }

            // 3. 예측값 정규화
            const pred = prediction.toLowerCase().replace(/\s+/g, '');
            const res = actual.toLowerCase().replace(/\s+/g, '');

            // 4. 일치 여부 판단
            // 단순 문자 비교 (실제 결과 형식에 맞게 조정 필요)
            const isMatch = pred === res;

            log(`예측 비교: ${prediction} vs ${actual} = ${isMatch ? 'HIT' : 'MISS'}`);

            return {
                isMiss: !isMatch,      // 예측 실패
                isSuccess: isMatch     // 예측 성공
            };

        } catch (e) {
            error('calculateMissAndSuccess 오류', e);
            return { isMiss: false, isSuccess: false };
        }
    }

    // ========================================
    // 4. 검증 함수
    // ========================================

    /**
     * 데이터 유효성 검증
     * 
     * @param {Object} data - 파싱된 데이터
     * @returns {Boolean} 유효하면 true
     */
    function validateRowData(data) {
        try {
            if (!data) {
                error('validateRowData: data가 null');
                return false;
            }

            // 1. 예측값 검증
            const validPreds = CONFIG.validPredictions;
            
            if (!validPreds.includes(data.hybridPrediction)) {
                warn(`validateRowData: 잘못된 예측값 (${data.hybridPrediction})`);
                return false;
            }

            // 2. 확률값 검증 (0-1 범위)
            const probs = [
                data.regHomeProb, data.regAwayProb,
                data.btHomeProb, data.btAwayProb,
                data.hplHomeProb, data.hplAwayProb
            ];

            for (let prob of probs) {
                if (typeof prob !== 'number') {
                    warn(`validateRowData: 확률값이 숫자가 아님 (${prob})`);
                    return false;
                }
                
                if (prob < 0 || prob > 1) {
                    warn(`validateRowData: 확률값 범위 초과 (${prob})`);
                    return false;
                }
            }

            // 3. Upset Score Diff 검증
            if (typeof data.upsetScoreDiff !== 'number' || data.upsetScoreDiff < 0) {
                warn(`validateRowData: 잘못된 upsetScoreDiff (${data.upsetScoreDiff})`);
                return false;
            }

            log('✅ 데이터 검증 통과');
            return true;

        } catch (e) {
            error('validateRowData 오류', e);
            return false;
        }
    }

    /**
     * 여러 행을 한 번에 파싱
     * 
     * @param {HTMLElement} tableBodyElement - #results-body 같은 요소
     * @returns {Array} 파싱된 데이터 배열
     */
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
                        // 유효성 검증
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
                    warn(`행 ${idx} 처리 실패`, e.message);
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
    // 5. 설정 관리
    // ========================================

    /**
     * 컬럼 맵 설정 (테이블 구조에 맞게)
     * 
     * @param {Object} newMap - 새로운 컬럼 맵
     */
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

    /**
     * 유효한 예측값 추가
     * 
     * @param {Array} predictions - 예측값 배열
     */
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

    /**
     * 디버그 모드 설정
     */
    function setDebug(enabled) {
        CONFIG.DEBUG = Boolean(enabled);
        log(`🔧 디버그 모드: ${enabled ? 'ON' : 'OFF'}`);
    }

    /**
     * 현재 설정 조회
     */
    function getConfig() {
        return { ...CONFIG };
    }

    // ========================================
    // 6. 공개 API
    // ========================================

    return {
        // 핵심 함수
        parseRowData: parseRowData,
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
// 7. 초기화 및 로깅
// ========================================

console.log('✅ DataParserUtil (v2.0) 로드 완료');
console.log('📍 사용법:');
console.log('  - DataParserUtil.parseRowData(row)');
console.log('  - DataParserUtil.calculateMissAndSuccess(pred, actual)');
console.log('  - DataParserUtil.validateRowData(data)');
console.log('  - DataParserUtil.parseAllRows(tableBody)');
console.log('  - DataParserUtil.setColumnMap({...})');

// 전역 변수로 내보내기
if (typeof window !== 'undefined') {
    window.DataParserUtil = DataParserUtil;
}

/**
 * ========================================
 * 사용 예시
 * ========================================
 * 
 * 1️⃣ 단일 행 파싱:
 *    const row = document.querySelector('#results-body tr');
 *    const data = DataParserUtil.parseRowData(row);
 *    console.log(data);
 * 
 * 2️⃣ 모든 행 파싱:
 *    const tbody = document.querySelector('#results-body');
 *    const allData = DataParserUtil.parseAllRows(tbody);
 *    console.log(`파싱됨: ${allData.length}개`);
 * 
 * 3️⃣ 예측 비교:
 *    const result = DataParserUtil.calculateMissAndSuccess('홈승', '무');
 *    console.log(result.isMiss);  // true (불일치)
 * 
 * 4️⃣ 테이블 구조 다르면 컬럼 맵 조정:
 *    DataParserUtil.setColumnMap({
 *        hybridPrediction: 0,
 *        hplPrediction: 1,
 *        // ... 실제 테이블 구조에 맞게
 *    });
 * 
 * 5️⃣ PatternAnalyzer와 함께 사용:
 *    const tbody = document.querySelector('#results-body');
 *    const allRows = DataParserUtil.parseAllRows(tbody);
 *    
 *    // 이제 patternDB.build() 실행 가능
 *    patternDB.build();
 * 
 * ========================================
 */