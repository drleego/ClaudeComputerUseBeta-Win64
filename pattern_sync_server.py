#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
패턴 DB 동기화 백엔드 서버
Python Flask를 사용한 REST API 서버

설치: pip install flask flask-cors
실행: python3 pattern_sync_server.py
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import os
from datetime import datetime
from pathlib import Path

app = Flask(__name__)
CORS(app)  # Cross-Origin 요청 허용

# 데이터 저장 폴더
DATA_DIR = Path('pattern_data')
DATA_DIR.mkdir(exist_ok=True)

PATTERNS_FILE = DATA_DIR / 'patterns.json'
VERSION_FILE = DATA_DIR / 'version.json'

# 초기 데이터
INITIAL_DATA = {
    "model_version": "1.0.0",
    "patterns": [
        {"name": "상승 추세 패턴", "status": "miss", "miss_rate": 65.5, "count": 120},
        {"name": "하강 추세 패턴", "status": "miss", "miss_rate": 42.3, "count": 95},
        {"name": "W자 패턴", "status": "miss", "miss_rate": 58.8, "count": 76},
        {"name": "헤드앤숄더 패턴", "status": "miss", "miss_rate": 72.1, "count": 50},
        {"name": "삼각형 패턴", "status": "miss", "miss_rate": 38.9, "count": 110},
        {"name": "황금 비율 회귀", "status": "success", "success_rate": 78.5, "count": 200},
        {"name": "볼린저 밴드 돌파", "status": "success", "success_rate": 82.3, "count": 175},
        {"name": "RSI 과매도/과매수", "status": "success", "success_rate": 71.2, "count": 150},
        {"name": "MACD 교차", "status": "success", "success_rate": 65.8, "count": 128},
        {"name": "이동평균선 교차", "status": "success", "success_rate": 88.4, "count": 220},
    ]
}

def load_patterns():
    """패턴 데이터 로드"""
    if PATTERNS_FILE.exists():
        with open(PATTERNS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return INITIAL_DATA['patterns']

def save_patterns(patterns):
    """패턴 데이터 저장"""
    with open(PATTERNS_FILE, 'w', encoding='utf-8') as f:
        json.dump(patterns, f, ensure_ascii=False, indent=2)

def load_version():
    """버전 정보 로드"""
    if VERSION_FILE.exists():
        with open(VERSION_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {"version": INITIAL_DATA['model_version'], "timestamp": datetime.now().isoformat()}

def save_version(version):
    """버전 정보 저장"""
    with open(VERSION_FILE, 'w', encoding='utf-8') as f:
        json.dump(version, f, ensure_ascii=False, indent=2)

# ========== API 엔드포인트 ==========

@app.route('/api/status', methods=['GET'])
def get_status():
    """서버 상태 확인"""
    patterns = load_patterns()
    version = load_version()
    
    return jsonify({
        'status': 'online',
        'model_version': version.get('version', '1.0.0'),
        'patterns_count': len(patterns),
        'success_count': len([p for p in patterns if p.get('status') == 'success']),
        'miss_count': len([p for p in patterns if p.get('status') == 'miss']),
        'timestamp': datetime.now().isoformat()
    })

@app.route('/api/patterns/download', methods=['GET'])
def download_patterns():
    """패턴 다운로드"""
    try:
        patterns = load_patterns()
        version = load_version()
        
        return jsonify({
            'success': True,
            'patterns': patterns,
            'version': version.get('version', '1.0.0'),
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/patterns/upload', methods=['POST'])
def upload_patterns():
    """패턴 업로드"""
    try:
        data = request.get_json()
        
        if not data or 'patterns' not in data:
            return jsonify({
                'success': False,
                'error': '패턴 데이터가 없습니다'
            }), 400
        
        patterns = data.get('patterns', [])
        version = data.get('version', '1.0.0')
        
        # 데이터 저장
        save_patterns(patterns)
        save_version({
            'version': version,
            'timestamp': data.get('timestamp', datetime.now().isoformat())
        })
        
        return jsonify({
            'success': True,
            'message': f'{len(patterns)}개 패턴이 저장되었습니다',
            'count': len(patterns),
            'version': version,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/insights', methods=['GET'])
def get_insights():
    """모델 인사이트 조회"""
    try:
        patterns = load_patterns()
        version = load_version()
        
        miss_patterns = [p for p in patterns if p.get('status') == 'miss']
        success_patterns = [p for p in patterns if p.get('status') == 'success']
        
        # 상위 패턴 정렬
        top_miss = sorted(miss_patterns, key=lambda x: x.get('miss_rate', 0), reverse=True)[:5]
        top_success = sorted(success_patterns, key=lambda x: x.get('success_rate', 0), reverse=True)[:5]
        
        return jsonify({
            'total_warning_patterns': len(miss_patterns),
            'total_success_patterns': len(success_patterns),
            'top_miss_patterns': [
                {
                    'name': p.get('name', 'Unknown'),
                    'miss_rate': f"{p.get('miss_rate', 0):.1f}%",
                    'total': p.get('count', 0)
                } for p in top_miss
            ],
            'top_success_patterns': [
                {
                    'name': p.get('name', 'Unknown'),
                    'success_rate': f"{p.get('success_rate', 0):.1f}%",
                    'total': p.get('count', 0)
                } for p in top_success
            ],
            'model_version': version.get('version', '1.0.0'),
            'ts': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        })
    except Exception as e:
        return jsonify({
            'error': str(e)
        }), 500

@app.route('/api/patterns', methods=['GET'])
def get_all_patterns():
    """모든 패턴 조회"""
    try:
        patterns = load_patterns()
        return jsonify({
            'success': True,
            'count': len(patterns),
            'patterns': patterns
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/patterns/<pattern_id>', methods=['GET'])
def get_pattern(pattern_id):
    """특정 패턴 조회"""
    try:
        patterns = load_patterns()
        if int(pattern_id) < len(patterns):
            return jsonify({
                'success': True,
                'pattern': patterns[int(pattern_id)]
            })
        else:
            return jsonify({
                'success': False,
                'error': '패턴을 찾을 수 없습니다'
            }), 404
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/reset', methods=['POST'])
def reset_data():
    """데이터 초기화 (테스트용)"""
    try:
        save_patterns(INITIAL_DATA['patterns'])
        save_version({
            'version': INITIAL_DATA['model_version'],
            'timestamp': datetime.now().isoformat()
        })
        
        return jsonify({
            'success': True,
            'message': '데이터가 초기화되었습니다'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/health', methods=['GET'])
def health_check():
    """헬스 체크"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat()
    })

# ========== 에러 핸들러 ==========

@app.errorhandler(404)
def not_found(e):
    return jsonify({
        'error': '엔드포인트를 찾을 수 없습니다',
        'status': 404
    }), 404

@app.errorhandler(500)
def internal_error(e):
    return jsonify({
        'error': '내부 서버 오류',
        'status': 500
    }), 500

# ========== 메인 ==========

if __name__ == '__main__':
    print('=' * 60)
    print('🔄 패턴 DB 동기화 백엔드 서버')
    print('=' * 60)
    print()
    print('📍 서버 시작: http://localhost:5000')
    print()
    print('📚 주요 API:')
    print('  GET  /api/status              - 서버 상태 확인')
    print('  GET  /api/patterns/download   - 패턴 다운로드')
    print('  POST /api/patterns/upload     - 패턴 업로드')
    print('  GET  /api/insights            - 모델 인사이트')
    print('  GET  /api/patterns            - 모든 패턴 조회')
    print('  POST /api/reset               - 데이터 초기화')
    print()
    print('💾 데이터 저장: ./pattern_data/')
    print()
    print('=' * 60)
    print()
    
    # 초기 데이터 생성
    if not PATTERNS_FILE.exists():
        save_patterns(INITIAL_DATA['patterns'])
        save_version({'version': INITIAL_DATA['model_version'], 'timestamp': datetime.now().isoformat()})
        print('✅ 초기 데이터 생성 완료\n')
    
    app.run(host='0.0.0.0', port=5000, debug=True)