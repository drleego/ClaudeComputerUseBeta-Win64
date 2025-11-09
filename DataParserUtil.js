/**
 * App_logic.js - CORS & 서버 연결 설정 패치 (v4)
 * ============================================================
 * [개선 버전 v4.1]
 * ✅ localhost:8000 하드코딩 제거
 * ✅ 환경 변수로 서버 주소 설정
 * ✅ AbortController로 타임아웃 처리
 * ✅ CORS 에러 처리 강화
 * ✅ 프로덕션 배포 지원
 * ✅ 다중 서버 주소 지원
 * ============================================================
 * 
 * [주요 수정 사항]
 * 1. 서버 주소 설정 시스템 구축 (하드코딩 제거)
 * 2. AbortController로 fetch 타임아웃 구현
 * 3. CORS 에러 상세 로깅 추가
 * 4. 다중 프로토콜 지원 (http, https)
 * 5. 환경 감지 (개발/프로덕션)
 * 
 * [적용 방법]
 * 1) 이 코드를 App_logic.js의 상단에 추가
 * 2) 또는 기존 코드의 서버 연결 부분을 이것으로 교체
 * 3) 필요시 서버 주소를 환경 변수로 설정
 */

// ========================================
// 1. 서버 연결 설정 (개선: v4.1)
// ========================================

/**
 * ✅ [신규] 서버 주소 자동 설정 시스템
 * 
 * 우선순위:
 * 1. window.SERVER_BASE_URL (명시적 설정)
 * 2. localStorage의 serverConfig (사용자 설정)
 * 3. 환경 감지 (개발 vs 프로덕션)
 * 4. 기본값 (localhost:8000)
 */
class ServerConfig {
    constructor() {
        this.baseUrl = this._detectServerUrl();
        this.isProduction = this._detectEnvironment();
        this.timeout = 5000; // 5초
    }
    
    /**
     * 서버 URL 자동 감지
     */
    _detectServerUrl() {
        // 1. 명시적 설정 확인
        if (typeof window !== 'undefined' && window.SERVER_BASE_URL) {
            console.log(`✅ 명시적 서버 설정: ${window.SERVER_BASE_URL}`);
            return window.SERVER_BASE_URL;
        }
        
        // 2. localStorage 사용자 설정 확인
        try {
            const saved = localStorage.getItem('serverConfig');
            if (saved) {
                const config = JSON.parse(saved);
                if (config.baseUrl) {
                    console.log(`✅ 저장된 서버 설정: ${config.baseUrl}`);
                    return config.baseUrl;
                }
            }
        } catch (e) {
            console.warn('⚠️ localStorage 읽기 실패:', e.message);
        }
        
        // 3. 환경 감지
        const detected = this._detectByEnvironment();
        if (detected) {
            console.log(`✅ 환경 감지 서버: ${detected}`);
            return detected;
        }
        
        // 4. 기본값
        const defaultUrl = 'http://localhost:8000';
        console.log(`⚠️ 기본 서버 주소 사용: ${defaultUrl}`);
        return defaultUrl;
    }
    
    /**
     * 환경 자동 감지 (개발 vs 프로덕션)
     */
    _detectByEnvironment() {
        try {
            let hostname = window.location.hostname;
            
            // ✅ [수정] 호스트명이 비어있으면 기본값 사용
            if (!hostname || hostname === '') {
                console.warn('⚠️ 호스트명이 감지되지 않음 - localhost 사용');
                hostname = 'localhost';
            }
            
            // 개발 환경
            if (hostname === 'localhost' || hostname === '127.0.0.1') {
                return 'http://localhost:8000';
            }
            
            // 프로덕션 환경 - HTTPS
            if (window.location.protocol === 'https:') {
                // 같은 도메인의 API 서버 가정
                return `https://${hostname}:8000`;
            }
            
            // 프로덕션 환경 - HTTP
            return `http://${hostname}:8000`;
        } catch (e) {
            console.warn('⚠️ 환경 감지 실패:', e.message);
            return 'http://localhost:8000'; // ✅ [수정] 기본값 설정
        }
    }
    
    /**
     * 프로덕션 환경 판정
     */
    _detectEnvironment() {
        try {
            let hostname = window.location.hostname;
            
            // ✅ [수정] 호스트명 검증
            if (!hostname || hostname === '') {
                hostname = 'localhost';
            }
            
            return hostname !== 'localhost' && hostname !== '127.0.0.1';
        } catch (e) {
            return false;
        }
    }
    
    /**
     * 서버 주소 설정
     */
    setBaseUrl(url) {
        this.baseUrl = url;
        try {
            localStorage.setItem('serverConfig', JSON.stringify({ baseUrl: url }));
            console.log(`✅ 서버 주소 저장: ${url}`);
        } catch (e) {
            console.warn('⚠️ 서버 주소 저장 실패:', e.message);
        }
    }
    
    /**
     * URL 생성 (경로 추가)
     */
    url(path = '') {
        if (!path) return this.baseUrl;
        if (path.startsWith('/')) return `${this.baseUrl}${path}`;
        return `${this.baseUrl}/${path}`;
    }
}

// 전역 서버 설정 객체
const serverConfig = new ServerConfig();

// ========================================
// 2. fetch 래퍼 함수 (타임아웃 지원)
// ========================================

/**
 * ✅ [신규] AbortController를 사용한 타임아웃 지원 fetch
 * 
 * 기본 fetch에는 timeout 옵션이 없으므로
 * AbortController를 사용하여 구현합니다.
 */
async function fetchWithTimeout(url, options = {}, timeout = 5000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        
        // 타임아웃 에러 구분
        if (error.name === 'AbortError') {
            throw new Error(`요청 타임아웃 (${timeout}ms): ${url}`);
        }
        
        throw error;
    }
}

// ========================================
// 3. 서버 연결 확인 함수 (개선: v4.1)
// ========================================

/**
 * ✅ [개선] 서버 연결 확인
 * 
 * 개선 사항:
 * 1. AbortController로 타임아웃 처리
 * 2. CORS 에러 상세 로깅
 * 3. 다양한 프로토콜 지원
 * 4. 상세한 에러 메시지
 */
async function checkServerConnection() {
    try {
        console.log(`🔗 서버 연결 확인: ${serverConfig.url('/scheduler/status')}`);
        
        const response = await fetchWithTimeout(
            serverConfig.url('/scheduler/status'),
            { method: 'GET' },
            serverConfig.timeout
        );
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ 서버 연결 성공:', data);
            return { ok: true, data };
        } else {
            console.warn(`⚠️ 서버 응답 오류: ${response.status} ${response.statusText}`);
            return { ok: false, status: response.status, error: response.statusText };
        }
    } catch (error) {
        console.error('❌ 서버 연결 실패:', error.message);
        
        // CORS 에러인지 판별
        if (error.message.includes('CORS') || error.message.includes('cross-origin')) {
            console.error('🚨 CORS 에러 - 다음을 확인하세요:');
            console.error('   1. 서버가 실행 중인가?');
            console.error('   2. 서버 주소가 정확한가?');
            console.error('   3. 서버가 CORS를 지원하는가?');
            console.error('   4. 프로토콜이 일치하는가? (http vs https)');
        }
        
        // 타임아웃 에러인지 판별
        if (error.message.includes('타임아웃')) {
            console.error('⏱️ 타임아웃 - 서버 응답이 너무 깁니다.');
        }
        
        // Mixed Content 에러 판별
        if (window.location.protocol === 'https:' && 
            serverConfig.baseUrl.startsWith('http://')) {
            console.error('🔒 Mixed Content 에러:');
            console.error('   HTTPS 페이지에서 HTTP API 호출 불가');
            console.error('   → 서버도 HTTPS로 변경하세요');
        }
        
        return { ok: false, error: error.message };
    }
}

// ========================================
// 4. 패턴 동기화 함수 (개선: v4.1)
// ========================================

/**
 * ✅ [개선] 미적중 패턴 동기화
 */
async function syncPatternsToServer() {
    try {
        console.log('🔄 미적중 패턴 동기화 시작');
        
        const warningRules = JSON.parse(
            localStorage.getItem('patternAnalyzerDB_v4') || '{}'
        );
        
        if (Object.keys(warningRules).length === 0) {
            console.log('⚠️ 동기화할 미적중 패턴 없음');
            return { ok: false, warning: 'No patterns' };
        }
        
        const response = await fetchWithTimeout(
            serverConfig.url('/sync-patterns-db'),
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ warningRules })
            },
            serverConfig.timeout
        );
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ 미적중 패턴 동기화 완료:', result);
            return { ok: true, ...result };
        } else {
            console.error(`❌ 패턴 동기화 실패: ${response.status}`);
            return { ok: false, status: response.status };
        }
    } catch (error) {
        console.error('❌ 패턴 동기화 에러:', error.message);
        return { ok: false, error: error.message };
    }
}

/**
 * ✅ [개선] 적중 패턴 동기화
 */
async function syncSuccessToServer() {
    try {
        console.log('🔄 적중 패턴 동기화 시작');
        
        const successRules = JSON.parse(
            localStorage.getItem('successAnalyzerDB_v1') || '{}'
        );
        
        if (Object.keys(successRules).length === 0) {
            console.log('⚠️ 동기화할 적중 패턴 없음');
            return { ok: false, warning: 'No patterns' };
        }
        
        const response = await fetchWithTimeout(
            serverConfig.url('/sync-success-db'),
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ successRules })
            },
            serverConfig.timeout
        );
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ 적중 패턴 동기화 완료:', result);
            return { ok: true, ...result };
        } else {
            console.error(`❌ 성공 패턴 동기화 실패: ${response.status}`);
            return { ok: false, status: response.status };
        }
    } catch (error) {
        console.error('❌ 성공 패턴 동기화 에러:', error.message);
        return { ok: false, error: error.message };
    }
}

/**
 * ✅ [개선] 통합 동기화 함수
 */
async function syncBothPatternsToServer() {
    try {
        console.log('🔄 통합 동기화 시작');
        
        const patternResult = await syncPatternsToServer();
        const successResult = await syncSuccessToServer();
        
        return {
            ok: patternResult.ok || successResult.ok,
            patterns: patternResult,
            success: successResult
        };
    } catch (error) {
        console.error('❌ 통합 동기화 에러:', error.message);
        return { ok: false, error: error.message };
    }
}

// ========================================
// 5. 재학습 데이터 전송 (개선: v4.1)
// ========================================

/**
 * ✅ [개선] 재학습 데이터 전송
 */
async function sendRetrainingData(trainingData) {
    try {
        console.log('📤 재학습 데이터 전송 시작:', trainingData.length + '개');
        
        if (!Array.isArray(trainingData)) {
            throw new Error('재학습 데이터는 배열이어야 합니다');
        }
        
        if (trainingData.length === 0) {
            throw new Error('재학습할 데이터가 없습니다');
        }
        
        const response = await fetchWithTimeout(
            serverConfig.url('/retrain-automated'),
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(trainingData)
            },
            10000 // 재학습은 더 오래 걸릴 수 있음 (10초)
        );
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ 재학습 완료:', result);
            return { ok: true, ...result };
        } else {
            console.error(`❌ 재학습 실패: ${response.status}`);
            return { ok: false, status: response.status };
        }
    } catch (error) {
        console.error('❌ 재학습 데이터 전송 에러:', error.message);
        return { ok: false, error: error.message };
    }
}

// ========================================
// 6. 예측 요청 함수 (개선: v4.1)
// ========================================

/**
 * ✅ [개선] 서버에서 확률 예측
 */
async function getProbaPredictionFromServer(features) {
    try {
        console.log('🔮 서버 확률 예측 요청');
        
        const response = await fetchWithTimeout(
            serverConfig.url('/predict-proba'),
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ features })
            },
            serverConfig.timeout
        );
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ 확률 예측 완료:', result);
            return { ok: true, ...result };
        } else {
            console.error(`❌ 예측 실패: ${response.status}`);
            return { ok: false, status: response.status };
        }
    } catch (error) {
        console.error('❌ 예측 요청 에러:', error.message);
        return { ok: false, error: error.message };
    }
}

// ========================================
// 7. 내보내기 및 초기화
// ========================================

// 글로벌 변수로 내보내기
if (typeof window !== 'undefined') {
    window.serverConfig = serverConfig;
    window.fetchWithTimeout = fetchWithTimeout;
    window.checkServerConnection = checkServerConnection;
    window.syncPatternsToServer = syncPatternsToServer;
    window.syncSuccessToServer = syncSuccessToServer;
    window.syncBothPatternsToServer = syncBothPatternsToServer;
    window.sendRetrainingData = sendRetrainingData;
    window.getProbaPredictionFromServer = getProbaPredictionFromServer;
}

// 페이지 로드 시 서버 연결 확인
if (typeof window !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
        console.log('📄 페이지 로드 완료 - 서버 연결 확인');
        await checkServerConnection();
    });
} else if (typeof window !== 'undefined') {
    // 이미 로드됨
    console.log('✅ CORS & 서버 연결 모듈 로드 완료');
}

console.log('✅ App_logic.js (CORS 개선, v4.1) 로드 완료');

/**
 * ========================================
 * 사용 예시
 * ========================================
 * 
 * 1. 서버 연결 확인:
 *    const result = await checkServerConnection();
 *    if (result.ok) { ... }
 * 
 * 2. 서버 주소 변경:
 *    serverConfig.setBaseUrl('https://api.example.com:8000');
 * 
 * 3. 패턴 동기화:
 *    const result = await syncBothPatternsToServer();
 *    if (result.ok) { ... }
 * 
 * 4. 재학습 데이터 전송:
 *    const result = await sendRetrainingData(trainingData);
 *    if (result.ok) { ... }
 * 
 * 5. 확률 예측:
 *    const result = await getProbaPredictionFromServer(features);
 *    if (result.ok) { ... }
 * 
 * ========================================
 */

// ========================================
// 전역 변수로 내보내기 (DataParserUtil)
// ========================================

if (typeof window !== 'undefined') {
    window.DataParserUtil = {
        serverConfig: serverConfig,
        fetchWithTimeout: fetchWithTimeout,
        checkServerConnection: checkServerConnection,
        syncPatternsToServer: syncPatternsToServer,
        syncSuccessToServer: syncSuccessToServer,
        syncBothPatternsToServer: syncBothPatternsToServer,
        sendRetrainingData: sendRetrainingData,
        getProbaPredictionFromServer: getProbaPredictionFromServer
    };
    console.log('✅ DataParserUtil 전역으로 내보내짐');
}