/**
 * ================================================
 * LocalStorageSyncBridge.js
 * 두 개의 HTML 페이지 간 localStorage 자동 동기화
 * ================================================
 * 
 * [기능]
 * ✅ api-1.html과 FootballAi Web Predictor 간 데이터 동기화
 * ✅ 패턴 데이터 자동 전송
 * ✅ 학습 데이터 JSON 다운로드/업로드
 * ✅ 실시간 동기화 (storage 이벤트)
 * ✅ 서버 API 연동
 * 
 * [사용법]
 * <script src="LocalStorageSyncBridge.js"></script>
 * 
 * // 수동 동기화
 * await localStorageSyncBridge.syncToServer();
 * 
 * // 다른 탭에서 자동 동기화
 * localStorageSyncBridge.enableAutoSync();
 * 
 * // JSON 다운로드
 * localStorageSyncBridge.downloadAsJSON();
 * 
 * // JSON 업로드
 * localStorageSyncBridge.uploadFromJSON(file);
 */

const localStorageSyncBridge = (function() {

    // ========================================
    // 1. 설정
    // ========================================
    
    const CONFIG = {
        // 서버 설정
        SERVER_URL: 'http://localhost:8000',
        
        // 동기화할 localStorage 키들
        SYNC_KEYS: [
            'patternAnalyzerDB_v4',      // 미적중 패턴
            'successAnalyzerDB_v1',      // 적중 패턴
            'patterns',                  // 패턴 데이터
            'trainingData',              // 학습 데이터
            'lastSyncTime',              // 마지막 동기화 시간
            'modelVersion'               // 모델 버전
        ],
        
        // 자동 동기화 간격 (5분)
        AUTO_SYNC_INTERVAL: 5 * 60 * 1000,
        
        // 로그 활성화
        DEBUG: true
    };

    let autoSyncIntervalId = null;
    let syncInProgress = false;

    // ========================================
    // 2. 유틸리티 함수
    // ========================================

    function log(message, data = null) {
        if (CONFIG.DEBUG) {
            console.log(`[LocalStorageSyncBridge] ${message}`, data || '');
        }
    }

    function error(message, err = null) {
        console.error(`[LocalStorageSyncBridge] ❌ ${message}`, err || '');
    }

    /**
     * 현재 localStorage의 모든 동기화 대상 데이터 추출
     */
    function getAllSyncData() {
        const data = {};
        
        CONFIG.SYNC_KEYS.forEach(key => {
            try {
                const value = localStorage.getItem(key);
                if (value) {
                    // JSON 파싱 시도
                    try {
                        data[key] = JSON.parse(value);
                    } catch (e) {
                        // JSON이 아니면 문자열로 저장
                        data[key] = value;
                    }
                }
            } catch (e) {
                error(`getData: ${key} 읽기 실패`, e);
            }
        });
        
        return data;
    }

    /**
     * localStorage에 데이터 저장
     */
    function setSyncData(data) {
        let savedCount = 0;
        let failedCount = 0;

        Object.keys(data).forEach(key => {
            try {
                const value = typeof data[key] === 'string' 
                    ? data[key] 
                    : JSON.stringify(data[key]);
                
                localStorage.setItem(key, value);
                savedCount++;
                log(`✅ 저장됨: ${key}`);
            } catch (e) {
                failedCount++;
                error(`setSyncData: ${key} 저장 실패`, e);
            }
        });

        return { savedCount, failedCount };
    }

    // ========================================
    // 3. 서버 동기화
    // ========================================

    /**
     * 서버에 데이터 전송 (업로드)
     */
    async function uploadToServer(data) {
        try {
            log('🔄 서버 업로드 시작...');

            const response = await fetch(
                `${CONFIG.SERVER_URL}/sync-patterns-db`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        timestamp: new Date().toISOString(),
                        warningRules: data.patternAnalyzerDB_v4 || {},
                        successRules: data.successAnalyzerDB_v1 || {},
                        metadata: {
                            source: 'LocalStorageSyncBridge',
                            version: '1.0'
                        }
                    })
                }
            );

            if (!response.ok) {
                throw new Error(`서버 응답 오류: ${response.status}`);
            }

            const result = await response.json();
            log('✅ 서버 업로드 완료:', result);

            // 동기화 시간 기록
            const syncTime = new Date().toISOString();
            localStorage.setItem('lastSyncTime', syncTime);

            return { success: true, data: result, time: syncTime };
        } catch (err) {
            error('uploadToServer 실패', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * 서버에서 데이터 다운로드
     */
    async function downloadFromServer() {
        try {
            log('⬇️ 서버 다운로드 시작...');

            const response = await fetch(
                `${CONFIG.SERVER_URL}/scheduler/status`,
                { method: 'GET' }
            );

            if (!response.ok) {
                throw new Error(`서버 응답 오류: ${response.status}`);
            }

            const result = await response.json();
            log('✅ 서버 다운로드 완료:', result);

            return { success: true, data: result };
        } catch (err) {
            error('downloadFromServer 실패', err);
            return { success: false, error: err.message };
        }
    }

    // ========================================
    // 4. JSON 파일 처리
    // ========================================

    /**
     * 현재 데이터를 JSON 파일로 다운로드
     */
    function downloadAsJSON() {
        try {
            const data = getAllSyncData();
            
            const jsonString = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = `pattern-data-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            log('📥 JSON 파일 다운로드 완료');
            return { success: true, filename: link.download };
        } catch (err) {
            error('downloadAsJSON 실패', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * JSON 파일에서 데이터 업로드
     */
    function uploadFromJSON(file) {
        return new Promise((resolve, reject) => {
            try {
                const reader = new FileReader();
                
                reader.onload = function(event) {
                    try {
                        const data = JSON.parse(event.target.result);
                        log('📤 JSON 파일 파싱 완료');
                        
                        // 데이터 저장
                        const result = setSyncData(data);
                        log(`✅ 업로드 완료: ${result.savedCount}개 저장됨`, result);
                        
                        // 페이지 새로고침 필요
                        if (confirm('데이터가 로드되었습니다. 페이지를 새로고침하시겠습니까?')) {
                            location.reload();
                        }
                        
                        resolve({ success: true, ...result });
                    } catch (parseErr) {
                        error('JSON 파싱 실패', parseErr);
                        reject({ success: false, error: parseErr.message });
                    }
                };
                
                reader.readAsText(file);
            } catch (err) {
                error('uploadFromJSON 실패', err);
                reject({ success: false, error: err.message });
            }
        });
    }

    // ========================================
    // 5. 실시간 동기화 (다중 탭)
    // ========================================

    /**
     * localStorage 변경 감지 (다른 탭)
     */
    function enableAutoSync() {
        window.addEventListener('storage', function(event) {
            if (!event.key || !CONFIG.SYNC_KEYS.includes(event.key)) {
                return;
            }

            log(`🔔 다른 탭에서 변경 감지: ${event.key}`);
            
            // 새로운 값으로 업데이트
            if (event.newValue) {
                try {
                    const newData = JSON.parse(event.newValue);
                    log(`✅ 데이터 자동 업데이트: ${event.key}`, newData);
                } catch (e) {
                    log(`ℹ️ 문자열 데이터: ${event.key}`);
                }
            }
        });

        log('✅ 자동 동기화 활성화');
    }

    /**
     * 정기적인 자동 동기화 (5분마다)
     */
    function startAutoSyncTimer() {
        if (autoSyncIntervalId) {
            return; // 이미 실행 중
        }

        autoSyncIntervalId = setInterval(async () => {
            if (syncInProgress) return;
            
            syncInProgress = true;
            log('⏰ 정기 동기화 시작...');
            
            const data = getAllSyncData();
            const result = await uploadToServer(data);
            
            if (result.success) {
                log(`✅ 정기 동기화 완료: ${result.time}`);
            }
            
            syncInProgress = false;
        }, CONFIG.AUTO_SYNC_INTERVAL);

        log(`⏰ 정기 동기화 설정: ${CONFIG.AUTO_SYNC_INTERVAL / 1000}초마다`);
    }

    function stopAutoSyncTimer() {
        if (autoSyncIntervalId) {
            clearInterval(autoSyncIntervalId);
            autoSyncIntervalId = null;
            log('⏹️ 정기 동기화 중지');
        }
    }

    // ========================================
    // 6. 공개 API
    // ========================================

    return {
        /**
         * 즉시 동기화
         */
        syncToServer: async function() {
            if (syncInProgress) {
                log('⚠️ 동기화가 이미 진행 중입니다');
                return { success: false, error: '동기화 진행 중' };
            }

            syncInProgress = true;
            const data = getAllSyncData();
            const result = await uploadToServer(data);
            syncInProgress = false;

            return result;
        },

        /**
         * 서버에서 다운로드
         */
        syncFromServer: async function() {
            return await downloadFromServer();
        },

        /**
         * JSON 다운로드
         */
        downloadAsJSON: downloadAsJSON,

        /**
         * JSON 업로드
         */
        uploadFromJSON: uploadFromJSON,

        /**
         * 자동 동기화 시작
         */
        enableAutoSync: enableAutoSync,

        /**
         * 정기 동기화 시작 (5분마다)
         */
        startAutoSync: startAutoSyncTimer,

        /**
         * 정기 동기화 중지
         */
        stopAutoSync: stopAutoSyncTimer,

        /**
         * 현재 데이터 조회
         */
        getData: getAllSyncData,

        /**
         * 데이터 저장
         */
        setData: setSyncData,

        /**
         * 모든 동기화 데이터 삭제
         */
        clearAll: function() {
            try {
                CONFIG.SYNC_KEYS.forEach(key => {
                    localStorage.removeItem(key);
                    log(`🗑️ 삭제: ${key}`);
                });
                log('✅ 모든 동기화 데이터 삭제 완료');
                return { success: true };
            } catch (err) {
                error('clearAll 실패', err);
                return { success: false, error: err.message };
            }
        },

        /**
         * 상태 조회
         */
        getStatus: function() {
            const data = getAllSyncData();
            return {
                connected: Boolean(autoSyncIntervalId),
                syncInProgress: syncInProgress,
                dataCount: Object.keys(data).length,
                keys: Object.keys(data),
                config: CONFIG
            };
        }
    };
})();

// ========================================
// 7. 초기화 및 로깅
// ========================================

console.log('✅ LocalStorageSyncBridge v1.0 로드 완료');
console.log('📍 사용법:');
console.log('  - localStorageSyncBridge.syncToServer()');
console.log('  - localStorageSyncBridge.downloadAsJSON()');
console.log('  - localStorageSyncBridge.uploadFromJSON(file)');
console.log('  - localStorageSyncBridge.startAutoSync()');
console.log('  - localStorageSyncBridge.getStatus()');

// 전역 변수로 내보내기
if (typeof window !== 'undefined') {
    window.localStorageSyncBridge = localStorageSyncBridge;
}